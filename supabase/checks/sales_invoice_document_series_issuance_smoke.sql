-- Reversible issuance test. The existing draft and every created row roll back.
begin;
set local role service_role;
do $smoke$
declare
  f record;
  note_fixture record;
  k text := replace(gen_random_uuid()::text,'-','');
  s jsonb;
  issued jsonb;
  replay jsonb;
  series_id uuid;
  next_after integer;
begin
  select i.tenant_id,i.company_id,i.id as invoice_id,i.invoice_number,c.organization_id,m.user_id as actor_user_id
    into f
  from public.shared_inventory_sales_invoices i
  join public.shared_companies c on c.tenant_id=i.tenant_id and c.id=i.company_id
  join public.organization_memberships m on m.organization_id=c.organization_id and m.status='active'
  join public.organization_roles r on r.id=m.role_id and r.organization_id=m.organization_id and r.status='active'
  where i.status='borrador' and c.status='active'
    and exists(select 1 from public.organization_role_permissions p where p.role_id=r.id and p.permission_code='sales.confirm')
    and exists(select 1 from public.organization_role_permissions p where p.role_id=r.id and p.permission_code='companies.update')
    and exists(select 1 from public.organization_role_permissions p where p.role_id=r.id and p.permission_code='inventory.negative_stock.use')
  limit 1;
  if not found then raise exception 'SMOKE_NO_AUTHORIZED_DRAFT'; end if;
  s := public.create_native_company_document_series(f.actor_user_id,f.organization_id,f.company_id,
    'issue-create-'||k,'company',null,'sales_invoice','ISS'||left(k,10),'IS'||left(k,10)||'-',1,3);
  series_id := (s->>'id')::uuid;
  perform public.configure_native_company_document_series_selection_rule(f.actor_user_id,f.organization_id,f.company_id,
    'issue-rule-'||k,'company',null,'sales_invoice',0,'company_default',series_id);
  begin
    perform public.confirm_native_sales_invoice_with_document_series_secure(
      f.actor_user_id,f.organization_id,f.company_id,f.invoice_id,'issue-fail-'||k,
      'company',null,'policy',null,true,null,null,null,null,'missing-'||k);
    raise exception 'SMOKE_EXPECTED_REGISTER_FAILURE';
  exception when raise_exception then
    if sqlerrm<>'SALES_REGISTER_INVALID' then raise; end if;
  end;
  select (entry->>'nextNumber')::integer into next_after
    from jsonb_array_elements(public.list_native_company_document_series(
      f.actor_user_id,f.organization_id,f.company_id,'company',null,'sales_invoice')) entry
    where entry->>'id'=series_id::text;
  if next_after<>1 then raise exception 'SMOKE_FAILED_CONFIRM_CONSUMED_NUMBER'; end if;
  issued := public.confirm_native_sales_invoice_with_document_series_secure(
    f.actor_user_id,f.organization_id,f.company_id,f.invoice_id,'issue-confirm-'||k,
    'company',null,'policy',null,true,null,null,null,null,null);
  if issued->>'status'<>'confirmed' or issued->>'seriesId'<>series_id::text
    or issued->>'displayNumber'<>'IS'||left(k,10)||'-00000001'
    or issued->>'number'<>'1' or issued->>'replayed'<>'false'
    then raise exception 'SMOKE_ISSUE_FAILED %',issued; end if;
  replay := public.confirm_native_sales_invoice_with_document_series_secure(
    f.actor_user_id,f.organization_id,f.company_id,f.invoice_id,'issue-confirm-'||k,
    'company',null,'policy',null,true,null,null,null,null,null);
  if replay->>'replayed'<>'true' or replay->>'displayNumber'<>issued->>'displayNumber'
    then raise exception 'SMOKE_REPLAY_FAILED'; end if;
  select (entry->>'nextNumber')::integer into next_after
    from jsonb_array_elements(public.list_native_company_document_series(
      f.actor_user_id,f.organization_id,f.company_id,'company',null,'sales_invoice')) entry
    where entry->>'id'=series_id::text;
  if next_after<>2 then raise exception 'SMOKE_COUNTER_FAILED'; end if;
  begin
    perform public.confirm_native_sales_invoice_with_document_series_secure(
      f.actor_user_id,f.organization_id,f.company_id,f.invoice_id,'issue-confirm-'||k,
      'company',null,'explicit',series_id,true,null,null,null,null,null);
    raise exception 'SMOKE_EXPECTED_IDEMPOTENCY_CONFLICT';
  exception when raise_exception then
    if sqlerrm<>'SALES_DOCUMENT_SERIES_IDEMPOTENCY_CONFLICT' then raise; end if;
  end;
  begin
    perform public.confirm_native_sales_invoice_with_document_series_secure(
      gen_random_uuid(),f.organization_id,f.company_id,f.invoice_id,'issue-denied-'||k,
      'company',null,'policy',null,true,null,null,null,null,null);
    raise exception 'SMOKE_EXPECTED_ACCESS_DENIED';
  exception when raise_exception then
    if sqlerrm not in ('ORGANIZATIONAL_USER_ACCESS_DENIED','COMPANY_ACCESS_DENIED') then raise; end if;
  end;
  select i.company_id,i.id as invoice_id,c.organization_id,m.user_id as actor_user_id into note_fixture
    from public.shared_inventory_sales_invoices i
    join public.shared_companies c on c.tenant_id=i.tenant_id and c.id=i.company_id
    join public.organization_memberships m on m.organization_id=c.organization_id and m.status='active'
    join public.organization_roles r on r.id=m.role_id and r.organization_id=m.organization_id and r.status='active'
    join public.organization_role_permissions p on p.role_id=r.id and p.permission_code='sales.confirm'
    where i.document_type='nota_entrega' limit 1;
  if not found then raise exception 'SMOKE_NO_DELIVERY_NOTE_FIXTURE'; end if;
  begin
    perform public.confirm_native_sales_invoice_with_document_series_secure(
      note_fixture.actor_user_id,note_fixture.organization_id,note_fixture.company_id,note_fixture.invoice_id,
      'issue-note-'||k,'company',null,'policy',null,false,null,null,null,null,null);
    raise exception 'SMOKE_EXPECTED_DOCUMENT_TYPE_DENIAL';
  exception when raise_exception then
    if sqlerrm<>'SALES_DOCUMENT_SERIES_INVALID' then raise; end if;
  end;
end
$smoke$;
rollback;
