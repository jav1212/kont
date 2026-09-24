-- Application tables in public and tenant_* always need the barcode guard.
-- Supabase owns some storage/realtime relations. An RLS-enabled provider table
-- without a permissive policy already denies browser roles and must remain
-- untouched; provider tables with a permissive policy need a PUBLIC guard,
-- matching the deployed readiness contract.
DO $$
DECLARE
    relation_row record;
    policy_is_restrictive boolean;
    policy_roles oid[];
    expected_roles oid[];
BEGIN
    FOR relation_row IN
        SELECT c.oid, n.nspname, c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('r', 'p')
          AND c.relrowsecurity
          AND (
              n.nspname = 'public'
              OR n.nspname LIKE 'tenant\_%' ESCAPE '\'
              OR (
                  n.nspname IN ('storage', 'realtime')
                  AND EXISTS (
                      SELECT 1 FROM pg_policy existing_policy
                      WHERE existing_policy.polrelid = c.oid AND existing_policy.polpermissive
                  )
              )
          )
    LOOP
        expected_roles := CASE
            WHEN relation_row.nspname IN ('storage', 'realtime') THEN ARRAY[0::oid]
            ELSE ARRAY[(SELECT oid FROM pg_roles WHERE rolname = 'authenticated')]
        END;

        SELECT NOT polpermissive, polroles INTO policy_is_restrictive, policy_roles
        FROM pg_policy
        WHERE polrelid = relation_row.oid AND polname = 'barcode_web_only';

        IF FOUND AND NOT policy_is_restrictive THEN
            RAISE EXCEPTION 'Existing barcode_web_only policy on %.% is not restrictive', relation_row.nspname, relation_row.relname;
        ELSIF FOUND AND policy_roles IS DISTINCT FROM expected_roles THEN
            RAISE EXCEPTION 'Existing barcode_web_only policy on %.% has unexpected roles', relation_row.nspname, relation_row.relname;
        ELSIF NOT FOUND THEN
            EXECUTE format(
                'CREATE POLICY barcode_web_only ON %s AS RESTRICTIVE FOR ALL TO %s USING ((SELECT public.barcode_direct_data_allowed())) WITH CHECK ((SELECT public.barcode_direct_data_allowed()))',
                format('%I.%I', relation_row.nspname, relation_row.relname),
                CASE WHEN relation_row.nspname IN ('storage', 'realtime') THEN 'PUBLIC' ELSE 'authenticated' END
            );
        END IF;
    END LOOP;
END;
$$;
