/** Executes the complete-purchases reimport RPC against disposable PostgreSQL.
 * It loads the production CSV posting and fiscal-recalculation functions; only
 * inventory confirmation is a counter stub because movement tables are outside
 * this import boundary. Set PGLITE_MODULE_PATH when PGlite is not installed.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(modulePath).href : '@electric-sql/pglite');
const db = new PGlite();
const tenant = '00000000-0000-4000-8000-000000000001';
const otherTenant = '00000000-0000-4000-8000-000000000002';

const invoice = (documentNumber, date, total = '10') => ({ companyId: 'company', revision: 1, documentNumber, controlNumber: '', date, currency: 'VES', subtotal: total, vatAmount: '0', total, exchangeRates: [], notes: '' });
const supplier = (id = 'supplier') => ({ id, rif: '', name: 'Proveedor, C.A.', sourceFormat: 'complete' });
const items = [{ productId: 'product', quantity: '1', unitCost: '10', totalCost: '10', vatRate: 'exenta', currency: 'VES', currencyCost: '0', exchangeRate: '1', code: 'P' }];

async function insertBatch(id, line) {
    await db.query('INSERT INTO public.shared_inventory_purchase_import_batches(tenant_id,id,company_id,revision,status) VALUES($1,$2,$3,1,$4)', [tenant, id, 'company', 'in_progress']);
    await db.query('INSERT INTO public.shared_inventory_purchase_import_lines(tenant_id,id,batch_id,source_row,expected_total) VALUES($1,$2,$3,1,10)', [tenant, line, id]);
}
async function execute(batch, line, payload, supplierPayload = supplier(), importItems = items) {
    return (await db.query('SELECT public.shared_inventory_purchase_csv_import_execute_resumable_line($1,$2,$3,$4,$5,$6,$7,$8) AS result', [tenant, batch, line, 'draft', payload, importItems, supplierPayload, []])).rows[0].result;
}

try {
    await db.exec(`
      CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE TABLE public.shared_inventory_purchase_import_batches(tenant_id uuid,id text,company_id text,revision int,status text,updated_at timestamptz default now(),primary key(tenant_id,id));
      CREATE TABLE public.shared_inventory_purchase_import_lines(tenant_id uuid,id text,batch_id text,invoice_id text,source_row int,expected_total numeric,status text default 'imported',execution_mode text,processed_at timestamptz,actual_subtotal numeric,actual_vat_amount numeric,actual_total numeric,difference_total numeric,updated_at timestamptz default now(),primary key(tenant_id,id));
      CREATE TABLE public.shared_inventory_suppliers(tenant_id uuid,id text,company_id text,rif text default '',name text,active boolean default true,primary key(tenant_id,id));
      CREATE TABLE public.shared_inventory_purchase_invoices(tenant_id uuid,id text,company_id text,supplier_id text,invoice_number text,control_number text default '',invoice_date date,period text,status text default 'borrador',subtotal numeric default 0,vat_percentage numeric default 16,vat_amount numeric default 0,total numeric default 0,notes text default '',currency_code text default 'VES',exchange_rates jsonb default '[]',source_subtotal numeric,source_vat_amount numeric,source_total numeric,calculation_basis text,document_type text,inventory_effect text,dollar_rate numeric,rate_decimals int,discount_type text,discount_value numeric,discount_amount numeric,surcharge_type text,surcharge_value numeric,surcharge_amount numeric,taxes jsonb default '[]',updated_at timestamptz default now(),primary key(tenant_id,id));
      CREATE TABLE public.shared_inventory_purchase_invoice_items(tenant_id uuid,id text,invoice_id text,product_id text,quantity numeric,unit_cost numeric,total_cost numeric,vat_rate text,currency text,currency_cost numeric,dollar_rate numeric,vat_base numeric,vat_included boolean,discount_type text,discount_value numeric,discount_amount numeric,surcharge_type text,surcharge_value numeric,surcharge_amount numeric);
      CREATE TABLE public.shared_inventory_products(tenant_id uuid,id text,company_id text,code text,active boolean default true);
      CREATE TABLE public.fixture_purchase_confirmations(count int default 0); INSERT INTO public.fixture_purchase_confirmations DEFAULT VALUES;
      CREATE OR REPLACE FUNCTION public.shared_inventory_purchase_invoice_confirm(uuid,text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN UPDATE public.fixture_purchase_confirmations SET count=count+1; UPDATE public.shared_inventory_purchase_invoices SET status='confirmada' WHERE tenant_id=$1 AND id=$2; END $$;
      INSERT INTO public.shared_inventory_suppliers VALUES('${tenant}','supplier','company','J-12345678-9','Proveedor, C.A.',true),('${otherTenant}','other','other-company','J-9','Otro',true);
      INSERT INTO public.shared_inventory_products VALUES('${tenant}','product','company','P',true);
    `);
    const migration248 = await readFile(new URL('../supabase/migrations/248_shared_purchase_csv_imports.sql', import.meta.url), 'utf8');
    const recalculateStart = migration248.indexOf('create or replace function public.shared_inventory_purchase_invoice_recalculate_totals(');
    const postingStart = migration248.indexOf('create or replace function public.shared_inventory_purchase_csv_import_execute_line(');
    await db.exec(migration248.slice(recalculateStart, postingStart));
    const end = migration248.indexOf('revoke all on function public.shared_inventory_purchase_csv_import_execute_line', postingStart);
    await db.exec(migration248.slice(postingStart, end));
    await db.exec(await readFile(new URL('../supabase/migrations/258_complete_purchase_csv_import.sql', import.meta.url), 'utf8'));

    await insertBatch('new', 'new-line');
    const created = await execute('new', 'new-line', invoice('NEW', '2026-09-01'));
    assert.equal(created.status, 'saved');
    const newInvoice = (await db.query("SELECT invoice_number,control_number,invoice_date FROM public.shared_inventory_purchase_invoices WHERE id=$1", [created.invoiceId])).rows[0];
    assert.deepEqual(newInvoice, { invoice_number: 'NEW', control_number: '', invoice_date: new Date('2026-09-01T00:00:00.000Z') });

    await insertBatch('rounded', 'rounded-line');
    const roundedItems = [{ productId: 'product', quantity: '12', unitCost: '1358.4958', totalCost: '16301.95', vatRate: 'general_16', currency: 'VES', currencyCost: '0', exchangeRate: '820.1018', code: 'ROUND' }];
    await execute('rounded', 'rounded-line', { ...invoice('ROUND', '2026-09-01', '16301.95'), vatAmount: '2608.31', total: '18910.26' }, supplier(), roundedItems);
    assert.deepEqual((await db.query("SELECT unit_cost,total_cost FROM public.shared_inventory_purchase_invoice_items i JOIN public.shared_inventory_purchase_invoices f ON f.tenant_id=i.tenant_id AND f.id=i.invoice_id WHERE f.invoice_number='ROUND'")).rows[0], { unit_cost: '1358.4958', total_cost: '16301.95' });
    assert.deepEqual((await db.query("SELECT subtotal,vat_amount,total FROM public.shared_inventory_purchase_invoices WHERE invoice_number='ROUND'")).rows[0], { subtotal: '16301.95', vat_amount: '2608.31', total: '18910.26' });

    await db.query("INSERT INTO public.shared_inventory_purchase_invoices(tenant_id,id,company_id,supplier_id,invoice_number,control_number,invoice_date,period,status,subtotal,vat_amount,total) VALUES($1,'draft','company','supplier','UPDATE','CTRL-9','2026-08-01','2026-08','borrador',1,0,1)", [tenant]);
    await db.query("INSERT INTO public.shared_inventory_purchase_invoice_items VALUES($1,'old-item','draft','product',1,1,1,'exenta','VES',1,1,1,false)", [tenant]);
    await insertBatch('update', 'update-line');
    const updated = await execute('update', 'update-line', invoice('UPDATE', '2026-09-02'));
    assert.equal(updated.invoiceId, 'draft');
    assert.deepEqual((await db.query("SELECT control_number,invoice_date FROM public.shared_inventory_purchase_invoices WHERE id='draft'")).rows[0], { control_number: 'CTRL-9', invoice_date: new Date('2026-09-02T00:00:00.000Z') });
    assert.equal((await db.query("SELECT count(*)::int AS count FROM public.shared_inventory_purchase_invoice_items WHERE invoice_id='draft'")).rows[0].count, 1);

    await db.query("INSERT INTO public.shared_inventory_purchase_invoices(tenant_id,id,company_id,supplier_id,invoice_number,control_number,invoice_date,period,status,subtotal,vat_amount,total) VALUES($1,'confirmed','company','supplier','DONE','CTRL-10','2026-01-01','2026-01','confirmada',1,0,1)", [tenant]);
    await db.query("INSERT INTO public.shared_inventory_purchase_invoice_items VALUES($1,'confirmed-item','confirmed','product',1,1,1,'exenta','VES',1,1,1,false)", [tenant]);
    await insertBatch('confirmed', 'confirmed-line');
    const skipped = await execute('confirmed', 'confirmed-line', invoice('DONE', '2026-09-03'));
    assert.deepEqual(skipped, { invoiceId: 'confirmed', status: 'confirmed', idempotent: true });
    assert.equal((await db.query("SELECT count(*)::int AS count FROM public.shared_inventory_purchase_invoice_items WHERE invoice_id='confirmed'")).rows[0].count, 1);
    assert.equal((await db.query('SELECT count FROM public.fixture_purchase_confirmations')).rows[0].count, 0);

    await insertBatch('bad-selected', 'bad-selected-line');
    await assert.rejects(execute('bad-selected', 'bad-selected-line', invoice('BAD', '2026-09-04'), supplier('other')), /no pertenece a la empresa/);
    await db.query("INSERT INTO public.shared_inventory_suppliers VALUES($1,'duplicate-name','company','J-2','Proveedor C A',true)", [tenant]);
    await insertBatch('ambiguous-name', 'ambiguous-name-line');
    await assert.rejects(execute('ambiguous-name', 'ambiguous-name-line', invoice('AMB', '2026-09-04'), { rif: '', name: 'Proveedor C.A.', sourceFormat: 'complete' }), /Proveedor ambiguo/);
    await db.query("INSERT INTO public.shared_inventory_purchase_invoices(tenant_id,id,company_id,supplier_id,invoice_number,invoice_date,period,status) VALUES($1,'duplicate-a','company','supplier','DUP','2026-01-01','2026-01','borrador'),($1,'duplicate-b','company','supplier','DUP','2026-01-02','2026-01','borrador')", [tenant]);
    await insertBatch('duplicate-invoice', 'duplicate-invoice-line');
    await assert.rejects(execute('duplicate-invoice', 'duplicate-invoice-line', invoice('DUP', '2026-09-05')), /Factura ambigua/);
    console.log('PASS: complete CSV create, draft reimport, confirmed idempotency, tenant selection, name ambiguity, and duplicate invoice guards.');
} finally {
    await db.close();
}
