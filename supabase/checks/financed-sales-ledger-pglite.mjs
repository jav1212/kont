import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const pgliteModule = process.env.FINANCED_SALES_PGLITE_MODULE ?? "@electric-sql/pglite";
const { PGlite } = await import(pgliteModule);
const db = new PGlite();
const tenantId = "00000000-0000-4000-8000-000000000001";
const companyId = "J-00000000-0";
try {
  await db.exec(await readFile(new URL("./accounting-fixture.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("./accounting-fixture-seed.sql", import.meta.url), "utf8"));
  await db.query("insert into public.shared_companies(tenant_id,id,organization_id) values($1,$2,'00000000-0000-4000-8000-000000000002') on conflict do nothing", [tenantId, companyId]);
  const migration = await readFile(new URL("../migrations/20261121160000_financed_sales_ledger.sql", import.meta.url), "utf8");
  await db.exec(migration);
  // Re-running must not fail on tables and indexes; policies are created once by design.
  await db.exec(migration.replace(/CREATE POLICY[\s\S]*?;\n/g, ""));

  const save = async (expectedVersion, settings) => (await db.query(
    "select public.shared_financed_sales_settings_save($1,$2,$3,$4) value",
    [tenantId, companyId, expectedVersion, settings],
  )).rows[0].value;
  const settings = { financier_name: "Cashea", upfront_percent: "60", commission_percent: "0", journal_granularity: "monthly", accounts: { bank: "a-1" } };
  const first = await save(0, settings);
  assert.equal(first.version, 1);
  assert.deepEqual(first.accounts, { bank: "a-1" });
  await assert.rejects(() => save(0, settings), /SALES_CONCURRENCY_CONFLICT/);
  const second = await save(1, { ...settings, journal_granularity: "daily" });
  assert.equal(second.version, 2);
  assert.equal(second.journal_granularity, "daily");
  await assert.rejects(() => save(1, settings), /SALES_CONCURRENCY_CONFLICT/);
  await assert.rejects(() => save(2, { ...settings, upfront_percent: "100" }), /check constraint/);
  await assert.rejects(() => db.query("select public.shared_financed_sales_settings_save($1,'J-missing',0,$2)", [tenantId, settings]), /SALES_NOT_FOUND/);

  await db.query("insert into public.shared_financed_sales(tenant_id,id,company_id,sale_date,amount_ves,upfront_percent,ves_per_usd,rate_source) values($1,'s-1',$2,'2025-10-01',7455.25,60,179.43,'bcv')", [tenantId, companyId]);
  await db.query("insert into public.shared_financier_deposits(tenant_id,id,company_id,deposit_date,amount_ves,ves_per_usd,rate_source) values($1,'d-1',$2,'2025-11-20',3992.47,240.32,'bcv')", [tenantId, companyId]);
  await assert.rejects(() => db.query("insert into public.shared_financed_sales(tenant_id,id,company_id,sale_date,amount_ves,upfront_percent,ves_per_usd,rate_source) values($1,'s-2',$2,'2025-10-01',0,60,1,'bcv')", [tenantId, companyId]), /check constraint/);
  await assert.rejects(() => db.query("insert into public.shared_financier_deposits(tenant_id,id,company_id,deposit_date,amount_ves,ves_per_usd,rate_source) values($1,'d-2',$2,'2025-11-20',1,1,'parallel')", [tenantId, companyId]), /check constraint/);
  await assert.rejects(() => db.query("insert into public.shared_financed_sales(tenant_id,id,company_id,sale_date,amount_ves,upfront_percent,ves_per_usd,rate_source) values($1,'s-3','J-missing','2025-10-01',1,60,1,'bcv')", [tenantId]), /foreign key/);
  await db.exec(await readFile(new URL("../migrations/20261121170000_financed_sales_reconciliation.sql", import.meta.url), "utf8"));
  const third = await save(2, { ...settings, revalue_month_end: true });
  assert.equal(third.revalue_month_end, true);
  assert.equal(third.version, 3);
  await db.query("insert into public.shared_financier_deposits(tenant_id,id,company_id,deposit_date,amount_ves,ves_per_usd,rate_source) values($1,'d-2',$2,'2025-11-21',10,240,'bcv')", [tenantId, companyId]);
  const link = async (links) => (await db.query("select public.shared_financier_deposits_set_bank_links($1,$2,$3) value", [tenantId, companyId, JSON.stringify(links)])).rows[0].value;
  assert.equal(await link([{ deposit_id: "d-1", bank_entry_id: "bank-1" }]), 1);
  await assert.rejects(() => link([{ deposit_id: "d-2", bank_entry_id: "bank-1" }]), /SALES_CONCURRENCY_CONFLICT/);
  // Moving a link between deposits in one call succeeds because clearing runs first.
  assert.equal(await link([{ deposit_id: "d-1", bank_entry_id: null }, { deposit_id: "d-2", bank_entry_id: "bank-1" }]), 2);
  assert.deepEqual((await db.query("select id, bank_entry_id from public.shared_financier_deposits order by id")).rows, [{ id: "d-1", bank_entry_id: null }, { id: "d-2", bank_entry_id: "bank-1" }]);
  await assert.rejects(() => link([{ deposit_id: "missing", bank_entry_id: "bank-9" }]), /SALES_FINANCED_COLLECTION_INVALID/);
  const rowSecurity = (await db.query("select relname, relrowsecurity from pg_class where relname in ('shared_financed_sales','shared_financier_deposits','shared_financed_sales_settings') order by relname")).rows;
  assert.ok(rowSecurity.every((row) => row.relrowsecurity), "row level security is enabled on every ledger table");
  console.log("financed sales ledger pglite check passed");
} finally {
  await db.close();
}
