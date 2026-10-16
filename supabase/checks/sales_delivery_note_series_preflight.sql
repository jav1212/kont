-- Read-only preflight for ADM-017/018/033 delivery-note series issuance.
-- Run through Supabase MCP before changing confirmation or credit accounting.
select jsonb_build_object(
  'salesRows', (select count(*) from public.shared_inventory_sales_invoices),
  'deliveryNotes', (select count(*) from public.shared_inventory_sales_invoices
    where document_type='nota_entrega'),
  'confirmedDeliveryNotes', (select count(*) from public.shared_inventory_sales_invoices
    where document_type='nota_entrega' and status='confirmada'),
  'confirmedCreditDeliveryNotes', (select count(*) from public.shared_inventory_sales_invoices
    where document_type='nota_entrega' and status='confirmada' and payment_terms='credito'),
  'deliveryNoteReceivables', (select count(*) from public.shared_sales_receivables r
    join public.shared_inventory_sales_invoices i
      on i.tenant_id=r.tenant_id and i.id=r.sales_invoice_id
    where i.document_type='nota_entrega'),
  'paidDeliveryNoteReceivables', (select count(distinct r.id)
    from public.shared_sales_receivables r
    join public.shared_inventory_sales_invoices i
      on i.tenant_id=r.tenant_id and i.id=r.sales_invoice_id
    join public.shared_sales_receivable_payments p
      on p.tenant_id=r.tenant_id and p.receivable_id=r.id
    where i.document_type='nota_entrega'),
  'configuredDeliveryNoteSeries', (select count(*) from public.shared_company_document_series
    where document_type='sales_delivery_note'),
  'deliveryNoteSelectionRules', (select count(*) from public.shared_company_document_series_selection_rules
    where document_type='sales_delivery_note'),
  'existingSeriesAllocationsForNotes', (select count(*)
    from public.shared_sales_invoice_series_allocations a
    join public.shared_inventory_sales_invoices i
      on i.tenant_id=a.tenant_id and i.id=a.invoice_id
    where i.document_type='nota_entrega'),
  'creditTriggerGuardsDocumentType', coalesce((select
    pg_get_functiondef('public.shared_sales_credit_confirmed_receivable()'::regprocedure)
      ~* 'document_type\s*=\s*''venta'''), false),
  'creditTriggerAttached', exists(select 1 from pg_trigger
    where tgrelid='public.shared_inventory_sales_invoices'::regclass
      and tgname='shared_sales_credit_receivable_confirmed' and not tgisinternal)
) as preflight;
