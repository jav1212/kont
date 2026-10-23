-- Payables read RPCs are STABLE and run inside read-only PostgREST transactions.
-- The lock-taking assert_user_security_access cannot run there, so both reads use
-- the STABLE assert_user_security_read_access introduced by
-- 20261023080000_treasury_read_only_access_assertion. Bodies are otherwise
-- identical to the versions applied in 20261023140521 and 20261023140537.

create or replace function public.shared_payables_query(p_scope jsonb,p_query jsonb)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_tenant uuid; v_rows jsonb; v_total integer; v_limit integer:=least(greatest(coalesce((p_query->>'limit')::integer,50),1),200); v_offset integer:=greatest(coalesce((p_query->>'offset')::integer,0),0);
begin
  v_tenant:=public.assert_user_security_read_access((p_scope->>'actorId')::uuid,(p_scope->>'organizationId')::uuid,p_scope->>'companyId','payables.read');
  if p_query->>'kind'<>'list_documents' then raise exception 'PAYABLES_INVALID'; end if;
  select count(*) into v_total from public.shared_payables_documents d where d.tenant_id=v_tenant and d.company_id=p_scope->>'companyId' and (p_query->>'status' is null or d.status=p_query->>'status') and (p_query->>'supplierId' is null or d.supplier_id=p_query->>'supplierId');
  select coalesce(jsonb_agg(jsonb_build_object(
    'document',jsonb_build_object('id',x.id,'supplierId',x.supplier_id,'sourceType',x.source_type,'sourceId',x.source_id,'kind',x.kind,'documentNumber',x.document_number,'concept',x.concept,'issuedAt',x.issued_at::text,'dueAt',x.due_at::text,'currency',x.currency,'principal',x.principal::text,'rateSnapshot',jsonb_build_object('amount',x.rate_amount::text,'baseCurrency',x.rate_base_currency,'rate',x.rate_value::text,'source',x.rate_source,'effectiveDate',x.rate_effective_date::text,'policyVersion',x.rate_policy_version,'rounding',x.rate_rounding),'status',x.status,'version',x.version),
    'balance',greatest(x.principal-coalesce(a.applied,0),0)::text) order by x.due_at,x.id),'[]'::jsonb)
  into v_rows from (select d.* from public.shared_payables_documents d where d.tenant_id=v_tenant and d.company_id=p_scope->>'companyId' and (p_query->>'status' is null or d.status=p_query->>'status') and (p_query->>'supplierId' is null or d.supplier_id=p_query->>'supplierId') order by d.due_at,d.id offset v_offset limit v_limit)x
  left join lateral(select sum(ap.amount) applied from public.shared_payables_applications ap where ap.tenant_id=x.tenant_id and ap.document_id=x.id)a on true;
  return jsonb_build_object('rows',v_rows,'total',v_total);
end $$;

