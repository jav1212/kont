-- Keep trigger and internal scope helpers out of the PostgREST client surface.
alter function public.accounting_lock_posting_account() set search_path = public;
revoke all on function public.accounting_lock_posting_account() from public, anon, authenticated;

alter function public.accounting_require_scope(jsonb,text) set search_path = public;
revoke all on function public.accounting_require_scope(jsonb,text) from public, anon, authenticated;
grant execute on function public.accounting_require_scope(jsonb,text) to service_role;

-- Pin paths for helper functions; none of these helpers needs client execution.
alter function public.accounting_sync_legacy_kind() set search_path = public;
revoke all on function public.accounting_sync_legacy_kind() from public, anon, authenticated;

alter function public.accounting_code_position(jsonb,text) set search_path = public;
revoke all on function public.accounting_code_position(jsonb,text) from public, anon, authenticated;
grant execute on function public.accounting_code_position(jsonb,text) to service_role;

alter function public.accounting_protect_special_account() set search_path = public;
revoke all on function public.accounting_protect_special_account() from public, anon, authenticated;
