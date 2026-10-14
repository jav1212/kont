-- Read-only bridge for reviewing historical IVA sources. This never reclassifies
-- a historical document with the current tax catalogue or posts it automatically.
begin;
create or replace function public.read_iva_legacy_sources(
  p_actor_user_id uuid, p_tenant_id uuid, p_organization_id uuid,
  p_company_id text, p_direction text, p_from date, p_to date,
  p_limit integer default 100, p_after_date date default null, p_after_id text default null
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_rows jsonb;
begin
  if p_actor_user_id is null or p_tenant_id is null or p_organization_id is null
     or p_company_id is null or p_direction not in ('purchase', 'sale') or p_direction is null
     or p_from is null or p_to is null or p_from > p_to
     or p_limit is null or p_limit not between 1 and 200
     or (p_after_date is null) <> (p_after_id is null) then
    raise exception 'IVA_SOURCE_QUERY_INVALID';
  end if;
  if not exists (
    select 1 from public.shared_companies c
    join public.organizations o on o.id = c.organization_id and o.status = 'active'
    where c.tenant_id = p_tenant_id and c.organization_id = p_organization_id
      and c.id = p_company_id
  ) then raise exception 'IVA_SOURCE_COMPANY_OUTSIDE_SCOPE'; end if;
  if not exists (
    select 1 from public.organization_memberships m
    where m.organization_id = p_organization_id and m.user_id = p_actor_user_id and m.status = 'active'
  ) and not exists (
    select 1 from public.organization_delegation_member_assignments a
    join public.organization_delegations d on d.id = a.delegation_id
    join public.organization_delegation_scopes s on s.delegation_id = d.id
    where a.user_id = p_actor_user_id and a.status = 'active'
      and d.client_organization_id = p_organization_id and d.status = 'active'
      and d.valid_from <= now() and (d.valid_until is null or d.valid_until > now())
      and s.scope = case p_direction when 'purchase' then 'purchases' else 'sales' end
  ) then raise exception 'IVA_SOURCE_ACCESS_DENIED'; end if;

  if p_direction = 'purchase' then
    select coalesce(jsonb_agg(q.payload order by q.invoice_date, q.id), '[]'::jsonb)
      into v_rows
    from (
      select f.invoice_date, f.id, jsonb_build_object(
        'id', f.id, 'direction', 'purchase', 'documentKind', case f.document_type
          when 'factura' then 'purchase_invoice'
          when 'nota_credito' then 'purchase_credit_note'
          when 'nota_debito' then 'purchase_debit_note'
          else 'unsupported' end,
        'date', f.invoice_date, 'period', f.period,
        'number', f.invoice_number, 'controlNumber', f.control_number,
        'counterpartyId', f.supplier_id, 'counterpartyName', s.name, 'counterpartyTaxId', s.rif,
        'currency', f.currency_code, 'exchangeRates', f.exchange_rates,
        'subtotal', f.subtotal::text, 'taxAmount', f.vat_amount::text, 'total', f.total::text,
        'sourceSubtotal', f.source_subtotal::text, 'sourceTaxAmount', f.source_vat_amount::text,
        'sourceTotal', f.source_total::text,
        'withheldAmount', f.vat_retention_amount::text,
        'withholdingCertificate', f.vat_retention_receipt_number,
        'affectedId', f.affected_invoice_id, 'affectedNumber', f.affected_invoice_number,
        'updatedAt', f.updated_at, 'calculationBasis', f.calculation_basis,
        'lines', coalesce((select jsonb_agg(jsonb_build_object(
          'id', i.id, 'rateCode', i.vat_rate, 'base', i.vat_base::text,
          'net', i.total_cost::text, 'included', i.vat_included,
          'taxAmount', i.tax_amount::text, 'taxType', i.tax_type,
          'taxValue', i.tax_value::text, 'taxConcept', i.tax_concept
        ) order by i.id) from public.shared_inventory_purchase_invoice_items i
          where i.tenant_id = f.tenant_id and i.invoice_id = f.id), '[]'::jsonb)
      ) payload
      from public.shared_inventory_purchase_invoices f
      left join public.shared_inventory_suppliers s on s.tenant_id = f.tenant_id and s.id = f.supplier_id
      where f.tenant_id = p_tenant_id and f.company_id = p_company_id and f.status = 'confirmada'
        and f.document_type in ('factura', 'nota_credito', 'nota_debito')
        and f.invoice_date between p_from and p_to
        and (p_after_date is null or (f.invoice_date, f.id) > (p_after_date, p_after_id))
      order by f.invoice_date, f.id limit p_limit + 1
    ) q;
  else
    select coalesce(jsonb_agg(q.payload order by q.invoice_date, q.id), '[]'::jsonb)
      into v_rows
    from (
      select f.invoice_date, f.id, jsonb_build_object(
        'id', f.id, 'direction', 'sale', 'documentKind', case f.document_type
          when 'venta' then 'sales_invoice'
          when 'nota_credito' then 'sales_credit_note'
          else 'unsupported' end,
        'date', f.invoice_date, 'period', f.period,
        'number', f.invoice_number, 'controlNumber', f.control_number,
        'counterpartyId', f.customer_id, 'counterpartyName', c.name, 'counterpartyTaxId', c.rif,
        'currency', f.currency_code, 'exchangeRates', f.exchange_rates,
        'subtotal', f.subtotal::text, 'taxAmount', f.vat_amount::text, 'total', f.total::text,
        'sourceSubtotal', f.source_subtotal::text, 'sourceTaxAmount', f.source_vat_amount::text,
        'sourceTotal', f.source_total::text,
        'withheldAmount', '0', 'withholdingCertificate', null,
        'affectedId', null, 'affectedNumber', null,
        'updatedAt', f.updated_at, 'calculationBasis', 'standard',
        'lines', coalesce((select jsonb_agg(jsonb_build_object(
          'id', i.id, 'rateCode', i.vat_rate, 'base', i.vat_base::text,
          'net', i.line_total::text, 'included', i.vat_included,
          'taxAmount', null, 'taxType', null, 'taxValue', null, 'taxConcept', null
        ) order by i.id) from public.shared_inventory_sales_invoice_items i
          where i.tenant_id = f.tenant_id and i.invoice_id = f.id), '[]'::jsonb)
      ) payload
      from public.shared_inventory_sales_invoices f
      left join public.shared_inventory_customers c on c.tenant_id = f.tenant_id and c.id = f.customer_id
      where f.tenant_id = p_tenant_id and f.company_id = p_company_id and f.status = 'confirmada'
        and f.document_type in ('venta', 'nota_credito')
        and f.invoice_date between p_from and p_to
        and (p_after_date is null or (f.invoice_date, f.id) > (p_after_date, p_after_id))
      order by f.invoice_date, f.id limit p_limit + 1
    ) q;
  end if;
  return jsonb_build_object('documents', coalesce((select jsonb_agg(value order by ordinality)
      from jsonb_array_elements(v_rows) with ordinality where ordinality <= p_limit), '[]'::jsonb),
    'hasMore', jsonb_array_length(v_rows) > p_limit,
    'nextCursor', case when jsonb_array_length(v_rows) > p_limit then
      (select jsonb_build_object('date', value->>'date', 'id', value->>'id')
       from jsonb_array_elements(v_rows) with ordinality where ordinality = p_limit)
      else null end);
end;
$$;
revoke all on function public.read_iva_legacy_sources(uuid,uuid,uuid,text,text,date,date,integer,date,text) from public, anon, authenticated;
grant execute on function public.read_iva_legacy_sources(uuid,uuid,uuid,text,text,date,date,integer,date,text) to service_role;
comment on function public.read_iva_legacy_sources(uuid,uuid,uuid,text,text,date,date,integer,date,text)
  is 'Historical source review only; requires trusted-server permission checks and never publishes VAT facts.';
commit;
