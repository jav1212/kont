-- Auth admin creation writes app_metadata after INSERT in the same transaction.
-- Defer provisioning until that transaction ends and re-read its final row.
-- Existing signups/invitations retain their behavior at commit; no existing user
-- is reprocessed, and this migration does not repair historical memberships.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_invitations_count integer;
    v_provisioned_membership jsonb;
    v_tenant_id uuid;
    v_invited_by uuid;
    v_role text;
BEGIN
    -- Deferred trigger events retain the INSERT tuple. Read the final row after
    -- Auth has updated its trusted app metadata within the same transaction.
    SELECT * INTO NEW FROM auth.users WHERE id = NEW.id;
    IF NOT FOUND THEN RETURN NULL; END IF;
    v_provisioned_membership := NEW.raw_app_meta_data -> 'provisioned_membership';

    IF v_provisioned_membership IS NOT NULL THEN
        IF jsonb_typeof(v_provisioned_membership) <> 'object'
           OR NOT (v_provisioned_membership ?& ARRAY['tenant_id', 'role', 'invited_by'])
           OR EXISTS (
               SELECT 1
               FROM jsonb_object_keys(v_provisioned_membership) AS fields(field)
               WHERE field NOT IN ('tenant_id', 'role', 'invited_by')
           )
           OR jsonb_typeof(v_provisioned_membership -> 'tenant_id') <> 'string'
           OR jsonb_typeof(v_provisioned_membership -> 'role') <> 'string'
           OR jsonb_typeof(v_provisioned_membership -> 'invited_by') <> 'string' THEN
            RAISE EXCEPTION 'invalid_direct_member_metadata';
        END IF;

        IF v_provisioned_membership ->> 'tenant_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           OR v_provisioned_membership ->> 'invited_by' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            RAISE EXCEPTION 'invalid_direct_member_metadata';
        END IF;

        v_tenant_id := (v_provisioned_membership ->> 'tenant_id')::uuid;
        v_invited_by := (v_provisioned_membership ->> 'invited_by')::uuid;
        v_role := v_provisioned_membership ->> 'role';

        IF v_role NOT IN ('admin', 'contador', 'vendedor', 'cajero') THEN
            RAISE EXCEPTION 'invalid_direct_member_role';
        END IF;

        IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = v_tenant_id) THEN
            RAISE EXCEPTION 'direct_member_tenant_not_found';
        END IF;

        -- The route independently authorizes members.invite. This guard makes
        -- privileged metadata unusable unless it names an active tenant owner/admin.
        IF NOT EXISTS (
            SELECT 1
            FROM public.tenant_memberships membership
            WHERE membership.tenant_id = v_tenant_id
              AND membership.member_id = v_invited_by
              AND membership.role IN ('owner', 'admin')
              AND membership.accepted_at IS NOT NULL
              AND membership.revoked_at IS NULL
        ) THEN
            RAISE EXCEPTION 'direct_member_inviter_not_authorized';
        END IF;

        IF v_role = 'admin' AND EXISTS (
            SELECT 1
            FROM public.tenant_memberships membership
            WHERE membership.tenant_id = v_tenant_id
              AND membership.member_id = v_invited_by
              AND membership.role = 'admin'
              AND membership.accepted_at IS NOT NULL
              AND membership.revoked_at IS NULL
        ) THEN
            RAISE EXCEPTION 'direct_member_admin_cannot_create_admin';
        END IF;

        INSERT INTO public.profiles (id, email, name, phone, created_at, updated_at)
        VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data ->> 'name', NEW.raw_user_meta_data ->> 'phone', now(), now())
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO public.tenant_memberships (tenant_id, member_id, role, invited_by, accepted_at)
        VALUES (v_tenant_id, NEW.id, v_role, v_invited_by, now());

        -- The legacy bridge must also produce the canonical organization access.
        -- Fail within the Auth transaction if a disabled/drifted bridge loses it.
        IF NOT EXISTS (
            SELECT 1
            FROM public.organizations organization
            JOIN public.organization_memberships membership
              ON membership.organization_id = organization.id AND membership.user_id = NEW.id
            JOIN public.organization_roles assigned_role
              ON assigned_role.id = membership.role_id AND assigned_role.organization_id = organization.id
            WHERE organization.legacy_tenant_id = v_tenant_id AND organization.status = 'active'
              AND membership.status = 'active' AND assigned_role.status = 'active'
              AND assigned_role.kind = 'system' AND membership.role = assigned_role.code
              AND assigned_role.code = CASE v_role
                  WHEN 'contador' THEN 'accountant' WHEN 'vendedor' THEN 'seller'
                  WHEN 'cajero' THEN 'cashier' ELSE v_role END
        ) THEN
            RAISE EXCEPTION 'direct_member_organization_link_missing';
        END IF;

        -- Direct members must neither claim outstanding invitations nor receive a tenant of their own.
        RETURN NEW;
    END IF;

    -- Existing self-registration behavior: profile, auto-accept matching pending
    -- invitations, and provision a shared tenant only when no active membership exists.
    INSERT INTO public.profiles (id, email, name, phone, created_at, updated_at)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data ->> 'name', NEW.raw_user_meta_data ->> 'phone', now(), now())
    ON CONFLICT (id) DO NOTHING;

    WITH pending AS (
        SELECT id, tenant_id, role, invited_by
        FROM public.tenant_invitations
        WHERE lower(email) = lower(NEW.email)
          AND accepted_at IS NULL
          AND expires_at > now()
    ), accepted AS (
        UPDATE public.tenant_invitations invitation
        SET accepted_at = now()
        FROM pending
        WHERE invitation.id = pending.id
        RETURNING pending.tenant_id, pending.role, pending.invited_by
    )
    INSERT INTO public.tenant_memberships (tenant_id, member_id, role, invited_by, accepted_at)
    SELECT accepted.tenant_id, NEW.id, accepted.role, accepted.invited_by, now()
    FROM accepted
    ON CONFLICT DO NOTHING;

    SELECT count(*) INTO v_invitations_count
    FROM public.tenant_memberships
    WHERE member_id = NEW.id AND revoked_at IS NULL;

    IF v_invitations_count = 0 THEN
        PERFORM public.provision_shared_tenant(NEW.id);
    END IF;

    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

