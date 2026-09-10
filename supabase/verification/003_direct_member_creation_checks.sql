-- Run against a disposable database after migration 252. All fixtures roll back.
-- Exercises the actual auth trigger; GoTrue password sign-in remains an integration check.
BEGIN;

CREATE FUNCTION pg_temp.assert_member_check(condition boolean, description text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    IF condition IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Direct member check failed: %', description;
    END IF;
END;
$$;

-- Inject a membership write failure after the profile has already been inserted.
CREATE FUNCTION pg_temp.reject_member_check_fixture()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.member_id AND email LIKE '%@rollback-member-check.invalid') THEN
        RAISE EXCEPTION 'forced_membership_failure';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER direct_member_check_failure BEFORE INSERT ON public.tenant_memberships
FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_member_check_fixture();

DO $$
DECLARE
    v_owner_id uuid := gen_random_uuid();
    v_other_owner_id uuid := gen_random_uuid();
    v_admin_id uuid := gen_random_uuid();
    v_member_id uuid := gen_random_uuid();
    v_invalid_id uuid;
    v_normal_id uuid := gen_random_uuid();
    v_invited_id uuid := gen_random_uuid();
    v_spoofed_id uuid := gen_random_uuid();
    v_member_email text := gen_random_uuid()::text || '@member-check.invalid';
    v_invited_email text := gen_random_uuid()::text || '@member-check.invalid';
    payload jsonb;
    invalid_payload jsonb;
    assigned_role text;
