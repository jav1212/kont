-- Commit provider acceptance and its historical VAT fact as one PostgreSQL transaction.
-- The external provider call happens before this RPC; this function records only accepted evidence.
create or replace function public.shared_fiscal_document_record_issuance_with_tax_fact(
  p_tenant_id uuid,
  p_organization_id uuid,
  p_company_id text,
  p_attempt jsonb,
  p_fact_snapshot jsonb,
  p_actor_id uuid,
  p_fact_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt jsonb;
  v_fact jsonb;
begin
  if p_attempt is null or jsonb_typeof(p_attempt) <> 'object'
    or p_fact_snapshot is null or jsonb_typeof(p_fact_snapshot) <> 'object'
    or p_attempt->>'state' <> 'accepted'
    or p_attempt->'issuedDocument' is null
    or p_fact_snapshot->'scope'->>'tenantId' is distinct from p_tenant_id::text
    or p_fact_snapshot->'scope'->>'organizationId' is distinct from p_organization_id::text
    or p_fact_snapshot->'scope'->>'companyId' is distinct from p_company_id
    or p_fact_snapshot->'source'->>'kind' <> 'fiscal_document'
    or p_fact_snapshot->'source'->>'id' is distinct from p_attempt->>'documentId'
    or p_fact_snapshot->>'direction' <> 'sale'
    or p_attempt->'issuedDocument'->>'id' is distinct from p_attempt->>'documentId'
    or p_attempt->'issuedDocument'->>'status' <> 'issued'
    or p_attempt->'issuedDocument'->>'direction' <> 'issued'
    or p_fact_snapshot->>'id' is null
    or nullif(btrim(p_actor_id::text), '') is null then
    raise exception 'TAX_REPORTING_INVALID';
  end if;

  v_attempt := public.shared_fiscal_document_record_issuance_attempt(
    p_tenant_id,
    p_organization_id,
    p_company_id,
    p_attempt->>'id',
    p_attempt->>'documentId',
    p_attempt->>'provider',
    p_attempt->>'idempotencyKey',
    p_attempt->>'state',
    p_attempt->>'requestFingerprint',
    p_attempt->>'providerReference',
    p_attempt->>'failureCode',
    p_attempt->'issuedDocument',
    (p_attempt->>'occurredAt')::timestamptz
  );

  v_fact := public.shared_tax_reporting_fact_append(
    p_tenant_id,
    p_organization_id,
    p_company_id,
    p_fact_snapshot->>'id',
    p_fact_snapshot,
    p_actor_id,
    p_fact_idempotency_key
  );

  return jsonb_build_object(
    'attempt', v_attempt->'attempt',
    'fact_snapshot', v_fact->'fact_snapshot',
    'replayed', coalesce((v_fact->>'replayed')::boolean, false)
  );
end;
$$;

revoke all on function public.shared_fiscal_document_record_issuance_with_tax_fact(uuid, uuid, text, jsonb, jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.shared_fiscal_document_record_issuance_with_tax_fact(uuid, uuid, text, jsonb, jsonb, uuid, text) to service_role;
