-- Read-only contract inspection for ADM-017/018/033 in the authorized development project.
-- Function bodies are returned for review because local migration history may differ from deployment.
with definitions(signature) as (
  values
    ('public.shared_sales_credit_confirmed_receivable()'),
    ('public.confirm_web_sales_invoice_secure(uuid,uuid,text,text,boolean,text,text,text,text)'),
    ('public.confirm_native_sales_invoice_secure(uuid,uuid,text,text,boolean,text,text,text)'),
    ('public.confirm_native_sales_invoice_branch_secure(uuid,uuid,text,text,uuid,boolean,text,text,text)'),
    ('public.shared_inventory_sales_invoice_confirm_attributed(uuid,text,uuid,boolean)')
), triggers as (
  select t.tgname, p.proname as function_name, t.tgenabled
  from pg_trigger t join pg_proc p on p.oid=t.tgfoid
  where t.tgrelid='public.shared_inventory_sales_invoices'::regclass
    and not t.tgisinternal
), note_counts as (
  select status,payment_terms,count(*)::bigint as documents
  from public.shared_inventory_sales_invoices
  where document_type='nota_entrega'
  group by status,payment_terms
)
select jsonb_build_object(
  'functions', (select jsonb_agg(jsonb_build_object(
    'signature',signature,'installed',to_regprocedure(signature) is not null,
    'definition',case when to_regprocedure(signature) is null then null
      else pg_get_functiondef(to_regprocedure(signature)) end
  ) order by signature) from definitions),
  'triggers', (select coalesce(jsonb_agg(to_jsonb(triggers) order by tgname),'[]'::jsonb) from triggers),
  'deliveryNotesByStatusAndTerms', (select coalesce(jsonb_agg(to_jsonb(note_counts)
    order by status,payment_terms),'[]'::jsonb) from note_counts),
  'creditDeliveryNoteReceivables', (select count(*) from public.shared_sales_receivables r
    join public.shared_inventory_sales_invoices i
      on i.tenant_id=r.tenant_id and i.id=r.sales_invoice_id
    where i.document_type='nota_entrega' and i.payment_terms='credito')
) as preflight;