BEGIN
    PERFORM pg_temp.assert_member_check(public.membership_direct_provisioning_ready(), 'provisioning is ready');
    PERFORM pg_temp.assert_member_check(
        NOT has_function_privilege('anon', 'public.membership_direct_provisioning_ready()', 'EXECUTE')
        AND NOT has_function_privilege('authenticated', 'public.membership_direct_provisioning_ready()', 'EXECUTE')
        AND has_function_privilege('service_role', 'public.membership_direct_provisioning_ready()', 'EXECUTE'),
        'readiness RPC is service-role only'
    );

    INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
    VALUES (v_owner_id, v_owner_id::text || '@member-check.invalid', '{}', '{}'),
           (v_other_owner_id, v_other_owner_id::text || '@member-check.invalid', '{}', '{}');

    INSERT INTO public.tenant_invitations (tenant_id, invited_by, email, role)
    VALUES (v_owner_id, v_owner_id, v_member_email, 'contador'),
           (v_other_owner_id, v_other_owner_id, v_member_email, 'admin');

    payload := jsonb_build_object('tenant_id', v_owner_id, 'invited_by', v_owner_id, 'role', 'cajero');
    v_invalid_id := gen_random_uuid();
    BEGIN
        INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
        VALUES (v_invalid_id, v_invalid_id::text || '@rollback-member-check.invalid',
                jsonb_build_object('provisioned_membership', payload), '{}');
        RAISE EXCEPTION 'Expected membership write failure';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM <> 'forced_membership_failure' THEN RAISE; END IF;
    END;
    PERFORM pg_temp.assert_member_check(
        NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_invalid_id)
        AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_invalid_id)
        AND NOT EXISTS (SELECT 1 FROM public.tenant_memberships WHERE member_id = v_invalid_id),
        'membership write failure rolls back the previously inserted auth user and profile'
    );

    INSERT INTO auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
    VALUES (v_member_id, v_member_email, now(), jsonb_build_object('provisioned_membership', payload), '{}');

    PERFORM pg_temp.assert_member_check(
        (SELECT count(*) = 1 FROM public.tenant_memberships WHERE member_id = v_member_id)
        AND EXISTS (SELECT 1 FROM public.tenant_memberships WHERE member_id = v_member_id
                    AND tenant_id = v_owner_id AND role = 'cajero' AND accepted_at IS NOT NULL AND revoked_at IS NULL)
        AND EXISTS (SELECT 1 FROM public.profiles WHERE id = v_member_id)
        AND NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = v_member_id),
        'direct cashier has a profile and only the selected business membership'
    );
    PERFORM pg_temp.assert_member_check(
        (SELECT count(*) = 2 FROM public.tenant_invitations WHERE email = v_member_email AND accepted_at IS NULL),
        'direct creation leaves all pending invitations unchanged'
    );

    FOREACH assigned_role IN ARRAY ARRAY['admin', 'contador', 'vendedor', 'cajero'] LOOP
        v_member_id := gen_random_uuid();
        INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
        VALUES (v_member_id, v_member_id::text || '@member-check.invalid',
                jsonb_build_object('provisioned_membership', payload || jsonb_build_object('role', assigned_role)), '{}');
        PERFORM pg_temp.assert_member_check(
            EXISTS (SELECT 1 FROM public.tenant_memberships WHERE member_id = v_member_id AND role = assigned_role),
            'owner can assign ' || assigned_role
        );
        IF assigned_role = 'admin' THEN v_admin_id := v_member_id; END IF;
    END LOOP;

    -- Validate trusted payloads and tenant hierarchy. Each rejected auth insert
    -- must leave no auth user, profile, membership, or newly provisioned tenant.
    FOR invalid_payload IN
        SELECT value FROM jsonb_array_elements(jsonb_build_array(
            'null'::jsonb, '{}'::jsonb, '[]'::jsonb,
            payload || '{"role":"owner"}'::jsonb,
            payload || '{"role":"contable"}'::jsonb,
            payload || '{"role":null}'::jsonb,
            payload || '{"tenant_id":"invalid"}'::jsonb,
            payload || jsonb_build_object('tenant_id', gen_random_uuid()),
            payload || jsonb_build_object('invited_by', v_other_owner_id),
            payload || jsonb_build_object('invited_by', v_admin_id, 'role', 'admin'),
            payload || '{"unexpected":true}'::jsonb
        ))
    LOOP
        v_invalid_id := gen_random_uuid();
        BEGIN
            INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
            VALUES (v_invalid_id, v_invalid_id::text || '@member-check.invalid',
                    jsonb_build_object('provisioned_membership', invalid_payload), '{}');
            RAISE EXCEPTION 'Expected rejection of direct member payload';
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM = 'Expected rejection of direct member payload' THEN RAISE; END IF;
        END;
        PERFORM pg_temp.assert_member_check(
            NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_invalid_id)
            AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_invalid_id)
            AND NOT EXISTS (SELECT 1 FROM public.tenant_memberships WHERE member_id = v_invalid_id)
            AND NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = v_invalid_id),
            'invalid payload rolls back all records'
        );
    END LOOP;

    v_member_id := gen_random_uuid();
    INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
    VALUES (v_member_id, v_member_id::text || '@member-check.invalid',
            jsonb_build_object('provisioned_membership', payload || jsonb_build_object('invited_by', v_admin_id)), '{}');
    PERFORM pg_temp.assert_member_check(
        EXISTS (SELECT 1 FROM public.tenant_memberships WHERE member_id = v_member_id AND role = 'cajero'),
        'admin can create a cashier'
    );

    -- Client-controlled user metadata must never opt into direct provisioning.
    INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
    VALUES (v_normal_id, v_normal_id::text || '@member-check.invalid', '{}', '{}'),
           (v_spoofed_id, v_spoofed_id::text || '@member-check.invalid', '{}',
            jsonb_build_object('provisioned_membership', payload));
    PERFORM pg_temp.assert_member_check(
        EXISTS (SELECT 1 FROM public.tenants WHERE id = v_normal_id)
        AND EXISTS (SELECT 1 FROM public.tenants WHERE id = v_spoofed_id)
        AND NOT EXISTS (SELECT 1 FROM public.tenant_memberships WHERE member_id = v_spoofed_id AND tenant_id = v_owner_id),
        'ordinary signup provisions a business and ignores spoofed user metadata'
    );

    INSERT INTO public.tenant_invitations (tenant_id, invited_by, email, role)
    VALUES (v_owner_id, v_owner_id, v_invited_email, 'cajero');
    INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
    VALUES (v_invited_id, v_invited_email, '{}', '{}');
    PERFORM pg_temp.assert_member_check(
        EXISTS (SELECT 1 FROM public.tenant_memberships WHERE member_id = v_invited_id AND tenant_id = v_owner_id)
        AND NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = v_invited_id)
        AND EXISTS (SELECT 1 FROM public.tenant_invitations WHERE email = v_invited_email AND accepted_at IS NOT NULL),
        'ordinary invited signup still accepts its invitation'
    );
END;
$$;

ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_created;
SELECT pg_temp.assert_member_check(NOT public.membership_direct_provisioning_ready(), 'disabled trigger is not ready');
ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_created;
ALTER TABLE auth.users ENABLE REPLICA TRIGGER on_auth_user_created;
SELECT pg_temp.assert_member_check(NOT public.membership_direct_provisioning_ready(), 'replica-only trigger is not ready');
ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_created;

ROLLBACK;