-- Earlier migrations created a trigger against the legacy provisioning function.
-- Remove only the two known provisioning handlers, including deployment drift
-- under a non-canonical trigger name, before installing one canonical trigger.
DO $block$
DECLARE
    v_trigger_name text;
BEGIN
    FOR v_trigger_name IN
        SELECT trigger.tgname
        FROM pg_trigger trigger
        JOIN pg_proc procedure ON procedure.oid = trigger.tgfoid
        JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
        WHERE trigger.tgrelid = 'auth.users'::regclass
          AND NOT trigger.tgisinternal
          AND namespace.nspname = 'public'
          AND procedure.proname IN ('on_auth_user_created', 'handle_new_user')
    LOOP
        EXECUTE format('DROP TRIGGER %I ON auth.users', v_trigger_name);
    END LOOP;
END;
$block$;

CREATE CONSTRAINT TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.membership_direct_provisioning_ready()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM pg_trigger trigger
        JOIN pg_proc procedure ON procedure.oid = trigger.tgfoid
        JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
        WHERE trigger.tgrelid = 'auth.users'::regclass
          AND trigger.tgname = 'on_auth_user_created'
          AND NOT trigger.tgisinternal
          AND trigger.tgenabled IN ('O', 'A')
          AND trigger.tgtype = 5
          AND trigger.tgconstraint <> 0
          AND trigger.tgdeferrable
          AND trigger.tginitdeferred
          AND namespace.nspname = 'public'
          AND procedure.proname = 'handle_new_user'
          AND NOT EXISTS (
              SELECT 1
              FROM pg_trigger other_trigger
              JOIN pg_proc other_procedure ON other_procedure.oid = other_trigger.tgfoid
              JOIN pg_namespace other_namespace ON other_namespace.oid = other_procedure.pronamespace
              WHERE other_trigger.tgrelid = 'auth.users'::regclass
                AND NOT other_trigger.tgisinternal
                AND other_trigger.oid <> trigger.oid
                AND other_namespace.nspname = 'public'
                AND other_procedure.proname IN ('on_auth_user_created', 'handle_new_user')
          )
    );
$function$;

REVOKE ALL ON FUNCTION public.membership_direct_provisioning_ready() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.membership_direct_provisioning_ready() TO service_role;
