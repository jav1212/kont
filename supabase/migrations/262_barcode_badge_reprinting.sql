-- New badges retain a server-encrypted printable value for explicit reprints.
-- `code_hash` remains the login verifier; legacy rows deliberately remain null.
ALTER TABLE public.barcode_access_badges
    ADD COLUMN IF NOT EXISTS code_ciphertext text;

-- Preserve the original four-argument RPC for historical callers and add an
-- atomic encrypted variant. Encryption is performed by the Web server because
-- its key must never be available to PostgreSQL roles or browser clients.
CREATE OR REPLACE FUNCTION public.barcode_access_issue_badge(p_tenant_id uuid,p_user_id uuid,p_actor_id uuid,p_code_hash text,p_code_ciphertext text)
RETURNS public.barcode_access_badges LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_badge public.barcode_access_badges;
BEGIN
  IF nullif(p_code_ciphertext,'') IS NULL THEN RAISE EXCEPTION 'BARCODE_CIPHERTEXT_REQUIRED'; END IF;
  IF p_tenant_id<>p_user_id AND NOT EXISTS(SELECT 1 FROM public.tenant_memberships WHERE tenant_id=p_tenant_id AND member_id=p_user_id AND accepted_at IS NOT NULL AND revoked_at IS NULL) THEN RAISE EXCEPTION 'BARCODE_MEMBER_REQUIRED'; END IF;
  UPDATE public.barcode_access_badges SET status='revoked',revoked_at=now(),revoked_by=p_actor_id WHERE tenant_id=p_tenant_id AND user_id=p_user_id AND status='active';
  UPDATE public.barcode_access_sessions SET status='revoked',revoked_at=now(),revocation_reason='badge_replaced' WHERE badge_id IN(SELECT id FROM public.barcode_access_badges WHERE tenant_id=p_tenant_id AND user_id=p_user_id AND status='revoked') AND status='active';
  INSERT INTO public.barcode_access_badges(tenant_id,user_id,code_hash,code_ciphertext,issued_by) VALUES(p_tenant_id,p_user_id,p_code_hash,p_code_ciphertext,p_actor_id) RETURNING * INTO v_badge;
  RETURN v_badge;
END $$;
REVOKE ALL ON FUNCTION public.barcode_access_issue_badge(uuid,uuid,uuid,text,text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.barcode_access_issue_badge(uuid,uuid,uuid,text,text) TO service_role;

ALTER TABLE public.barcode_access_audit DROP CONSTRAINT IF EXISTS barcode_access_audit_event_check;
ALTER TABLE public.barcode_access_audit ADD CONSTRAINT barcode_access_audit_event_check
    CHECK (event IN ('terminal_enrolled', 'terminal_revoked', 'badge_issued', 'badge_revoked', 'badge_reprinted', 'badges_exported', 'login_allowed', 'login_denied', 'session_locked'));
