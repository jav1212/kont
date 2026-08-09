-- Centralized, support-oriented error log.
-- The public table is intentionally global because errors can happen before a
-- tenant is resolved. Detailed diagnostics are never exposed to regular users.

CREATE TABLE IF NOT EXISTS public.system_error_logs (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    error_code          text NOT NULL UNIQUE,
    message             text NOT NULL,
    technical_message   text,
    stack_trace         text,
    source              text NOT NULL CHECK (source IN ('api', 'client', 'database', 'auth', 'network', 'unknown')),
    route               text,
    method              text,
    status_code         integer,
    tenant_id           uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
    user_id             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    request_id          text,
    metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.system_error_logs IS
    'Centralized application errors. Technical details are restricted to administrators.';
COMMENT ON COLUMN public.system_error_logs.error_code IS
    'Unique incident identifier shown in the error toast.';
COMMENT ON COLUMN public.system_error_logs.metadata IS
    'Non-sensitive structured context. Secrets and request bodies must never be stored.';

CREATE INDEX IF NOT EXISTS system_error_logs_created_at_idx
    ON public.system_error_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS system_error_logs_tenant_id_idx
    ON public.system_error_logs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS system_error_logs_route_idx
    ON public.system_error_logs (route, created_at DESC);

ALTER TABLE public.system_error_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS system_error_logs_admin_select ON public.system_error_logs;
CREATE POLICY system_error_logs_admin_select
    ON public.system_error_logs FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.admin_users
        WHERE admin_users.id = (SELECT auth.uid())
    ));

DROP POLICY IF EXISTS system_error_logs_service_insert ON public.system_error_logs;
CREATE POLICY system_error_logs_service_insert
    ON public.system_error_logs FOR INSERT TO service_role
    WITH CHECK (true);

REVOKE ALL ON public.system_error_logs FROM anon, authenticated;
GRANT SELECT ON public.system_error_logs TO authenticated;
GRANT INSERT ON public.system_error_logs TO service_role;
