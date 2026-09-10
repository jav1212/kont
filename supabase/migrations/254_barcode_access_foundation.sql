-- Server-owned credentials for browser terminals and reusable Code 128 badges.
-- RLS deliberately exposes none of this operational security state to browser roles.

CREATE TABLE IF NOT EXISTS public.barcode_access_terminals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
    secret_hash text NOT NULL UNIQUE,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
    protection_ready boolean NOT NULL DEFAULT false,
    enrolled_by uuid NOT NULL REFERENCES auth.users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    last_used_at timestamptz,
    revoked_at timestamptz,
    revoked_by uuid REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS barcode_access_terminals_tenant_idx ON public.barcode_access_terminals (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.barcode_access_badges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    code_hash text NOT NULL UNIQUE,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
    issued_by uuid NOT NULL REFERENCES auth.users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    revoked_at timestamptz,
    revoked_by uuid REFERENCES auth.users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS barcode_access_badges_one_active_user_idx
    ON public.barcode_access_badges (tenant_id, user_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS barcode_access_badges_tenant_idx ON public.barcode_access_badges (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.barcode_access_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    supabase_session_id uuid NOT NULL UNIQUE,
    -- Deliberately no foreign keys: session rows are revocation tombstones and
    -- must survive account/tenant cleanup while a provider JWT can still exist.
    user_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    terminal_id uuid NOT NULL,
    badge_id uuid NOT NULL,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'locked', 'revoked', 'expired')),
    expires_at timestamptz NOT NULL,
    last_activity_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    revoked_at timestamptz,
    revocation_reason text
);
CREATE INDEX IF NOT EXISTS barcode_access_sessions_user_idx ON public.barcode_access_sessions (user_id, status, expires_at);
CREATE INDEX IF NOT EXISTS barcode_access_sessions_terminal_idx ON public.barcode_access_sessions (terminal_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS barcode_access_sessions_one_active_terminal_idx
    ON public.barcode_access_sessions (terminal_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.barcode_access_audit (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid,
    terminal_id uuid REFERENCES public.barcode_access_terminals(id) ON DELETE SET NULL,
    badge_id uuid REFERENCES public.barcode_access_badges(id) ON DELETE SET NULL,
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    event text NOT NULL CHECK (event IN ('terminal_enrolled', 'terminal_revoked', 'badge_issued', 'badge_revoked', 'login_allowed', 'login_denied', 'session_locked')),
    reason text,
    request_fingerprint text,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS barcode_access_audit_tenant_created_idx ON public.barcode_access_audit (tenant_id, created_at DESC);

ALTER TABLE public.barcode_access_terminals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barcode_access_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barcode_access_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barcode_access_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.barcode_access_terminals, public.barcode_access_badges, public.barcode_access_sessions, public.barcode_access_audit FROM anon, authenticated;
GRANT ALL ON public.barcode_access_terminals, public.barcode_access_badges, public.barcode_access_sessions, public.barcode_access_audit TO service_role;

-- Serialize badge replacement and session creation so concurrent scans cannot
-- leave two active sessions on one terminal or revive a revoked credential.
CREATE OR REPLACE FUNCTION public.barcode_access_issue_badge(p_tenant_id uuid,p_user_id uuid,p_actor_id uuid,p_code_hash text)
RETURNS public.barcode_access_badges LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_badge public.barcode_access_badges;
BEGIN
  IF p_tenant_id<>p_user_id AND NOT EXISTS(SELECT 1 FROM public.tenant_memberships WHERE tenant_id=p_tenant_id AND member_id=p_user_id AND accepted_at IS NOT NULL AND revoked_at IS NULL) THEN RAISE EXCEPTION 'BARCODE_MEMBER_REQUIRED'; END IF;
  UPDATE public.barcode_access_badges SET status='revoked',revoked_at=now(),revoked_by=p_actor_id WHERE tenant_id=p_tenant_id AND user_id=p_user_id AND status='active';
  UPDATE public.barcode_access_sessions SET status='revoked',revoked_at=now(),revocation_reason='badge_replaced' WHERE badge_id IN(SELECT id FROM public.barcode_access_badges WHERE tenant_id=p_tenant_id AND user_id=p_user_id AND status='revoked') AND status='active';
  INSERT INTO public.barcode_access_badges(tenant_id,user_id,code_hash,issued_by) VALUES(p_tenant_id,p_user_id,p_code_hash,p_actor_id) RETURNING * INTO v_badge;
  RETURN v_badge;
END $$;
CREATE OR REPLACE FUNCTION public.barcode_access_register_session(p_supabase_session_id uuid,p_user_id uuid,p_tenant_id uuid,p_terminal_id uuid,p_badge_id uuid,p_expires_at timestamptz)
RETURNS public.barcode_access_sessions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_session public.barcode_access_sessions;
BEGIN
  PERFORM 1 FROM public.barcode_access_terminals WHERE id=p_terminal_id AND tenant_id=p_tenant_id AND status='active' AND protection_ready FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BARCODE_TERMINAL_UNAVAILABLE'; END IF;
  PERFORM 1 FROM public.barcode_access_badges WHERE id=p_badge_id AND tenant_id=p_tenant_id AND user_id=p_user_id AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BARCODE_BADGE_UNAVAILABLE'; END IF;
  PERFORM 1 FROM auth.sessions WHERE id=p_supabase_session_id AND user_id=p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'BARCODE_PROVIDER_SESSION_UNAVAILABLE'; END IF;
  PERFORM 1 FROM public.tenants WHERE id=p_tenant_id AND status IN ('active','trial');
  IF NOT FOUND THEN RAISE EXCEPTION 'BARCODE_TENANT_UNAVAILABLE'; END IF;
  IF p_tenant_id<>p_user_id AND NOT EXISTS(SELECT 1 FROM public.tenant_memberships WHERE tenant_id=p_tenant_id AND member_id=p_user_id AND accepted_at IS NOT NULL AND revoked_at IS NULL) THEN RAISE EXCEPTION 'BARCODE_MEMBER_REQUIRED'; END IF;
  UPDATE public.barcode_access_sessions SET status='locked',revoked_at=now(),revocation_reason='terminal_replaced' WHERE terminal_id=p_terminal_id AND status='active';
  INSERT INTO public.barcode_access_sessions(supabase_session_id,user_id,tenant_id,terminal_id,badge_id,expires_at) VALUES(p_supabase_session_id,p_user_id,p_tenant_id,p_terminal_id,p_badge_id,p_expires_at) RETURNING * INTO v_session;
  UPDATE public.barcode_access_terminals SET last_used_at=now() WHERE id=p_terminal_id;
  RETURN v_session;
END $$;
REVOKE ALL ON FUNCTION public.barcode_access_issue_badge(uuid,uuid,uuid,text), public.barcode_access_register_session(uuid,uuid,uuid,uuid,uuid,timestamptz) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.barcode_access_issue_badge(uuid,uuid,uuid,text), public.barcode_access_register_session(uuid,uuid,uuid,uuid,uuid,timestamptz) TO service_role;

-- Permission catalog remains additive. Existing administrators inherit this by the
-- project-wide admin role permission seeding convention; owners are allowed by code.
INSERT INTO public.shared_authorization_permissions (code, resource, action, description) VALUES
    ('access.manage', 'access', 'manage', 'Gestionar terminales y carnets')
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;
INSERT INTO public.shared_authorization_role_permissions (role, permission_code)
VALUES ('admin', 'access.manage') ON CONFLICT DO NOTHING;