revoke all on function public.shared_payables_query(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.shared_payables_query(jsonb,jsonb) to service_role;

create or replace function public.shared_payables_reporting_query(p_scope jsonb,p_query jsonb)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare
  v_tenant uuid; v_rows jsonb; v_total integer; v_limit integer:=least(greatest(coalesce((p_query->>'limit')::integer,50),1),200);
  v_offset integer:=greatest(coalesce((p_query->>'offset')::integer,0),0); v_as_of date:=coalesce((p_query->>'asOf')::date,current_date);
begin
  v_tenant:=public.assert_user_security_read_access((p_scope->>'actorId')::uuid,(p_scope->>'organizationId')::uuid,p_scope->>'companyId','payables.read');
  if p_query->>'kind' in ('list_pending','list_settled','supplier_balance','aging','supplier_statement') then
    select count(*) into v_total from public.shared_payables_documents d
    where d.tenant_id=v_tenant and d.company_id=p_scope->>'companyId'
      and (p_query->>'supplierId' is null or d.supplier_id=p_query->>'supplierId')
      and ((p_query->>'kind'='list_pending' and d.status='open') or (p_query->>'kind'='list_settled' and d.status='settled') or p_query->>'kind' in ('supplier_balance','aging','supplier_statement'));
    select coalesce(jsonb_agg(jsonb_build_object('documentId',x.id,'supplierId',x.supplier_id,'documentNumber',x.document_number,'concept',x.concept,'kind',x.kind,'issuedAt',x.issued_at,'dueAt',x.due_at,'currency',x.currency,'principal',x.principal::text,'applied',x.applied::text,'balance',greatest(x.principal-x.applied,0)::text,'status',x.status,'daysOverdue',greatest(v_as_of-x.due_at,0)) order by x.due_at,x.id),'[]'::jsonb)
    into v_rows from (select d.*,coalesce(a.applied,0) applied from public.shared_payables_documents d
      left join lateral(select sum(ap.amount) applied from public.shared_payables_applications ap where ap.tenant_id=d.tenant_id and ap.document_id=d.id)a on true
      where d.tenant_id=v_tenant and d.company_id=p_scope->>'companyId'
        and (p_query->>'supplierId' is null or d.supplier_id=p_query->>'supplierId')
        and ((p_query->>'kind'='list_pending' and d.status='open') or (p_query->>'kind'='list_settled' and d.status='settled') or p_query->>'kind' in ('supplier_balance','aging','supplier_statement'))
      order by d.due_at,d.id offset v_offset limit v_limit)x;
    return jsonb_build_object('rows',v_rows,'total',v_total,'asOf',v_as_of);
  elsif p_query->>'kind'='payment_history' then
    select count(*) into v_total from public.shared_payables_payments p where p.tenant_id=v_tenant and p.company_id=p_scope->>'companyId'
      and (p_query->>'supplierId' is null or p.supplier_id=p_query->>'supplierId')
      and (p_query->>'from' is null or p.occurred_at>=(p_query->>'from')::date) and (p_query->>'to' is null or p.occurred_at<=(p_query->>'to')::date);
    select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'supplierId',x.supplier_id,'method',x.method,'amount',x.amount::text,'currency',x.currency,'accountKind',x.account_kind,'accountId',x.account_id,'reference',x.reference,'occurredAt',x.occurred_at,'status',x.status,'ledgerEntryId',x.ledger_entry_id,'treasuryPaymentId',x.treasury_payment_id,'applications',x.lines) order by x.occurred_at desc,x.id desc),'[]'::jsonb)
    into v_rows from (select p.*,coalesce((select jsonb_agg(jsonb_build_object('documentId',l.document_id,'amount',l.applied_amount::text,'currency',l.debt_currency,'exchangeDifferenceVes',l.exchange_difference_ves::text)) from public.shared_payables_payment_lines l where l.tenant_id=p.tenant_id and l.payment_id=p.id),'[]'::jsonb) lines
      from public.shared_payables_payments p where p.tenant_id=v_tenant and p.company_id=p_scope->>'companyId'
       and (p_query->>'supplierId' is null or p.supplier_id=p_query->>'supplierId')
       and (p_query->>'from' is null or p.occurred_at>=(p_query->>'from')::date) and (p_query->>'to' is null or p.occurred_at<=(p_query->>'to')::date)
      order by p.occurred_at desc,p.id desc offset v_offset limit v_limit)x;
    return jsonb_build_object('rows',v_rows,'total',v_total);
  elsif p_query->>'kind'='payment_batches' then
    select count(*) into v_total from public.shared_payables_payment_batches b where b.tenant_id=v_tenant and b.company_id=p_scope->>'companyId' and (p_query->>'status' is null or b.status=p_query->>'status');
    select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'supplierId',x.supplier_id,'plannedDate',x.planned_date,'currency',x.currency,'status',x.status,'version',x.version,'preparedBy',x.prepared_by,'authorizedBy',x.authorized_by,'items',x.items,'reserved',x.total::text) order by x.planned_date,x.id),'[]'::jsonb)
    into v_rows from (select b.*,coalesce((select jsonb_agg(jsonb_build_object('documentId',i.document_id,'amount',i.amount::text) order by i.document_id) from public.shared_payables_payment_batch_items i where i.tenant_id=b.tenant_id and i.batch_id=b.id),'[]'::jsonb) items,coalesce((select sum(i.amount) from public.shared_payables_payment_batch_items i where i.tenant_id=b.tenant_id and i.batch_id=b.id),0) total
      from public.shared_payables_payment_batches b where b.tenant_id=v_tenant and b.company_id=p_scope->>'companyId' and (p_query->>'status' is null or b.status=p_query->>'status') order by b.planned_date,b.id offset v_offset limit v_limit)x;
    return jsonb_build_object('rows',v_rows,'total',v_total);
  end if;
  raise exception 'PAYABLES_INVALID';
end $$;

revoke all on function public.shared_payables_reporting_query(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.shared_payables_reporting_query(jsonb,jsonb) to service_role;

-- The reservation helper is SECURITY DEFINER and accepts any tenant id; it is an
-- internal building block of shared_payables_batch_command and must not be
-- callable directly by client roles.
revoke all on function public.shared_payables_reserved_amount(uuid,text) from public,anon,authenticated;
grant execute on function public.shared_payables_reserved_amount(uuid,text) to service_role;
