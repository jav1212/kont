-- Carnet sessions operate through the Web's terminal-aware HTTP guards. Their
-- provider JWTs must not bypass those guards via PostgREST RPC, Storage or Realtime.
-- Ordinary Web/native sessions and service-role adapters keep their current grants.

CREATE OR REPLACE FUNCTION public.barcode_direct_data_allowed()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT NOT EXISTS (
        SELECT 1 FROM public.barcode_access_sessions
        WHERE supabase_session_id = (
            COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'session_id'
        )::uuid
    );
$$;
REVOKE ALL ON FUNCTION public.barcode_direct_data_allowed() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.barcode_direct_data_allowed() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.barcode_check_data_request()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF NOT public.barcode_direct_data_allowed() THEN
        RAISE insufficient_privilege USING MESSAGE = 'Esta sesión requiere una terminal Web autorizada.';
    END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.barcode_check_data_request() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.barcode_check_data_request() TO anon, authenticated, service_role;

-- Preserve unknown deployment-specific request hooks rather than replacing them.
DO $$
DECLARE setting text;
BEGIN
    FOR setting IN
        SELECT unnest(COALESCE(rolconfig, ARRAY[]::text[])) FROM pg_roles WHERE rolname = 'authenticator'
        UNION ALL
        SELECT unnest(setconfig) FROM pg_db_role_setting
        WHERE setrole IN (0, (SELECT oid FROM pg_roles WHERE rolname = 'authenticator'))
          AND setdatabase IN (0, (SELECT oid FROM pg_database WHERE datname = current_database()))
    LOOP
        IF setting LIKE 'pgrst.db_pre_request=%'
           AND setting NOT IN ('pgrst.db_pre_request=', 'pgrst.db_pre_request=public.barcode_check_data_request') THEN
            RAISE EXCEPTION 'An existing PostgREST request hook must be composed with barcode_check_data_request before enabling carnet access';
        END IF;
    END LOOP;
END;
$$;
ALTER ROLE authenticator SET pgrst.db_pre_request TO 'public.barcode_check_data_request';

-- Restrictive policies add an AND condition; they never grant access on their own.
-- PostgREST's hook also covers SECURITY DEFINER RPCs which bypass table RLS.
DO $$
DECLARE relation record;
BEGIN
    FOR relation IN
        SELECT n.nspname, c.relname FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('r', 'p') AND c.relrowsecurity
          AND (n.nspname IN ('public', 'storage', 'realtime') OR n.nspname LIKE 'tenant\_%' ESCAPE '\')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS barcode_web_only ON %I.%I', relation.nspname, relation.relname);
        EXECUTE format(
            'CREATE POLICY barcode_web_only ON %I.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.barcode_direct_data_allowed())) WITH CHECK ((SELECT public.barcode_direct_data_allowed()))',
            relation.nspname, relation.relname
        );
    END LOOP;
END;
$$;

-- Login/enrollment checks this function. New RLS tables without the restrictive
-- policy make readiness false until their migration installs the same protection.
CREATE OR REPLACE FUNCTION public.barcode_access_protection_ready()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM pg_roles WHERE rolname = 'authenticator'
          AND 'pgrst.db_pre_request=public.barcode_check_data_request' = ANY(COALESCE(rolconfig, ARRAY[]::text[]))
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('r', 'p') AND c.relrowsecurity
          AND (n.nspname IN ('public', 'storage', 'realtime') OR n.nspname LIKE 'tenant\_%' ESCAPE '\')
          AND NOT EXISTS (
              SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid
                AND p.polname = 'barcode_web_only' AND NOT p.polpermissive
          )
    );
$$;
REVOKE ALL ON FUNCTION public.barcode_access_protection_ready() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.barcode_access_protection_ready() TO service_role;

COMMENT ON FUNCTION public.barcode_access_protection_ready() IS
    'Readiness for new carnet sessions; service-only. New RLS tables must preserve barcode_web_only. Never drop registry tombstones while issued JWTs may remain valid.';

NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
