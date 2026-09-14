/** Executes the complete-purchases reimport RPC against disposable PostgreSQL.
 * It loads the production CSV posting and fiscal-recalculation functions; only
 * inventory confirmation is a counter stub because movement tables are outside
 * this import boundary. Set PGLITE_MODULE_PATH when PGlite is not installed.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { calculatePurchaseCsvRow, parseCompletePurchaseCsv } from '../src/modules/purchases/backend/domain/purchase-csv-import.ts';

const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(modulePath).href : '@electric-sql/pglite');
const db = new PGlite();
const tenant = '00000000-0000-4000-8000-000000000001';
const otherTenant = '00000000-0000-4000-8000-000000000002';

const invoice = (documentNumber, date, total = '10') => ({ companyId: 'company', revision: 1, documentNumber, controlNumber: '', date, currency: 'VES', subtotal: total, vatAmount: '0', total, exchangeRates: [], notes: '' });
const supplier = (id = 'supplier') => ({ id, rif: '', name: 'Proveedor, C.A.', sourceFormat: 'complete' });
const items = [{ productId: 'product', quantity: '1', unitCost: '10', totalCost: '10', vatRate: 'exenta', currency: 'VES', currencyCost: '0', exchangeRate: '1', code: 'P' }];

// Sanitized from the reported one-file CSV: 16 invoices and 58 lines. The
// declared VES subtotal is deliberately retained independently of quantity ×
// displayed unit cost, which is the precision case this test protects.
const completeFixture = [
  ['INV-01', '2,1230.15,2460.3,E|2,1295.76,2591.52,E|2,2394.7,4789.4,E|2,992.32,1984.64,E'],
  ['INV-02', '3,18874.96,56624.88,I|1,21574.99,21574.99,I|1,67790.88,67790.88,I'],
  ['INV-03', '12,920.6,11047.2,I'],
  ['INV-04', '12,1358.5,16301.95,I|12,1358.5,16301.95,I|12,1358.5,16301.95,I|12,1358.5,16301.95,I|12,1639.56,19674.76,I|12,1224.75,14697.01,I'],
  ['INV-05', '12,973.55,11682.65,I|4,4069.38,16277.51,I|4,4069.38,16277.51,I|4,884.62,3538.47,I|4,884.62,3538.47,I|4,884.62,3538.47,I'],
  ['INV-06', '24,1955.64,46935.25,I'],
  ['INV-07', '5.7,7739.34,44114.24,I'],
  ['INV-08', '3.1,6737.78,20887.12,I'],
  ['INV-09', '11.4,4991.25,56900.25,I|11.4,5487.9,62562.06,I'],
  ['INV-10', '9.8,4420.12,43317.18,I'],
  ['INV-11', '18.38,7649.16,140591.56,I|23.38,3987.33,93223.78,I'],
  ['INV-12', '12,1254.76,15057.12,I|24,1254.76,30114.24,I'],
  ['INV-13', '3,1665.96,4997.88,I|6,5022.01,30132.06,E|12,2663.92,31967.04,E|3,941.63,2824.89,I|24,1722.29,41334.96,E|12,1818.87,21826.44,E'],
  ['INV-14', '16,399.17,6386.72,I|60,902.11,54126.6,I|16,375.22,6003.52,I|6,734.46,4406.76,I|24,431.1,10346.4,I|6,734.46,4406.76,I|6,734.46,4406.76,I|18,734.46,13220.28,I|6,734.46,4406.76,I|6,894.13,5364.78,I'],
  ['INV-15', '1,1265.86,1265.86,E|2,1874.75,3749.5,I|2,1201.76,2403.52,E|2,2099.08,4198.16,I|1,969.42,969.42,E|1,2339.43,2339.43,E|1,2002.94,2002.94,E'],
  ['INV-16', '6,3965.82,23794.92,E|6,2010.95,12065.7,E|10,440.65,4406.5,I|12,1137.67,13652.04,I|3,1129.66,3388.98,I'],
];
const completeColumns = 'Departamento;Fecha Aplicación;Tipo Documento;Cantidad;Codigo;Detalle;Desc %;IVA Compra;Costo Bs.;Sub Total Bs.;Costo Full Bs.;Fecha;Documento;Proveedor;Unid. Derivadas;Tasa Cambio Bs.;S. Total Otra Moneda;% Costo Ind;% Costo Dir.;';
function completeCsv() {
    return `Empresa\nJ003634352\n\n${completeColumns}\n${completeFixture.flatMap(([documentNumber, packed], invoiceIndex) => packed.split('|').map((line, itemIndex) => {
        const [quantity, cost, subtotal, tax] = line.split(',');
        const ve = (value) => value.replace('.', ',');
        return `A;09/09/2026;Factura;${ve(quantity)};P${invoiceIndex + 1}_${itemIndex + 1};Producto ${invoiceIndex + 1}-${itemIndex + 1};0;${tax === 'I' ? 'IVA1' : 'EXENTO'};${ve(cost)};${ve(subtotal)};${ve(cost)};08/09/2026;${documentNumber};Proveedor ${invoiceIndex + 1};1;820,1018;0;0;0;`;
    })).join('\n')}\n`;
}
function calculatedCompleteRows(costsIncludeVat) {
    const parsed = parseCompletePurchaseCsv(completeCsv());
    assert.deepEqual(parsed.errors, []);
    assert.equal(parsed.rows.length, 16);
    assert.equal(parsed.rows.reduce((count, row) => count + row.items.length, 0), 58);
    return parsed.rows.map((row) => {
        const calculation = calculatePurchaseCsvRow({ ...row, productResolutions: Object.fromEntries(row.items.map((item) => [item.code, { productId: 'product' }])) }, { costsIncludeVat, reviewed: true, vatMappings: { IVA1: 'general_16', EXENTO: 'exenta' } });
        assert.deepEqual(calculation.errors, []);
        return { header: row.header, calculation };
    });
}
function calculationInvoice(header, calculation) {
    return { companyId: 'company', revision: 1, documentNumber: header.documentNumber, controlNumber: '', date: header.date, currency: 'VES', subtotal: calculation.subtotal, vatAmount: calculation.vatAmount, total: calculation.total, exchangeRates: [], notes: '', dollarRate: header.exchangeRate };
}

async function insertBatch(id, line, sourceHeader = {}) {
    await db.query('INSERT INTO public.shared_inventory_purchase_import_batches(tenant_id,id,company_id,revision,status) VALUES($1,$2,$3,1,$4)', [tenant, id, 'company', 'in_progress']);
    await db.query('INSERT INTO public.shared_inventory_purchase_import_lines(tenant_id,id,batch_id,source_row,expected_total,source_header) VALUES($1,$2,$3,1,10,$4)', [tenant, line, id, sourceHeader]);
}
async function execute(batch, line, payload, supplierPayload = supplier(), importItems = items) {
    return (await db.query('SELECT public.shared_inventory_purchase_csv_import_execute_resumable_line($1,$2,$3,$4,$5,$6,$7,$8) AS result', [tenant, batch, line, 'draft', payload, importItems, supplierPayload, []])).rows[0].result;
}

try {
    await db.exec(`
      CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE TABLE public.shared_inventory_purchase_import_batches(tenant_id uuid,id text,company_id text,revision int,status text,updated_at timestamptz default now(),primary key(tenant_id,id));
      CREATE TABLE public.shared_inventory_purchase_import_lines(tenant_id uuid,id text,batch_id text,invoice_id text,source_row int,expected_total numeric(14,2),source_header jsonb not null default '{}'::jsonb,status text default 'imported',execution_mode text,processed_at timestamptz,actual_subtotal numeric(14,2),actual_vat_amount numeric(14,2),actual_total numeric(14,2),difference_total numeric(14,2),updated_at timestamptz default now(),primary key(tenant_id,id));
      CREATE TABLE public.shared_inventory_suppliers(tenant_id uuid,id text,company_id text,rif text default '',name text,active boolean default true,primary key(tenant_id,id));
      CREATE TABLE public.shared_inventory_purchase_invoices(tenant_id uuid,id text,company_id text,supplier_id text,invoice_number text,control_number text default '',invoice_date date,period text,status text default 'borrador',subtotal numeric(14,2) default 0,vat_percentage numeric default 16,vat_amount numeric(14,2) default 0,total numeric(14,2) default 0,notes text default '',currency_code text default 'VES',exchange_rates jsonb default '[]',source_subtotal numeric,source_vat_amount numeric,source_total numeric,calculation_basis text,document_type text,inventory_effect text,dollar_rate numeric(12,4),rate_decimals int,discount_type text,discount_value numeric(14,4),discount_amount numeric(14,2),surcharge_type text,surcharge_value numeric(14,4),surcharge_amount numeric(14,2),taxes jsonb default '[]',updated_at timestamptz default now(),primary key(tenant_id,id));
      CREATE TABLE public.shared_inventory_purchase_invoice_items(tenant_id uuid,id text,invoice_id text,product_id text,quantity numeric(14,4),unit_cost numeric(14,4),total_cost numeric(14,2),vat_rate text,currency text,currency_cost numeric(12,4),dollar_rate numeric(12,4),vat_base numeric(14,4),vat_included boolean,discount_type text,discount_value numeric(14,4),discount_amount numeric(14,2),surcharge_type text,surcharge_value numeric(14,4),surcharge_amount numeric(14,2));
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
    await db.exec(await readFile(new URL('../supabase/migrations/259_purchase_csv_authoritative_totals.sql', import.meta.url), 'utf8'));

    await insertBatch('new', 'new-line');
    const created = await execute('new', 'new-line', invoice('NEW', '2026-09-01'));
    assert.equal(created.status, 'saved');
    const newInvoice = (await db.query("SELECT invoice_number,control_number,invoice_date FROM public.shared_inventory_purchase_invoices WHERE id=$1", [created.invoiceId])).rows[0];
    assert.deepEqual(newInvoice, { invoice_number: 'NEW', control_number: '', invoice_date: new Date('2026-09-01T00:00:00.000Z') });

    await insertBatch('rounded', 'rounded-line');
    // The report shows 1,358.50 but declares 16,301.95. Multiplication would
    // produce 16,302.00 and therefore used to conceal the production defect.
    const roundedItems = [{ productId: 'product', quantity: '12', unitCost: '1358.5', totalCost: '16301.95', vatRate: 'general_16', currency: 'VES', currencyCost: '0', exchangeRate: '820.1018', code: 'ROUND' }];
    await execute('rounded', 'rounded-line', { ...invoice('ROUND', '2026-09-01', '16301.95'), vatAmount: '2608.31', total: '18910.26' }, supplier(), roundedItems);
    assert.deepEqual((await db.query("SELECT unit_cost,total_cost,vat_base FROM public.shared_inventory_purchase_invoice_items i JOIN public.shared_inventory_purchase_invoices f ON f.tenant_id=i.tenant_id AND f.id=i.invoice_id WHERE f.invoice_number='ROUND'")).rows[0], { unit_cost: '1358.5000', total_cost: '16301.95', vat_base: '16301.9500' });
    assert.deepEqual((await db.query("SELECT subtotal,vat_amount,total FROM public.shared_inventory_purchase_invoices WHERE invoice_number='ROUND'")).rows[0], { subtotal: '16301.95', vat_amount: '2608.31', total: '18910.26' });

    // Standard invoices still derive their base from quantity × unit cost,
    // while source_bs uses vat_base before applying the same adjustments.
    await db.query("INSERT INTO public.shared_inventory_purchase_invoices(tenant_id,id,company_id,supplier_id,invoice_number,invoice_date,period,calculation_basis,discount_type,discount_value) VALUES($1,'standard-totals','company','supplier','STANDARD','2026-09-01','2026-09','standard','porcentaje',10),($1,'source-totals','company','supplier','SOURCE','2026-09-01','2026-09','source_bs',null,null)", [tenant]);
    await db.query("INSERT INTO public.shared_inventory_purchase_invoice_items(tenant_id,id,invoice_id,product_id,quantity,unit_cost,total_cost,vat_rate,currency,currency_cost,dollar_rate,vat_base,vat_included,discount_type,discount_value,discount_amount) VALUES($1,'standard-totals-item','standard-totals','product',2,10,20,'general_16','VES',0,1,999,false,null,null,null),($1,'source-totals-item','source-totals','product',2,10,20,'general_16','VES',0,1,19.5,false,'porcentaje',10,0)", [tenant]);
    await db.query('SELECT public.shared_inventory_purchase_invoice_recalculate_totals($1,$2)', [tenant, 'standard-totals']);
    await db.query('SELECT public.shared_inventory_purchase_invoice_recalculate_totals($1,$2)', [tenant, 'source-totals']);
    assert.deepEqual((await db.query("SELECT subtotal,vat_amount,total FROM public.shared_inventory_purchase_invoices WHERE id='standard-totals'")).rows[0], { subtotal: '18.00', vat_amount: '2.88', total: '20.88' });
    assert.deepEqual((await db.query("SELECT subtotal,vat_amount,total FROM public.shared_inventory_purchase_invoices WHERE id='source-totals'")).rows[0], { subtotal: '17.55', vat_amount: '2.80', total: '20.35' });

    // Execute the parser/calculator payload for every sanitized row from the
    // supplied report under both configuration modes. This exercises the same
    // payload sent by the client and the database's persisted decimal scales.
    for (const costsIncludeVat of [false, true]) {
        const rows = calculatedCompleteRows(costsIncludeVat);
        for (const [index, { header, calculation }] of rows.entries()) {
            const batch = `complete-${costsIncludeVat ? 'gross' : 'net'}-${index}`;
            const line = `${batch}-line`;
            await insertBatch(batch, line, header);
            const postedItems = calculation.items.map((item) => ({ ...item, productId: 'product' }));
            const saved = await execute(batch, line, calculationInvoice(header, calculation), supplier(), postedItems);
            assert.equal(saved.status, 'saved');
            assert.deepEqual((await db.query('SELECT subtotal,vat_amount,total FROM public.shared_inventory_purchase_invoices WHERE tenant_id=$1 AND id=$2', [tenant, saved.invoiceId])).rows[0], { subtotal: Number(calculation.subtotal).toFixed(2), vat_amount: Number(calculation.vatAmount).toFixed(2), total: Number(calculation.total).toFixed(2) });
        }
    }

    await insertBatch('rate-fallback', 'rate-fallback-line', { sourceFormat: 'complete', exchangeRate: '820.1018' });
    const rateFallback = await execute('rate-fallback', 'rate-fallback-line', invoice('RATE-FALLBACK', '2026-09-01'), supplier(), items);
    assert.equal((await db.query('SELECT dollar_rate FROM public.shared_inventory_purchase_invoices WHERE tenant_id=$1 AND id=$2', [tenant, rateFallback.invoiceId])).rows[0].dollar_rate, '820.1018');

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

    // Migration 260 repairs only a missing reference rate from a uniquely
    // matching, already-audited complete import. It must not rewrite fiscal
    // amounts, confirmed status, existing rates, or ambiguous source rows.
    await db.query("INSERT INTO public.shared_inventory_purchase_invoices(tenant_id,id,company_id,supplier_id,invoice_number,invoice_date,period,status,subtotal,vat_amount,total,calculation_basis,currency_code) VALUES($1,'rate-repair','company','supplier','RATE-REPAIR','2026-09-01','2026-09','confirmada',10,1.6,11.6,'source_bs','VES'),($1,'rate-present','company','supplier','RATE-PRESENT','2026-09-01','2026-09','confirmada',10,1.6,11.6,'source_bs','VES'),($1,'rate-ambiguous','company','supplier','RATE-AMBIGUOUS','2026-09-01','2026-09','confirmada',10,1.6,11.6,'source_bs','VES')", [tenant]);
    await db.query("UPDATE public.shared_inventory_purchase_invoices SET dollar_rate=700.1234 WHERE tenant_id=$1 AND id='rate-present'", [tenant]);
    await db.query("INSERT INTO public.shared_inventory_purchase_invoice_items VALUES($1,'rate-repair-item','rate-repair','product',1,10,10,'general_16','VES',0,1,10,false),($1,'rate-present-item','rate-present','product',1,10,10,'general_16','VES',0,1,10,false),($1,'rate-ambiguous-item','rate-ambiguous','product',1,10,10,'general_16','VES',0,1,10,false)", [tenant]);
    for (const [batch, line, invoiceId, documentNumber, exchangeRate] of [
        ['restore-rate', 'restore-rate-line', 'rate-repair', 'RATE-REPAIR', '820.1018'],
        ['present-rate', 'present-rate-line', 'rate-present', 'RATE-PRESENT', '820.1018'],
        ['ambiguous-rate-a', 'ambiguous-rate-a-line', 'rate-ambiguous', 'RATE-AMBIGUOUS', '820.1018'],
        ['ambiguous-rate-b', 'ambiguous-rate-b-line', 'rate-ambiguous', 'RATE-AMBIGUOUS', '801.1752'],
    ]) {
        await insertBatch(batch, line, { sourceFormat: 'complete', documentNumber, date: '2026-09-01', exchangeRate });
        await db.query('UPDATE public.shared_inventory_purchase_import_lines SET invoice_id=$3 WHERE tenant_id=$1 AND id=$2', [tenant, line, invoiceId]);
    }
    await db.exec(await readFile(new URL('../supabase/migrations/260_restore_complete_purchase_csv_rates.sql', import.meta.url), 'utf8'));
    assert.deepEqual((await db.query("SELECT id,status,subtotal,vat_amount,total,dollar_rate FROM public.shared_inventory_purchase_invoices WHERE id IN ('rate-repair','rate-present','rate-ambiguous') ORDER BY id")).rows, [
        { id: 'rate-ambiguous', status: 'confirmada', subtotal: '10.00', vat_amount: '1.60', total: '11.60', dollar_rate: null },
        { id: 'rate-present', status: 'confirmada', subtotal: '10.00', vat_amount: '1.60', total: '11.60', dollar_rate: '700.1234' },
        { id: 'rate-repair', status: 'confirmada', subtotal: '10.00', vat_amount: '1.60', total: '11.60', dollar_rate: '820.1018' },
    ]);
    assert.equal((await db.query("SELECT count(*)::int AS count FROM public.shared_inventory_purchase_invoice_items WHERE invoice_id='rate-repair'")).rows[0].count, 1);

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
