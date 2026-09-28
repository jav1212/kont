-- Carnets authenticate on any browser. Legacy sessions retain their terminal
-- binding, while new sessions carry only the server-resolved badge and tenant.
BEGIN;

ALTER TABLE public.barcode_access_sessions
    ALTER COLUMN terminal_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.barcode_access_register_session(
    p_supabase_session_id uuid,
    p_user_id uuid,
    p_tenant_id uuid,
    p_terminal_id uuid,
    p_badge_id uuid,
    p_expires_at timestamptz
)
RETURNS public.barcode_access_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session public.barcode_access_sessions;
BEGIN
    -- A supplied terminal is a legacy browser enrollment and must retain its
    -- original revocation and single-operator behavior.
    IF p_terminal_id IS NOT NULL THEN
        PERFORM 1
        FROM public.barcode_access_terminals
        WHERE id = p_terminal_id
          AND tenant_id = p_tenant_id
          AND status = 'active'
          AND protection_ready
        FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'BARCODE_TERMINAL_UNAVAILABLE';
        END IF;
    END IF;

    -- Locking the badge serializes concurrent scans and proves its tenant and
    -- holder before a provider session can be registered.
    PERFORM 1
    FROM public.barcode_access_badges
    WHERE id = p_badge_id
      AND tenant_id = p_tenant_id
      AND user_id = p_user_id
      AND status = 'active'
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'BARCODE_BADGE_UNAVAILABLE';
    END IF;

    PERFORM 1 FROM auth.sessions WHERE id = p_supabase_session_id AND user_id = p_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'BARCODE_PROVIDER_SESSION_UNAVAILABLE';
    END IF;
    PERFORM 1 FROM public.tenants WHERE id = p_tenant_id AND status IN ('active', 'trial');
    IF NOT FOUND THEN
        RAISE EXCEPTION 'BARCODE_TENANT_UNAVAILABLE';
    END IF;
    IF p_tenant_id <> p_user_id AND NOT EXISTS (
        SELECT 1 FROM public.tenant_memberships
        WHERE tenant_id = p_tenant_id
          AND member_id = p_user_id
          AND accepted_at IS NOT NULL
          AND revoked_at IS NULL
    ) THEN
        RAISE EXCEPTION 'BARCODE_MEMBER_REQUIRED';
    END IF;

    IF p_terminal_id IS NOT NULL THEN
        UPDATE public.barcode_access_sessions
        SET status = 'locked', revoked_at = now(), revocation_reason = 'terminal_replaced'
        WHERE terminal_id = p_terminal_id AND status = 'active';
    END IF;

    INSERT INTO public.barcode_access_sessions(
        supabase_session_id, user_id, tenant_id, terminal_id, badge_id, expires_at
    ) VALUES (
        p_supabase_session_id, p_user_id, p_tenant_id, p_terminal_id, p_badge_id, p_expires_at
    ) RETURNING * INTO v_session;

    IF p_terminal_id IS NOT NULL THEN
        UPDATE public.barcode_access_terminals SET last_used_at = now() WHERE id = p_terminal_id;
    END IF;
    RETURN v_session;
END;
$$;

REVOKE ALL ON FUNCTION public.barcode_access_register_session(uuid, uuid, uuid, uuid, uuid, timestamptz) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.barcode_access_register_session(uuid, uuid, uuid, uuid, uuid, timestamptz) TO service_role;

COMMENT ON COLUMN public.barcode_access_sessions.terminal_id IS
    'Legacy browser terminal only. New carnet sessions intentionally leave this null and remain scoped by badge and tenant.';

COMMIT;
