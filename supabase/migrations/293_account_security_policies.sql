-- Organization-scoped credential controls. Browser roles have no direct access:
-- a trusted application server uses the service_role-only RPC boundary below.

CREATE TABLE IF NOT EXISTS public.account_security_policies (
    organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
    password_maximum_age_days integer CHECK (password_maximum_age_days IS NULL OR password_maximum_age_days > 0),
    inactivity_maximum_days integer CHECK (inactivity_maximum_days IS NULL OR inactivity_maximum_days > 0),
    failed_attempt_limit integer NOT NULL DEFAULT 5 CHECK (failed_attempt_limit > 0),
    failed_attempt_window_minutes integer NOT NULL DEFAULT 15 CHECK (failed_attempt_window_minutes > 0),
    lockout_minutes integer NOT NULL DEFAULT 15 CHECK (lockout_minutes > 0),
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.account_security_states (
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    password_changed_at timestamptz NOT NULL,
    last_authenticated_at timestamptz NOT NULL,
    failed_attempts timestamptz[] NOT NULL DEFAULT '{}',
    locked_until timestamptz,
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.account_security_attempts (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    attempted_at timestamptz NOT NULL,
    outcome text NOT NULL CHECK (outcome IN ('accepted', 'locked', 'password_expired', 'inactive', 'invalid_credentials')),
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (organization_id, user_id) REFERENCES public.account_security_states(organization_id, user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS account_security_attempts_lookup_idx ON public.account_security_attempts (organization_id, user_id, attempted_at DESC);

ALTER TABLE public.account_security_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_security_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_security_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_security_policies, public.account_security_states, public.account_security_attempts FROM public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.account_security_require_member(p_organization_id uuid, p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
    PERFORM 1 FROM public.organizations WHERE id = p_organization_id AND status = 'active' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_SECURITY_ORGANIZATION_NOT_FOUND'; END IF;
    PERFORM 1 FROM public.organization_memberships
      WHERE organization_id = p_organization_id AND user_id = p_user_id AND status = 'active' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_SECURITY_MEMBER_REQUIRED'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.account_security_get_policy(p_organization_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_policy public.account_security_policies;
BEGIN
    INSERT INTO public.account_security_policies (organization_id) VALUES (p_organization_id)
    ON CONFLICT (organization_id) DO NOTHING;
    SELECT * INTO v_policy FROM public.account_security_policies WHERE organization_id = p_organization_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_SECURITY_ORGANIZATION_NOT_FOUND'; END IF;
    RETURN to_jsonb(v_policy);
END $$;

CREATE OR REPLACE FUNCTION public.account_security_update_policy(
    p_organization_id uuid, p_expected_version integer, p_actor_user_id uuid, p_password_maximum_age_days integer,
    p_inactivity_maximum_days integer, p_failed_attempt_limit integer,
    p_failed_attempt_window_minutes integer, p_lockout_minutes integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_policy public.account_security_policies;
BEGIN
    PERFORM public.assert_user_security_access(p_actor_user_id, p_organization_id, NULL, 'roles.manage');
    IF p_expected_version < 1 OR p_failed_attempt_limit < 1 OR p_failed_attempt_window_minutes < 1 OR p_lockout_minutes < 1
       OR p_password_maximum_age_days IS NOT NULL AND p_password_maximum_age_days < 1
       OR p_inactivity_maximum_days IS NOT NULL AND p_inactivity_maximum_days < 1 THEN
       RAISE EXCEPTION 'ACCOUNT_SECURITY_INVALID_POLICY';
    END IF;
    UPDATE public.account_security_policies SET
      password_maximum_age_days = p_password_maximum_age_days,
      inactivity_maximum_days = p_inactivity_maximum_days,
      failed_attempt_limit = p_failed_attempt_limit,
      failed_attempt_window_minutes = p_failed_attempt_window_minutes,
      lockout_minutes = p_lockout_minutes, version = version + 1, updated_at = now()
    WHERE organization_id = p_organization_id AND version = p_expected_version
    RETURNING * INTO v_policy;
    IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_SECURITY_VERSION_CONFLICT'; END IF;
    RETURN to_jsonb(v_policy);
END $$;

CREATE OR REPLACE FUNCTION public.account_security_read_state(p_organization_id uuid, p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_state public.account_security_states;
BEGIN
    PERFORM public.account_security_require_member(p_organization_id, p_user_id);
    PERFORM public.account_security_get_policy(p_organization_id);
    INSERT INTO public.account_security_states (organization_id, user_id, password_changed_at, last_authenticated_at)
      SELECT p_organization_id, id, created_at, created_at FROM auth.users WHERE id = p_user_id
    ON CONFLICT (organization_id, user_id) DO NOTHING;
    SELECT * INTO v_state FROM public.account_security_states WHERE organization_id = p_organization_id AND user_id = p_user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_SECURITY_USER_NOT_FOUND'; END IF;
    RETURN to_jsonb(v_state) || jsonb_build_object('policy_version', (SELECT version FROM public.account_security_policies WHERE organization_id = p_organization_id));
END $$;

CREATE OR REPLACE FUNCTION public.account_security_resolve_identity(p_organization_id uuid, p_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_user_id uuid;
BEGIN
    SELECT u.id INTO v_user_id FROM auth.users u JOIN public.organization_memberships m ON m.user_id = u.id
      WHERE m.organization_id = p_organization_id AND m.status = 'active' AND lower(u.email) = lower(trim(p_email)) LIMIT 1;
    IF v_user_id IS NULL THEN RETURN NULL; END IF;
    RETURN jsonb_build_object('user_id', v_user_id);
END $$;

CREATE OR REPLACE FUNCTION public.account_security_compare_and_swap(
    p_organization_id uuid, p_user_id uuid, p_expected_version integer, p_policy_version integer,
    p_password_changed_at timestamptz, p_last_authenticated_at timestamptz,
    p_failed_attempts timestamptz[], p_locked_until timestamptz,
    p_evidence_at timestamptz, p_evidence_outcome text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    PERFORM public.account_security_require_member(p_organization_id,p_user_id);
    PERFORM 1 FROM public.account_security_policies WHERE organization_id=p_organization_id AND version=p_policy_version FOR SHARE;
    IF NOT FOUND THEN RETURN false; END IF;
    -- Recheck membership at the write boundary. A member revoked after the read
    -- cannot commit a stale authentication decision.
    IF p_evidence_outcome IS NOT NULL AND p_evidence_outcome NOT IN ('accepted', 'locked', 'password_expired', 'inactive', 'invalid_credentials') THEN
      RAISE EXCEPTION 'ACCOUNT_SECURITY_INVALID_EVIDENCE';
    END IF;
    UPDATE public.account_security_states SET password_changed_at = p_password_changed_at,
      last_authenticated_at = p_last_authenticated_at, failed_attempts = COALESCE(p_failed_attempts, '{}'),
      locked_until = p_locked_until, version = version + 1, updated_at = now()
    WHERE organization_id = p_organization_id AND user_id = p_user_id AND version = p_expected_version;
    IF NOT FOUND THEN RETURN false; END IF;
    IF p_evidence_at IS NOT NULL AND p_evidence_outcome IS NOT NULL THEN
      INSERT INTO public.account_security_attempts (organization_id, user_id, attempted_at, outcome)
      VALUES (p_organization_id, p_user_id, p_evidence_at, p_evidence_outcome);
    END IF;
    RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.account_security_mark_password_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password THEN
    -- Initialize accounts which had never logged in through the package too;
    -- otherwise their first read would incorrectly use the original signup date.
    INSERT INTO public.account_security_states(organization_id,user_id,password_changed_at,last_authenticated_at)
      SELECT m.organization_id,NEW.id,now(),now() FROM public.organization_memberships m
      WHERE m.user_id=NEW.id AND m.status='active'
      ON CONFLICT(organization_id,user_id) DO NOTHING;
    UPDATE public.account_security_states SET password_changed_at = now(), last_authenticated_at = now(), failed_attempts = '{}', locked_until = NULL, version = version + 1, updated_at = now() WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS account_security_password_changed ON auth.users;
CREATE TRIGGER account_security_password_changed AFTER UPDATE OF encrypted_password ON auth.users FOR EACH ROW EXECUTE FUNCTION public.account_security_mark_password_changed();
REVOKE ALL ON FUNCTION public.account_security_mark_password_changed() FROM public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.account_security_authorize_invitation(p_actor_user_id uuid,p_organization_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.assert_user_security_access(p_actor_user_id,p_organization_id,NULL,'members.invite');
END $$;
REVOKE ALL ON FUNCTION public.account_security_authorize_invitation(uuid,uuid) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.account_security_authorize_invitation(uuid,uuid) TO service_role;

-- Administrative recovery resets inactivity as well as temporary lockout, but
-- does not pretend the password was changed. Its age remains authoritative.
CREATE OR REPLACE FUNCTION public.account_security_unlock(p_actor_user_id uuid,p_organization_id uuid,p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.assert_user_security_access(p_actor_user_id,p_organization_id,NULL,'members.update');
  PERFORM public.account_security_read_state(p_organization_id,p_user_id);
  UPDATE public.account_security_states SET failed_attempts='{}',locked_until=NULL,
    last_authenticated_at=now(),version=version+1,updated_at=now()
    WHERE organization_id=p_organization_id AND user_id=p_user_id;
  RETURN public.account_security_read_state(p_organization_id,p_user_id);
END $$;
REVOKE ALL ON FUNCTION public.account_security_unlock(uuid,uuid,uuid) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.account_security_unlock(uuid,uuid,uuid) TO service_role;

REVOKE ALL ON FUNCTION public.account_security_require_member(uuid,uuid), public.account_security_get_policy(uuid), public.account_security_update_policy(uuid,integer,uuid,integer,integer,integer,integer,integer), public.account_security_read_state(uuid,uuid), public.account_security_resolve_identity(uuid,text), public.account_security_compare_and_swap(uuid,uuid,integer,integer,timestamptz,timestamptz,timestamptz[],timestamptz,timestamptz,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_security_get_policy(uuid), public.account_security_update_policy(uuid,integer,uuid,integer,integer,integer,integer,integer), public.account_security_read_state(uuid,uuid), public.account_security_resolve_identity(uuid,text), public.account_security_compare_and_swap(uuid,uuid,integer,integer,timestamptz,timestamptz,timestamptz[],timestamptz,timestamptz,text) TO service_role;
