-- Historical shared movements predate the operation aggregate. Expose each one
-- as an immutable posted operation so native detail navigation remains complete.
create or replace function public.get_native_inventory_operation(p_actor_user_id uuid,p_organization_id uuid,p_company_id text,p_operation_id text)returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_tenant uuid;v_result jsonb;
begin
 v_tenant:=public.native_products_assert_access(p_actor_user_id,p_organization_id,p_company_id);
 select public.native_inventory_operation_json(v_tenant,p_operation_id)into v_result;
 if v_result is not null then return v_result;end if;
 select jsonb_build_object('id',m.id,'companyId',m.company_id,'reason',public.native_inventory_legacy_reason(m.type),'effectiveDate',m.date,'status','posted','version',1,
  'source',jsonb_build_object('kind',case when m.purchase_invoice_id is not null then'purchasing'when m.type='salida'then'sales'else'migration'end,'documentId',coalesce(m.purchase_invoice_id,m.id)),
  'reference',nullif(m.reference,''),'notes',nullif(m.notes,''),'postedAt',m.created_at,'reversalOf',null,'reversedBy',null,
  'lines',jsonb_build_array(jsonb_build_object('id',m.id,'productId',p.id,'productName',p.name,'productSku',p.code,'direction',public.native_inventory_legacy_direction(m.type),'quantity',jsonb_build_object('value',m.quantity::text,'unit',public.native_product_unit(p.measure_unit)),'unitCost',jsonb_build_object('amount',m.unit_cost::text,'currency','VES'),'movementId',m.id)),
  'capabilities',jsonb_build_object('canPost',false,'canReverse',false,'canEditMetadata',false))into v_result
 from public.shared_inventory_movements m join public.shared_inventory_products p on p.tenant_id=m.tenant_id and p.id=m.product_id
 where m.tenant_id=v_tenant and m.company_id=p_company_id and m.id=p_operation_id;
 if v_result is null then raise exception'INVENTORY_OPERATION_NOT_FOUND';end if;return v_result;
end$$;
revoke all on function public.get_native_inventory_operation(uuid,uuid,text,text)from public,anon,authenticated;
grant execute on function public.get_native_inventory_operation(uuid,uuid,text,text)to service_role;
