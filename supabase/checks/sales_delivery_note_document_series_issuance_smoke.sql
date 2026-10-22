-- ADM-017/018/033: reversible live check after preflights and migrations 365-367.
-- Requires an existing authorized delivery-note draft; all changes roll back.
begin;
set local role service_role;
do $smoke$
declare
  f record;
  k text := replace(gen_random_uuid()::text,'-','');
  created jsonb;
  issued jsonb;
  replay jsonb;
  series_id uuid;
  original_number text;
  next_after integer;
  receivables_before bigint;
begin
  select i.tenant_id,i.company_id,i.id as delivery_note_id,i.invoice_number,
    c.organization_id,m.user_id as actor_user_id into f
  from public.shared_inventory_sales_invoices i
  join public.shared_companies c on c.tenant_id=i.tenant_id and c.id=i.company_id
  join public.organization_memberships m on m.organization_id=c.organization_id and m.status='active'
  join public.organization_roles r on r.id=m.role_id and r.organization_id=m.organization_id and r.status='active'
  where i.document_type='nota_entrega' and i.status='borrador' and c.status='active'
    and exists(select 1 from public.organization_role_permissions p
      where p.role_id=r.id and p.permission_code='sales.confirm')
    and exists(select 1 from public.organization_role_permissions p
      where p.role_id=r.id and p.permission_code='companies.update')
    and exists(select 1 from public.organization_role_permissions p
      where p.role_id=r.id and p.permission_code='inventory.negative_stock.use')
  limit 1;
  if not found then raise exception 'SMOKE_NO_AUTHORIZED_DELIVERY_NOTE_DRAFT'; end if;
  original_number := f.invoice_number;
  select count(*) into receivables_before from public.shared_sales_receivables
    where tenant_id=f.tenant_id and sales_invoice_id=f.delivery_note_id;

  created := public.create_native_company_document_series(
    f.actor_user_id,f.organization_id,f.company_id,'note-create-'||k,
    'company',null,'sales_delivery_note','NE'||left(k,10),'N'||left(k,10)||'-',1,3);
  series_id := (created->>'id')::uuid;
  perform public.configure_native_company_document_series_selection_rule(
    f.actor_user_id,f.organization_id,f.company_id,'note-rule-'||k,
    'company',null,'sales_delivery_note',0,'company_default',series_id);

  begin
    perform public.confirm_native_sales_delivery_note_with_document_series_secure(
      f.actor_user_id,f.organization_id,f.company_id,f.delivery_note_id,
      'note-fail-'||k,'company',null,'policy',null,true,null,null,null,null,'missing-'||k);
    raise exception 'SMOKE_EXPECTED_REGISTER_FAILURE';
  exception when raise_exception then
    if sqlerrm<>'SALES_REGISTER_INVALID' then raise; end if;
  end;
  select (entry->>'nextNumber')::integer into next_after
    from jsonb_array_elements(public.list_native_company_document_series(
      f.actor_user_id,f.organization_id,f.company_id,'company',null,'sales_delivery_note')) entry
    where entry->>'id'=series_id::text;
  if next_after<>1 then raise exception 'SMOKE_FAILED_CONFIRM_CONSUMED_NUMBER'; end if;
  if (select status from public.shared_inventory_sales_invoices
    where tenant_id=f.tenant_id and id=f.delivery_note_id)<>'borrador'
    then raise exception 'SMOKE_FAILED_CONFIRM_CHANGED_STATUS'; end if;
  if (select invoice_number from public.shared_inventory_sales_invoices
    where tenant_id=f.tenant_id and id=f.delivery_note_id) is distinct from original_number
    then raise exception 'SMOKE_FAILED_CONFIRM_CHANGED_NUMBER'; end if;

  issued := public.confirm_native_sales_delivery_note_with_document_series_secure(
    f.actor_user_id,f.organization_id,f.company_id,f.delivery_note_id,
    'note-confirm-'||k,'company',null,'policy',null,true,null,null,null,null,null);
  if issued->>'status'<>'confirmed' or issued->>'seriesId'<>series_id::text
    or issued->>'deliveryNoteId'<>f.delivery_note_id
    or issued->>'displayNumber'<>'N'||left(k,10)||'-00000001'
    or issued->>'number'<>'1' or issued->>'replayed'<>'false'
    then raise exception 'SMOKE_DELIVERY_NOTE_ISSUE_FAILED %',issued; end if;
  replay := public.confirm_native_sales_delivery_note_with_document_series_secure(
    f.actor_user_id,f.organization_id,f.company_id,f.delivery_note_id,
    'note-confirm-'||k,'company',null,'policy',null,true,null,null,null,null,null);
  if replay->>'replayed'<>'true' or replay->>'displayNumber'<>issued->>'displayNumber'
    then raise exception 'SMOKE_DELIVERY_NOTE_REPLAY_FAILED'; end if;
  select (entry->>'nextNumber')::integer into next_after
    from jsonb_array_elements(public.list_native_company_document_series(
      f.actor_user_id,f.organization_id,f.company_id,'company',null,'sales_delivery_note')) entry
    where entry->>'id'=series_id::text;
  if next_after<>2 then raise exception 'SMOKE_DELIVERY_NOTE_COUNTER_FAILED'; end if;
  if (select count(*) from public.shared_sales_receivables
    where tenant_id=f.tenant_id and sales_invoice_id=f.delivery_note_id)<>receivables_before
    then raise exception 'SMOKE_DELIVERY_NOTE_CREATED_RECEIVABLE'; end if;
  begin
    perform public.confirm_native_sales_delivery_note_with_document_series_secure(
      f.actor_user_id,f.organization_id,f.company_id,f.delivery_note_id,
      'note-confirm-'||k,'company',null,'explicit',series_id,true,null,null,null,null,null);
    raise exception 'SMOKE_EXPECTED_IDEMPOTENCY_CONFLICT';
  exception when raise_exception then
    if sqlerrm<>'SALES_DOCUMENT_SERIES_IDEMPOTENCY_CONFLICT' then raise; end if;
  end;
end
$smoke$;
rollback;
