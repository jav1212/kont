-- Bind preview tokens to the exact mapped line intent as well as authoritative stock state.
create or replace function public.native_cross_company_transfer_snapshot(
  p_tenant_id uuid,p_company_id text,p_effective_date date,p_lines jsonb,p_side text
) returns text language sql stable set search_path=public as $$
  select encode(extensions.digest(jsonb_build_object(
    'companyId',p_company_id,'effectiveDate',p_effective_date,'requestedLines',p_lines,
    'periodClosed',exists(select 1 from public.shared_inventory_closures c where c.tenant_id=p_tenant_id
      and c.company_id=p_company_id and c.period=to_char(p_effective_date,'YYYY-MM')),
    'products',coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.id,'stock',p.current_stock,'cost',p.average_cost,'unit',p.measure_unit,
      'valuation',p.valuation_method,'composition',p.composition_kind,'active',p.active,
      'updatedAt',p.updated_at) order by p.id)
      from public.shared_inventory_products p
      join jsonb_to_recordset(p_lines) as l("sourceProductId" text,"destinationProductId" text)
        on p.id=case when p_side='source' then l."sourceProductId" else l."destinationProductId" end
      where p.tenant_id=p_tenant_id and p.company_id=p_company_id),'[]'::jsonb)
    )::text,'sha256'),'hex')
$$;
revoke all on function public.native_cross_company_transfer_snapshot(uuid,text,date,jsonb,text)
  from public,anon,authenticated,service_role;
