/** Checks the invoice-only credit trigger on disposable PostgreSQL rows. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(modulePath).href : "@electric-sql/pglite");
const tenant = "00000000-0000-4000-8000-000000000001";

test("credit invoices create receivables but delivery notes preserve only historical payment guards", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table public.shared_inventory_sales_invoices(
        tenant_id uuid not null,company_id text not null,id text not null,customer_id text not null,
        document_type text not null,status text not null,payment_terms text not null,
        credit_currency_code text,credit_amount numeric,credit_exchange_rate numeric,
        credit_rate_effective_date date,credit_rate_source text,due_date date,
        primary key(tenant_id,id));
      create table public.shared_sales_receivables(
        tenant_id uuid not null,id text not null default gen_random_uuid()::text,
        company_id text not null,customer_id text not null,sales_invoice_id text not null,
        debt_currency_code text not null,original_amount numeric not null,
        debt_exchange_rate numeric not null,rate_effective_date date not null,
        rate_source text not null,due_date date not null,
        primary key(tenant_id,id),unique(tenant_id,sales_invoice_id));
      create table public.shared_sales_receivable_payments(
        tenant_id uuid not null,receivable_id text not null,id text not null default gen_random_uuid()::text);
      insert into public.shared_inventory_sales_invoices
        (tenant_id,company_id,id,customer_id,document_type,status,payment_terms,
          credit_currency_code,credit_amount,credit_exchange_rate,
          credit_rate_effective_date,credit_rate_source,due_date)
      values
        ('${tenant}','company','invoice','customer','venta','borrador','credito',
          'VES',10,1,'2026-10-02','bcv','2026-10-15'),
        ('${tenant}','company','note','customer','nota_entrega','borrador','credito',
          null,null,null,null,null,null),
        ('${tenant}','company','legacy-note','customer','nota_entrega','confirmada','credito',
          'VES',5,1,'2026-10-02','bcv','2026-10-15'),
        ('${tenant}','company','invalid-invoice','customer','venta','borrador','credito',
          'VES',null,1,'2026-10-02','bcv','2026-10-15'),
        ('${tenant}','company','anonymous-invoice','consumer-final:1','venta','borrador','credito',
          'VES',10,1,'2026-10-02','bcv','2026-10-15');
      insert into public.shared_sales_receivables(
        tenant_id,company_id,customer_id,sales_invoice_id,debt_currency_code,
        original_amount,debt_exchange_rate,rate_effective_date,rate_source,due_date)
      values('${tenant}','company','customer','legacy-note','VES',5,1,'2026-10-02','bcv','2026-10-15');
      insert into public.shared_sales_receivable_payments(tenant_id,receivable_id)
        select tenant_id,id from public.shared_sales_receivables where sales_invoice_id='legacy-note';
    `);
    const migration = await readFile(new URL("../../../../../supabase/migrations/365_sales_credit_receivable_invoice_only.sql", import.meta.url), "utf8");
    await db.exec(migration);
    await db.exec(`create trigger shared_sales_credit_receivable_confirmed
      before update of status on public.shared_inventory_sales_invoices
      for each row execute function public.shared_sales_credit_confirmed_receivable()`);

    await db.exec("update public.shared_inventory_sales_invoices set status='confirmada' where id='note'");
    assert.equal((await db.query("select count(*)::integer as count from public.shared_sales_receivables where sales_invoice_id='note'")).rows[0].count, 0);
    await db.exec("update public.shared_inventory_sales_invoices set status='confirmada' where id='invoice'");
    assert.equal((await db.query("select count(*)::integer as count from public.shared_sales_receivables where sales_invoice_id='invoice'")).rows[0].count, 1);
    await assert.rejects(() => db.exec("update public.shared_inventory_sales_invoices set status='confirmada' where id='invalid-invoice'"), /Credit sale is missing/);
    await assert.rejects(() => db.exec("update public.shared_inventory_sales_invoices set status='confirmada' where id='anonymous-invoice'"), /requires an identified customer/);
    await assert.rejects(() => db.exec("update public.shared_inventory_sales_invoices set status='borrador' where id='legacy-note'"), /cannot be unconfirmed/);
    assert.equal((await db.query("select status from public.shared_inventory_sales_invoices where id='legacy-note'")).rows[0].status, "confirmada");
    const preflight = await readFile(new URL("../../../../../supabase/checks/sales_delivery_note_confirmation_contract_preflight.sql", import.meta.url), "utf8");
    const contract = (await db.query(preflight)).rows[0].preflight;
    assert.equal(contract.creditDeliveryNoteReceivables, 1);
    assert.equal(contract.deliveryNotesByStatusAndTerms.find((row) => row.status === "confirmada")?.documents, 2);
    assert.ok(contract.triggers.some((row) => row.tgname === "shared_sales_credit_receivable_confirmed"));
    assert.match(contract.functions.find((row) => row.signature === "public.shared_sales_credit_confirmed_receivable()")?.definition ?? "", /document_type='venta'/);
  } finally {
    await db.close();
  }
});
