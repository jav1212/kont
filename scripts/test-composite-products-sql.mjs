/** Executes the composite-product migration against an isolated PGlite fixture. */
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(modulePath).href : '@electric-sql/pglite');
const db = new PGlite();
const tenant = '00000000-0000-4000-8000-000000000001';
const otherTenant = '00000000-0000-4000-8000-000000000002';

try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE TABLE public.tenants(id uuid primary key);
      CREATE TABLE public.shared_companies(tenant_id uuid,id text,primary key(tenant_id,id));
      CREATE TABLE public.shared_inventory_departments(tenant_id uuid,company_id text,id text,name text);
      CREATE TABLE public.shared_inventory_suppliers(tenant_id uuid,id text,name text);
      CREATE TABLE public.shared_inventory_purchase_invoices(tenant_id uuid,id text,company_id text,period text,status text,supplier_id text,invoice_date date,created_at timestamptz);
      CREATE TABLE public.shared_inventory_purchase_invoice_items(tenant_id uuid,invoice_id text,product_id text);
      CREATE TABLE public.shared_inventory_products(
        tenant_id uuid not null references public.tenants(id), id text not null, company_id text not null,
        code text not null default '', name text not null, measure_unit text not null default 'unidad',
        current_stock numeric(14,4) not null default 0, average_cost numeric(14,4) not null default 0,
        active boolean not null default true, type text not null default 'mercancia', description text default '',
        valuation_method text default 'promedio_ponderado', vat_type text default 'general', department_id text,
        custom_fields jsonb not null default '{}'::jsonb, updated_at timestamptz default now(), primary key(tenant_id,id)
      );
      CREATE TABLE public.shared_inventory_sales_invoices(
        tenant_id uuid not null references public.tenants(id), id text not null, company_id text not null,
        status text not null default 'borrador', sales_channel text not null default 'administrative', period text not null default '2026-09',
        invoice_date date not null default '2026-09-22', invoice_number text not null default '', confirmed_at timestamptz, updated_at timestamptz, primary key(tenant_id,id)
      );
      CREATE TABLE public.shared_inventory_sales_invoice_items(
        tenant_id uuid not null references public.tenants(id), id text not null, invoice_id text not null,
        product_id text, quantity numeric(14,4) not null, unit_price numeric, currency text, currency_price numeric,
        dollar_rate numeric, vat_base numeric, primary key(tenant_id,id)
      );
      CREATE TABLE public.shared_inventory_movements(
        tenant_id uuid not null references public.tenants(id), id text not null, company_id text, product_id text,
        type text, date date, quantity numeric, unit_cost numeric, total_cost numeric default 0,
        balance_quantity numeric, reference text, sales_invoice_id text, sale_price_unit numeric,
        period text, currency text, currency_cost numeric, dollar_rate numeric, notes text,
        discount_type text,discount_value numeric,discount_amount numeric,surcharge_type text,
        surcharge_value numeric,surcharge_amount numeric,vat_base numeric,purchase_invoice_id text,
        created_at timestamptz default now(), primary key(tenant_id,id)
      );
      INSERT INTO public.tenants values('${tenant}'),('${otherTenant}');
      INSERT INTO public.shared_companies values('${tenant}','company'),('${tenant}','other-company'),('${otherTenant}','company');
    `);
    await db.exec(await readFile(new URL('../supabase/migrations/210_allow_negative_inventory_balances.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../supabase/migrations/264_shared_inventory_composite_products.sql', import.meta.url), 'utf8'));
    await db.query(`insert into public.shared_inventory_products(tenant_id,id,company_id,code,name,current_stock,custom_fields) values
      ($1,'bread','company','001','Bread',12,'{}'),($1,'drink','company','002','Drink',5,'{}'),($1,'combo','company','003','Combo',0,'{}'),($1,'stocked','company','004','Stocked',1,'{}'),($1,'foreign-company','other-company','005','Other company',4,'{}'),($1,'pending','company','006','Pending combo',0,'{}'),
      ($1,'legacy-zero','company','007','Imported compound',0,'{"tipo_origen":"  CoMpUeStO  "}'),($1,'legacy-positive','company','008','Imported compound with stock',1,'{"tipo_origen":"Compuesto"}'),($1,'legacy-negative','company','009','Imported compound with negative stock',-1,'{"tipo_origen":"Compuesto"}'),($1,'legacy-simple-name','company','010','COMBO named but simple',0,'{}'),($1,'legacy-parent','company','011','Existing parent',0,'{}'),($1,'legacy-component','company','012','Imported component',0,'{"tipo_origen":"Compuesto"}')`, [tenant]);
    await db.query("update public.shared_inventory_products set composition_kind='composite' where tenant_id=$1 and id='combo'", [tenant]);
    await db.query("update public.shared_inventory_products set composition_kind='composite' where tenant_id=$1 and id='pending'", [tenant]);
    await db.query("update public.shared_inventory_products set composition_kind='composite' where tenant_id=$1 and id='legacy-parent'", [tenant]);
    await db.query("select public.shared_inventory_product_composition_replace($1,'company','legacy-parent','[{\"productId\":\"legacy-component\",\"quantity\":1}]')", [tenant]);
    const backfillMigration = await readFile(new URL('../supabase/migrations/266_backfill_imported_composite_products.sql', import.meta.url), 'utf8');
    await db.exec(backfillMigration);
    const legacyKinds = await db.query("select id, composition_kind from public.shared_inventory_products where tenant_id=$1 and id like 'legacy-%' order by id", [tenant]);
    assert.deepEqual(legacyKinds.rows.map((row) => [row.id, row.composition_kind]), [
        ['legacy-component', 'simple'],
        ['legacy-negative', 'simple'],
        ['legacy-parent', 'composite'],
        ['legacy-positive', 'simple'],
        ['legacy-simple-name', 'simple'],
        ['legacy-zero', 'composite'],
    ], 'Only zero-stock, explicitly imported compound products without a parent recipe are backfilled');
    await db.exec(backfillMigration);
    assert.equal((await db.query("select composition_kind from public.shared_inventory_products where tenant_id=$1 and id='legacy-zero'", [tenant])).rows[0].composition_kind, 'composite', 'Backfill is idempotent');

    await assert.rejects(
        db.query("select public.shared_inventory_product_composition_replace($1,'company','combo','[{\"productId\":\"combo\",\"quantity\":1}]')", [tenant]),
        /COMPOSITION_INVALID/,
    );
    await db.query("select public.shared_inventory_product_composition_replace($1,'company','combo','[{\"productId\":\"bread\",\"quantity\":2},{\"productId\":\"drink\",\"quantity\":1}]')", [tenant]);
    const composition = (await db.query("select public.shared_inventory_product_composition_get($1,'company','combo') value", [tenant])).rows[0].value;
    assert.equal(composition.composition_status, 'ready');
    assert.equal(composition.components.length, 2);
    await assert.rejects(db.query("select public.shared_inventory_product_composition_replace($1,'company','combo','[{\"productId\":\"foreign-company\",\"quantity\":1}]')", [tenant]), /COMPOSITION_COMPONENT_INVALID/);
    assert.equal((await db.query("select count(*)::int count from public.shared_inventory_product_components where tenant_id=$1 and composite_product_id='combo'", [tenant])).rows[0].count, 2);
    await assert.rejects(db.query("update public.shared_inventory_products set measure_unit='kg' where tenant_id=$1 and id='bread'", [tenant]), /COMPONENT_PRODUCT_UNIT_CANNOT_CHANGE/);
    await assert.rejects(db.query("update public.shared_inventory_products set composition_kind='composite',current_stock=0 where tenant_id=$1 and id='stocked'", [tenant]), /COMPOSITE_PRODUCT_STOCK_MUST_BE_ZERO/);
    await assert.rejects(db.query("insert into public.shared_inventory_products(tenant_id,id,company_id,code,name,current_stock,composition_kind) values($1,'new-stocked-combo','company','007','Invalid new composite',1,'composite')", [tenant]), /COMPOSITE_PRODUCT_STOCK_MUST_BE_ZERO/);

    await db.query("update public.shared_inventory_products set average_cost=2 where tenant_id=$1 and id in ('bread','drink')", [tenant]);
    await db.query("insert into public.shared_inventory_movements(tenant_id,id,company_id,product_id,type,date,period,quantity,unit_cost,total_cost,balance_quantity,reference) values($1,'opening-bread','company','bread','entrada','2026-08-01','2026-08',12,2,24,12,''),($1,'opening-drink','company','drink','entrada','2026-08-01','2026-08',5,2,10,5,'')", [tenant]);

    await db.query("insert into public.shared_inventory_sales_invoices(tenant_id,id,company_id,sales_channel,invoice_number) values($1,'sale-1','company','administrative','F-1')", [tenant]);
    await db.query("insert into public.shared_inventory_sales_invoice_items(tenant_id,id,invoice_id,product_id,quantity,unit_price) values($1,'item-combo','sale-1','combo',2,20),($1,'item-bread','sale-1','bread',1,3)", [tenant]);
    await db.query('select public.shared_inventory_sales_invoice_confirm($1,$2,false)', [tenant, 'sale-1']);
    const stock = await db.query("select id,current_stock from public.shared_inventory_products where tenant_id=$1 and id in ('bread','drink') order by id", [tenant]);
    assert.deepEqual(stock.rows.map((row) => [row.id, Number(row.current_stock)]), [['bread', 7], ['drink', 3]]);
    assert.equal((await db.query("select count(*)::int count from public.shared_inventory_sales_invoice_item_components where tenant_id=$1 and invoice_item_id='item-combo'", [tenant])).rows[0].count, 2);
    assert.equal((await db.query("select count(*)::int count from public.shared_inventory_movements where tenant_id=$1 and sales_invoice_id='sale-1'", [tenant])).rows[0].count, 3);
    const movementTotals = (await db.query("select sum(total_cost) cost,sum(sale_price_unit*quantity) revenue from public.shared_inventory_movements where tenant_id=$1 and sales_invoice_id='sale-1'", [tenant])).rows[0];
    assert.equal(Number(movementTotals.cost), 14, 'COGS uses component average costs');
    assert.equal(Number(movementTotals.revenue), 3, 'Simple-line revenue survives alongside component movements');
    const reportingMigration = await readFile(new URL('../supabase/migrations/265_composite_sales_reporting.sql', import.meta.url), 'utf8');
    await db.exec(reportingMigration);
    assert.equal(Number((await db.query("select sales_value from public.shared_inventory_composite_sales_totals($1,'company','2026-09')", [tenant])).rows[0].sales_value), 40);
    const report = (await db.query("select public.shared_inventory_period_report_get($1,'company','2026-09') report", [tenant])).rows[0].report;
    assert.equal(report.reduce((total, row) => total + Number(row.total_salidas_s_iva_bs), 0), 43, 'Period report counts combo and simple revenue exactly once');
    await assert.rejects(db.query('select public.shared_inventory_sales_invoice_confirm($1,$2,false)', [tenant, 'sale-1']), /not a draft/);
    await db.query("select public.shared_inventory_product_composition_replace($1,'company','combo','[{\"productId\":\"bread\",\"quantity\":1}]')", [tenant]);
    assert.equal(Number((await db.query("select sales_value from public.shared_inventory_composite_sales_totals($1,'company','2026-09')", [tenant])).rows[0].sales_value), 40);
    await db.query('select public.shared_inventory_sales_invoice_unconfirm($1,$2)', [tenant, 'sale-1']);
    const restored = await db.query("select id,current_stock from public.shared_inventory_products where tenant_id=$1 and id in ('bread','drink') order by id", [tenant]);
    assert.deepEqual(restored.rows.map((row) => [row.id, Number(row.current_stock)]), [['bread', 12], ['drink', 5]]);
    assert.equal((await db.query("select * from public.shared_inventory_composite_sales_totals($1,'company','2026-09')", [tenant])).rows.length, 0);
    await db.query("insert into public.shared_inventory_sales_invoices(tenant_id,id,company_id,invoice_number) values($1,'sale-pending','company','F-2')", [tenant]);
    await db.query("insert into public.shared_inventory_sales_invoice_items(tenant_id,id,invoice_id,product_id,quantity,unit_price) values($1,'item-pending','sale-pending','pending',1,1)", [tenant]);
    await assert.rejects(db.query('select public.shared_inventory_sales_invoice_confirm($1,$2,false)', [tenant, 'sale-pending']), /COMPOSITE_PRODUCT_COMPOSITION_PENDING/);
    await assert.rejects(db.query("select public.shared_inventory_product_composition_get($1,'company','combo')", [otherTenant]), /PRODUCT_NOT_FOUND/);
    await assert.rejects(db.query("select public.shared_inventory_product_composition_replace($1,'company','combo',null)", [tenant]), /COMPOSITION_INVALID/);
    await assert.rejects(db.query("update public.shared_inventory_products set company_id='other-company' where tenant_id=$1 and id='bread'", [tenant]), /COMPONENT_PRODUCT_COMPANY_CANNOT_CHANGE/);
    await assert.rejects(db.query("update public.shared_inventory_products set composition_kind='simple' where tenant_id=$1 and id='combo'", [tenant]), /COMPOSITE_PRODUCT_COMPONENTS_MUST_BE_CLEARED/);
    await assert.rejects(db.query("select public.shared_inventory_product_composition_replace($1,'company','combo','[{\"productId\":\"bread\",\"quantity\":\"NaN\"}]')", [tenant]), /COMPOSITION_INVALID/);
    await db.query("update public.shared_inventory_products set active=false where tenant_id=$1 and id='bread'", [tenant]);
    await assert.rejects(db.query('select public.shared_inventory_sales_invoice_confirm($1,$2,true)', [tenant, 'sale-1']), /COMPOSITE_COMPONENT_INVALID|Product does not belong/);
    await db.query("update public.shared_inventory_products set active=true where tenant_id=$1 and id='bread'", [tenant]);
    // Shared demand includes a standalone line; a failure rolls back all effects.
    await db.query("update public.shared_inventory_sales_invoice_items set quantity=13 where tenant_id=$1 and id='item-combo'", [tenant]);
    await assert.rejects(db.query('select public.shared_inventory_sales_invoice_confirm($1,$2,false)', [tenant, 'sale-1']), /Insufficient stock/);
    assert.equal(Number((await db.query("select current_stock from public.shared_inventory_products where tenant_id=$1 and id='bread'", [tenant])).rows[0].current_stock), 12);
    assert.equal((await db.query("select count(*)::int count from public.shared_inventory_movements where tenant_id=$1 and sales_invoice_id='sale-1'", [tenant])).rows[0].count, 0);
    await db.query('select public.shared_inventory_sales_invoice_confirm($1,$2,true)', [tenant, 'sale-1']);
    assert.equal(Number((await db.query("select current_stock from public.shared_inventory_products where tenant_id=$1 and id='bread'", [tenant])).rows[0].current_stock), -2, 'Administrative opt-in remains supported');
    await db.query('select public.shared_inventory_sales_invoice_unconfirm($1,$2)', [tenant, 'sale-1']);
    await db.query("update public.shared_inventory_sales_invoices set sales_channel='pos' where tenant_id=$1 and id='sale-1'", [tenant]);
    await db.query("select public.shared_inventory_product_composition_replace($1,'company','combo','[{\"productId\":\"bread\",\"quantity\":0.25}]')", [tenant]);
    await db.query("update public.shared_inventory_sales_invoice_items set quantity=2 where tenant_id=$1 and id='item-combo'", [tenant]);
    await db.query('select public.shared_inventory_sales_invoice_confirm($1,$2,true)', [tenant, 'sale-1']);
    assert.equal(Number((await db.query("select current_stock from public.shared_inventory_products where tenant_id=$1 and id='bread'", [tenant])).rows[0].current_stock), 10.5, 'Fractional components retain precision');
    // Both schemas can be applied again without removing existing recipe or history.
    await db.exec(await readFile(new URL('../supabase/migrations/264_shared_inventory_composite_products.sql', import.meta.url), 'utf8'));
    await db.exec(reportingMigration);
    console.log('PASS: real inventory COGS, reports, reversal after recipe edits, tenant/company isolation, atomic errors, pending/inactive guards, negative-stock policy, decimals, repeated confirmation and migration replay.');
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
} finally {
    await db.close();
}
