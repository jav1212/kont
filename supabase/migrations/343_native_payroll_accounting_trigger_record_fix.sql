-- PostgreSQL RECORD fields are resolved when a trigger branch executes.
-- Keep table-specific field access in separate PL/pgSQL statements.
create or replace function public.prevent_native_payroll_accounting_source_mutation()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_old_run_id text;
  v_old_tenant_id uuid;
  v_new_run_id text;
  v_new_tenant_id uuid;
begin
  if tg_op<>'INSERT' then
    v_old_tenant_id:=old.tenant_id;
    if tg_table_name='shared_payroll_runs' then
      v_old_run_id:=old.id;
    else
      v_old_run_id:=old.run_id;
    end if;
  end if;
  if tg_op<>'DELETE' then
    v_new_tenant_id:=new.tenant_id;
    if tg_table_name='shared_payroll_runs' then
      v_new_run_id:=new.id;
    else
      v_new_run_id:=new.run_id;
    end if;
  end if;
  if exists (
    select 1 from public.shared_native_payroll_accounting_posts p
    where ((p.tenant_id=v_old_tenant_id and p.payroll_run_id=v_old_run_id)
      or (p.tenant_id=v_new_tenant_id and p.payroll_run_id=v_new_run_id))
      and p.reversed_at is null
  ) then
    raise exception 'NATIVE_PAYROLL_ACCOUNTING_SOURCE_REQUIRES_REVERSAL';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.prevent_native_payroll_accounting_journal_mutation()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_old_entry_id text;
  v_old_tenant_id uuid;
  v_new_entry_id text;
  v_new_tenant_id uuid;
begin
  if tg_op<>'INSERT' then
    v_old_tenant_id:=old.tenant_id;
    if tg_table_name='shared_accounting_entries' then
      v_old_entry_id:=old.id;
    else
      v_old_entry_id:=old.entry_id;
    end if;
  end if;
  if tg_op<>'DELETE' then
    v_new_tenant_id:=new.tenant_id;
    if tg_table_name='shared_accounting_entries' then
      v_new_entry_id:=new.id;
    else
      v_new_entry_id:=new.entry_id;
    end if;
  end if;
  if exists (
    select 1 from public.shared_native_payroll_accounting_posts p
    where (p.tenant_id=v_old_tenant_id
      and (p.journal_entry_id=v_old_entry_id or p.reversal_entry_id=v_old_entry_id))
      or (p.tenant_id=v_new_tenant_id
      and (p.journal_entry_id=v_new_entry_id or p.reversal_entry_id=v_new_entry_id))
  ) then
    raise exception 'NATIVE_PAYROLL_ACCOUNTING_JOURNAL_IMMUTABLE';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.prevent_native_payroll_accounting_source_mutation(),
  public.prevent_native_payroll_accounting_journal_mutation()
  from public,anon,authenticated,service_role;
