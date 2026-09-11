-- Run after migration 256. The inner subtransaction rolls back every fixture.
-- Exercises Auth's INSERT -> metadata UPDATE -> deferred trigger sequence without
-- sending emails or creating persistent users. No production records are edited.
DO $checks$
DECLARE
    v_owner_id uuid := gen_random_uuid();
    v_member_id uuid;
    v_organization_id uuid;
    payload jsonb;
    assigned_role text;
    expected_role text;
    invalid_payload jsonb;
    invited_email text := gen_random_uuid()::text || '@deferred-member-check.invalid';
BEGIN
    IF NOT public.membership_direct_provisioning_ready() THEN
        RAISE EXCEPTION 'Deferred provisioning is not ready';
    END IF;
    IF has_function_privilege('anon', 'public.membership_direct_provisioning_ready()', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.membership_direct_provisioning_ready()', 'EXECUTE') THEN
        RAISE EXCEPTION 'Readiness RPC must remain service-only';
    END IF;

    BEGIN
        INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
        VALUES (v_owner_id, v_owner_id::text || '@deferred-member-check.invalid', '{}', '{}');
        SET CONSTRAINTS auth.on_auth_user_created IMMEDIATE;
        SELECT id INTO v_organization_id FROM public.organizations WHERE legacy_tenant_id = v_owner_id;
        IF v_organization_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_owner_id) THEN
            RAISE EXCEPTION 'Ordinary signup must retain profile and organization';
        END IF;

        payload := jsonb_build_object('tenant_id', v_owner_id, 'invited_by', v_owner_id);
        FOREACH assigned_role IN ARRAY ARRAY['admin', 'contador', 'vendedor', 'cajero'] LOOP
            SET CONSTRAINTS auth.on_auth_user_created DEFERRED;
            v_member_id := gen_random_uuid();
            INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
            VALUES (v_member_id, v_member_id::text || '@deferred-member-check.invalid', '{}', '{}');
            IF EXISTS (SELECT 1 FROM public.tenants WHERE id = v_member_id) THEN
                RAISE EXCEPTION 'Provisioning ran before Auth finished metadata';
            END IF;
            UPDATE auth.users SET raw_app_meta_data = jsonb_build_object(
                'provisioned_membership', payload || jsonb_build_object('role', assigned_role)
            ), email_confirmed_at = now() WHERE id = v_member_id;
            SET CONSTRAINTS auth.on_auth_user_created IMMEDIATE;

            expected_role := CASE assigned_role WHEN 'contador' THEN 'accountant'
                WHEN 'vendedor' THEN 'seller' WHEN 'cajero' THEN 'cashier' ELSE assigned_role END;
            IF (SELECT count(*) FROM public.tenant_memberships m WHERE m.member_id = v_member_id) <> 1 THEN
                RAISE EXCEPTION 'Direct member must have a legacy membership';
            END IF;
            IF NOT EXISTS (
                SELECT 1 FROM public.tenant_memberships m WHERE m.member_id = v_member_id
                AND m.tenant_id = v_owner_id AND m.role = assigned_role
                AND m.accepted_at IS NOT NULL AND m.revoked_at IS NULL
            ) OR NOT EXISTS (
                SELECT 1 FROM public.organization_memberships m
                JOIN public.organization_roles r ON r.id = m.role_id AND r.organization_id = m.organization_id
                WHERE m.user_id = v_member_id AND m.organization_id = v_organization_id
                AND m.role = expected_role AND m.status = 'active' AND r.code = expected_role AND r.status = 'active'
            ) OR EXISTS (SELECT 1 FROM public.tenants WHERE id = v_member_id) THEN
                RAISE EXCEPTION 'Direct member missing canonical access or received an own tenant';
            END IF;
        END LOOP;

        FOR invalid_payload IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
            'null'::jsonb, '{}'::jsonb,
            payload || '{"role":"owner"}'::jsonb,
            payload || jsonb_build_object('role', 'cajero', 'invited_by', gen_random_uuid())
        )) LOOP
            v_member_id := gen_random_uuid();
            BEGIN
                SET CONSTRAINTS auth.on_auth_user_created DEFERRED;
                INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
                VALUES (v_member_id, v_member_id::text || '@deferred-member-check.invalid', '{}', '{}');
                UPDATE auth.users SET raw_app_meta_data = jsonb_build_object('provisioned_membership', invalid_payload)
                WHERE id = v_member_id;
                SET CONSTRAINTS auth.on_auth_user_created IMMEDIATE;
                RAISE EXCEPTION 'invalid metadata unexpectedly accepted' USING ERRCODE = 'PZ002';
            EXCEPTION WHEN SQLSTATE 'P0001' THEN
                IF SQLERRM NOT IN ('invalid_direct_member_metadata', 'invalid_direct_member_role', 'direct_member_inviter_not_authorized') THEN
                    RAISE;
                END IF;
            END;
            IF EXISTS (SELECT 1 FROM auth.users WHERE id = v_member_id)
                OR EXISTS (SELECT 1 FROM public.profiles WHERE id = v_member_id)
                OR EXISTS (SELECT 1 FROM public.tenant_memberships m WHERE m.member_id = v_member_id) THEN
                RAISE EXCEPTION 'Invalid final metadata left an orphan account';
            END IF;
        END LOOP;

        SET CONSTRAINTS auth.on_auth_user_created DEFERRED;
        v_member_id := gen_random_uuid();
        INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
        VALUES (v_member_id, v_member_id::text || '@deferred-member-check.invalid', '{}',
            jsonb_build_object('provisioned_membership', payload || '{"role":"cajero"}'::jsonb));
        SET CONSTRAINTS auth.on_auth_user_created IMMEDIATE;
        IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = v_member_id)
           OR EXISTS (SELECT 1 FROM public.tenant_memberships m WHERE m.member_id = v_member_id AND m.tenant_id = v_owner_id) THEN
            RAISE EXCEPTION 'User-controlled metadata must never grant access';
        END IF;

        INSERT INTO public.tenant_invitations (tenant_id, invited_by, email, role)
        VALUES (v_owner_id, v_owner_id, invited_email, 'cajero');
        SET CONSTRAINTS auth.on_auth_user_created DEFERRED;
        v_member_id := gen_random_uuid();
        INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
        VALUES (v_member_id, invited_email, '{}', '{}');
        SET CONSTRAINTS auth.on_auth_user_created IMMEDIATE;
        IF NOT EXISTS (SELECT 1 FROM public.tenant_memberships m WHERE m.member_id = v_member_id AND m.tenant_id = v_owner_id)
           OR EXISTS (SELECT 1 FROM public.tenants WHERE id = v_member_id) THEN
            RAISE EXCEPTION 'Existing invitation signup behavior changed';
        END IF;

        RAISE EXCEPTION 'rollback successful verification fixtures' USING ERRCODE = 'PZ001';
    EXCEPTION WHEN SQLSTATE 'PZ001' THEN
        NULL;
    END;
    IF EXISTS (SELECT 1 FROM auth.users WHERE id = v_owner_id) THEN
        RAISE EXCEPTION 'Verification fixtures were not rolled back';
    END IF;
END;
$checks$;
