-- PostgreSQL truncates identifiers longer than 63 bytes. Expose a stable
-- PostgREST name for the atomic sales VAT issuance operation.
create or replace function public.confirm_native_sales_invoice_tax_issuance_secure(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_company_id text,
  p_invoice_id text,
  p_idempotency_key text,
  p_scope_kind text,
  p_scope_branch_id uuid,
  p_selection_kind text,
  p_series_id uuid,
  p_allow_negative_stock boolean,
  p_price_list_id text,
  p_branch_id text,
  p_device_id text,
  p_company_branch_id uuid,
  p_sales_register_id text,
  p_tenant_id uuid,
  p_source_updated_at timestamptz,
  p_fiscal_document_snapshot jsonb,
  p_issue_date date,
  p_issued_at timestamptz,
  p_fact_snapshot jsonb
) returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.confirm_native_sales_invoice_with_document_series_and_tax_fact_(
    p_actor_user_id,
    p_organization_id,
    p_company_id,
    p_invoice_id,
    p_idempotency_key,
    p_scope_kind,
    p_scope_branch_id,
    p_selection_kind,
    p_series_id,
    p_allow_negative_stock,
    p_price_list_id,
    p_branch_id,
    p_device_id,
    p_company_branch_id,
    p_sales_register_id,
    p_tenant_id,
    p_source_updated_at,
    p_fiscal_document_snapshot,
    p_issue_date,
    p_issued_at,
    p_fact_snapshot
  );
$$;

revoke all on function public.confirm_native_sales_invoice_tax_issuance_secure(
  uuid, uuid, text, text, text, text, uuid, text, uuid, boolean, text,
  text, text, uuid, text, uuid, timestamptz, jsonb, date, timestamptz, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.confirm_native_sales_invoice_tax_issuance_secure(
  uuid, uuid, text, text, text, text, uuid, text, uuid, boolean, text,
  text, text, uuid, text, uuid, timestamptz, jsonb, date, timestamptz, jsonb
) to service_role;
