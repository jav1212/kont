-- 163_provision_new_tenants_shared.sql
-- Los tenants nuevos nacen usando las tablas shared. No se crea un schema tenant_*.

CREATE OR REPLACE FUNCTION public.provision_shared_tenant(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_plan_id uuid;
    v_schema_name text := 'tenant_' || replace(p_user_id::text, '-', '');
BEGIN
    SELECT id INTO v_plan_id FROM public.plans WHERE name = 'Emprendedor' LIMIT 1;
    IF v_plan_id IS NULL THEN
        RAISE EXCEPTION 'No existe el plan Emprendedor para provisionar el tenant %', p_user_id;
    END IF;

    INSERT INTO public.tenants (id, plan_id, status, schema_name, billing_cycle)
    VALUES (p_user_id, v_plan_id, 'trial', v_schema_name, 'monthly')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.tenant_memberships (tenant_id, member_id, role, accepted_at)
    VALUES (p_user_id, p_user_id, 'owner', now())
    ON CONFLICT (tenant_id, member_id) DO UPDATE
       SET revoked_at = NULL,
           accepted_at = COALESCE(public.tenant_memberships.accepted_at, EXCLUDED.accepted_at);

    INSERT INTO public.tenant_metrics (tenant_id)
    VALUES (p_user_id)
    ON CONFLICT (tenant_id) DO NOTHING;
END;
$function$;

REVOKE ALL ON FUNCTION public.provision_shared_tenant(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_shared_tenant(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_invitations_count integer;
BEGIN
    INSERT INTO public.profiles (id, email, name, phone, created_at, updated_at)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'phone', now(), now())
    ON CONFLICT (id) DO NOTHING;

    WITH pending AS (
        SELECT id, tenant_id, role, invited_by
        FROM public.tenant_invitations
        WHERE lower(email) = lower(NEW.email)
          AND accepted_at IS NULL
          AND expires_at > now()
    ), accepted AS (
        UPDATE public.tenant_invitations i
        SET accepted_at = now()
        FROM pending p
        WHERE i.id = p.id
        RETURNING p.tenant_id, p.role, p.invited_by
    )
    INSERT INTO public.tenant_memberships (tenant_id, member_id, role, invited_by, accepted_at)
    SELECT a.tenant_id, NEW.id, a.role, a.invited_by, now()
    FROM accepted a
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
