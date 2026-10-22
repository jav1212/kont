-- Keep confirmed commercial sources unchanged after a fiscal document has
-- entered the issuance lifecycle. Drafts remain editable and are protected by
-- source-version checks when they are revised or prepared again.

create or replace function public.shared_sales_fiscal_source_enforce_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.shared_fiscal_documents document
    where document.tenant_id = old.tenant_id
      and document.company_id = old.company_id
      and document.source_kind = 'legacy_sales_invoice'
      and document.source_id = old.id
      and (
        document.document_status in ('issued', 'received')
        or exists (
          select 1 from public.shared_fiscal_issuance_commands command
          where command.tenant_id = document.tenant_id
            and command.document_id = document.id
        )
        or exists (
          select 1 from public.shared_fiscal_issuance_attempts attempt
          where attempt.tenant_id = document.tenant_id
            and attempt.document_id = document.id
        )
      )
  ) then
    raise exception 'SALES_FISCAL_SOURCE_IMMUTABLE';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists shared_sales_invoice_fiscal_source_lifecycle
  on public.shared_inventory_sales_invoices;
create trigger shared_sales_invoice_fiscal_source_lifecycle
before update or delete on public.shared_inventory_sales_invoices
for each row execute function public.shared_sales_fiscal_source_enforce_lifecycle();

revoke all on function public.shared_sales_fiscal_source_enforce_lifecycle()
  from public, anon, authenticated;
