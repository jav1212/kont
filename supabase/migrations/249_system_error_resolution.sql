-- Support workflow for centralized incidents. Existing incidents remain pending
-- until an administrator explicitly resolves one through the server API.

ALTER TABLE public.system_error_logs
    ADD COLUMN IF NOT EXISTS resolution_status text NOT NULL DEFAULT 'pending'
        CHECK (resolution_status IN ('pending', 'resolved')),
    ADD COLUMN IF NOT EXISTS resolved_at timestamptz NULL,
    ADD COLUMN IF NOT EXISTS resolved_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.system_error_logs
    DROP CONSTRAINT IF EXISTS system_error_logs_resolution_details_check;
ALTER TABLE public.system_error_logs
    ADD CONSTRAINT system_error_logs_resolution_details_check CHECK (
        (resolution_status = 'pending' AND resolved_at IS NULL AND resolved_by IS NULL)
        OR (resolution_status = 'resolved' AND resolved_at IS NOT NULL)
    );

CREATE INDEX IF NOT EXISTS system_error_logs_resolution_status_created_at_idx
    ON public.system_error_logs (resolution_status, created_at DESC, id DESC);

-- Authenticated users retain no mutation privilege. API routes use service_role
-- after requireAdminIdentity verifies the actual cookie-session administrator.
GRANT UPDATE (resolution_status, resolved_at, resolved_by) ON public.system_error_logs TO service_role;
