-- Audit helpers are internal to SECURITY DEFINER routines and installed triggers.
-- Removing direct execution does not prevent those triggers from auditing writes.
revoke all on function public.append_operational_audit_trigger()
  from public, anon, authenticated, service_role;
revoke all on function public.operational_audit_snapshot(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.operational_audit_changes(jsonb, jsonb)
  from public, anon, authenticated, service_role;
