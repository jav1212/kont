-- CXP-026: data for the IVA/ISLR receipt of a withholding issued at payment.
-- The PDF reuses the purchases voucher generators; reprinting never changes the
-- receipt number because it is read from the persisted withholding.
create or replace function public.shared_payables_withholding_voucher(p_scope jsonb,p_query jsonb)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_tenant uuid; v_company text:=p_scope->>'companyId'; v_row jsonb;
begin
  v_tenant:=public.assert_user_security_read_access((p_scope->>'actorId')::uuid,(p_scope->>'organizationId')::uuid,v_company,'payables.read');
  select jsonb_build_object('id',w.id,'kind',w.kind,'receiptNumber',w.receipt_number,'fiscalPeriod',w.fiscal_period,'issuedAt',w.issued_at,'status',w.status,'late',w.late,
      'taxableBaseVes',w.taxable_base_ves::text,'rate',w.rate::text,'subtrahendVes',w.subtrahend_ves::text,'taxUnitValue',w.tax_unit_value::text,'conceptCode',w.concept_code,'amountVes',w.amount_ves::text,
      'supplier',jsonb_build_object('name',s.name,'rif',s.rif,'address',nullif(s.address,'')),
      'document',jsonb_build_object('id',d.id,'number',d.document_number,'issuedAt',d.issued_at,'currency',d.currency,'principalVes',round(d.principal*d.rate_value,2)::text,
        'taxBaseVes',d.tax_base_ves::text,'vatAmountVes',d.vat_amount_ves::text,'controlNumber',(select p.control_number from public.shared_inventory_purchase_invoices p where d.source_type='purchase_invoice' and p.tenant_id=d.tenant_id and p.id=d.source_id)),
      'company',jsonb_build_object('name',c.name,'rif',coalesce(nullif(c.rif,''),c.id),'address',nullif(c.address,'')))
    into v_row
  from public.shared_payables_withholdings w
  join public.shared_payables_documents d on d.tenant_id=w.tenant_id and d.id=w.document_id
  join public.shared_inventory_suppliers s on s.tenant_id=w.tenant_id and s.id=w.supplier_id
  join public.shared_companies c on c.tenant_id=w.tenant_id and c.id=w.company_id
  where w.tenant_id=v_tenant and w.company_id=v_company and w.id=p_query->>'withholdingId';
  if v_row is null then raise exception 'PAYABLES_NOT_FOUND'; end if;
  return jsonb_build_object('rows',jsonb_build_array(v_row),'total',1);
end $$;
revoke all on function public.shared_payables_withholding_voucher(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.shared_payables_withholding_voucher(jsonb,jsonb) to service_role;
