/** Runs Accounts Payable migrations and source/idempotency checks in an isolated PostgreSQL cluster. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const control = (executable, args) => new Promise((resolveResult, reject) => {
  const child = spawn(executable, args, { windowsHide: true, stdio: "ignore" });
  child.once("error", reject);
  child.once("exit", (code) => code === 0 ? resolveResult() : reject(new Error(`${executable} exited ${code}`)));
});
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dependencies = process.env.PAYABLES_POSTGRES_MODULES ?? join(tmpdir(), "kont-treasury-postgres", "node_modules");
const { initdb, pg_ctl } = await import(pathToFileURL(join(dependencies, "@embedded-postgres/windows-x64/dist/index.js")).href);
const { default: pg } = await import(pathToFileURL(join(dependencies, "pg/lib/index.js")).href);
const cluster = await mkdtemp(join(tmpdir(), "kont-payables-db-"));
const port = Number(process.env.PAYABLES_TEST_PORT ?? "55484");
assert.ok(Number.isSafeInteger(port) && port >= 1024 && port <= 65535, "PAYABLES_TEST_PORT must be a valid TCP port");
const scope = { tenantId: "00000000-0000-4000-8000-000000000001", organizationId: "00000000-0000-4000-8000-000000000002", companyId: "company-1", actorId: "00000000-0000-4000-8000-000000000003" };
const options = { host: "127.0.0.1", port, user: "payables_test", database: "postgres" };
const clients = [];
let started = false;
const connect = async () => { const client = new pg.Client(options); await client.connect(); clients.push(client); return client; };
const execute = async (client, command, requestScope = scope) => {
  const result = await client.query("select public.shared_payables_execute_command($1::jsonb,$2::jsonb) result", [JSON.stringify(requestScope), JSON.stringify(command)]);
  return result.rows[0].result;
};

try {
  await control(initdb, ["-D", cluster, "-U", "payables_test", "--auth=trust", "--encoding=UTF8", "--locale=C"]);
  await control(pg_ctl, ["-D", cluster, "-l", join(cluster, "server.log"), "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"]);
  started = true;
  const admin = await connect();
  await admin.query(await readFile(join(root, "supabase/checks/payables-fixture.sql"), "utf8"));
  for (const treasury of ["20261001200000_treasury_foundation.sql", "20261015143000_treasury_reconciliation_read_versions.sql", "20261016140000_treasury_tax_policy_reads.sql"]) await admin.query(await readFile(join(root, "supabase/migrations", treasury), "utf8"));
  await admin.query(await readFile(join(root, "supabase/migrations/20261023140521_payables_foundation_and_purchase_source.sql"), "utf8"));
  await admin.query(await readFile(join(root, "supabase/migrations/20261023140537_payables_credits_batches_and_payments.sql"), "utf8"));
  await admin.query(await readFile(join(root, "supabase/migrations/20261023153431_payables_read_only_authorization.sql"), "utf8"));
  await admin.query(await readFile(join(root, "supabase/migrations/20261023183249_payables_document_commands.sql"), "utf8"));
  await admin.query(await readFile(join(root, "supabase/migrations/20261023191047_treasury_source_disbursement.sql"), "utf8"));
  await admin.query(await readFile(join(root, "supabase/migrations/20261023191501_payables_payments_and_withholdings.sql"), "utf8"));
  await admin.query(await readFile(join(root, "supabase/migrations/20261023191644_payables_accounting_integration.sql"), "utf8"));
  await admin.query(await readFile(join(root, "supabase/migrations/20261023192513_payables_withholding_voucher.sql"), "utf8"));
  assert.equal((await admin.query("select count(*)::integer n from public.access_control_permissions where code like 'payables.%'")).rows[0].n, 7, "all payables permissions must be installed by the migration");
  assert.equal((await admin.query("select count(*)::integer n from public.shared_payables_documents where status='open'")).rows[0].n, 0, "migrations must not create opening debt implicitly");

  const a = await connect();
  const b = await connect();
  await a.query("set role service_role");
  await b.query("set role service_role");
  const manual = { kind: "create_manual_document", idempotencyKey: "manual-once", correlationId: "manual-trace", documentId: "manual-1", supplierId: "supplier-1", documentNumber: "M-001", concept: "Apertura documentada", issuedAt: "2026-10-01", dueAt: "2026-10-31", currency: "VES", principal: "100", rateSnapshot: { amount: "100", baseCurrency: "VES", rate: "1", source: "identity", effectiveDate: "2026-10-01", policyVersion: "test", rounding: "half_up" } };
  const firstWrites = await Promise.all([execute(a, manual), execute(b, manual)]);
  assert.deepEqual(firstWrites.map((item) => item.replayed).sort(), [false, true], "concurrent idempotent create must persist exactly once");
  await assert.rejects(execute(a, { ...manual, principal: "101" }), /IDEMPOTENCY_CONFLICT/i, "an idempotency key cannot be replayed with another payload");
  const due = { kind: "change_due_date", idempotencyKey: "due-once", correlationId: "due-trace", changeId: "due-1", documentId: "manual-1", dueAt: "2026-11-15", reason: "Acuerdo con proveedor", expectedVersion: 1 };
  await execute(a, due);
  await assert.rejects(execute(b, { ...due, idempotencyKey: "due-stale", changeId: "due-stale" }), /VERSION_CONFLICT/i, "stale due-date version must fail");

  const tenant2 = "00000000-0000-4000-8000-000000000011";
  const org2 = "00000000-0000-4000-8000-000000000012";
  await admin.query("insert into public.tenants values($1)", [tenant2]);
  await admin.query("insert into public.organizations values($1)", [org2]);
  await admin.query("insert into public.shared_companies(tenant_id,id,organization_id) values($1,$2,$3)", [tenant2, scope.companyId, org2]);
  await admin.query("insert into public.shared_inventory_suppliers(tenant_id,id,company_id,rif,name) values($1,'supplier-1',$2,'J-12345678-9','Proveedor tenant 2')", [tenant2, scope.companyId]);
  await admin.query("update public.shared_inventory_suppliers set rif='J-12345678-9' where tenant_id=$1 and id='supplier-1'", [scope.tenantId]);
  const otherScope = { ...scope, tenantId: tenant2, organizationId: org2 };
  await execute(a, { ...manual, idempotencyKey: "manual-tenant-2", correlationId: "tenant-2", documentId: "manual-1" }, otherScope);
  const isolated = await a.query("select public.shared_payables_query($1::jsonb,$2::jsonb) result", [JSON.stringify(scope), JSON.stringify({ kind: "list_documents", limit: 20, offset: 0 })]);
  assert.equal(isolated.rows[0].result.total, 1, "same supplier RIF and document identifiers in another tenant must remain isolated");

  await admin.query("insert into public.shared_inventory_purchase_invoices(tenant_id,id,company_id,supplier_id,invoice_number,invoice_date,status,subtotal,vat_amount,total,payment_terms,credit_days,currency_code) values($1,'purchase-ves',$2,'supplier-1','F-VES','2026-10-02','borrador',100,16,116,'credito',30,'VES')", [scope.tenantId, scope.companyId]);
  await admin.query("update public.shared_inventory_purchase_invoices set status='confirmada' where tenant_id=$1 and id='purchase-ves'", [scope.tenantId]);
  await admin.query("update public.shared_inventory_purchase_invoices set status='confirmada' where tenant_id=$1 and id='purchase-ves'", [scope.tenantId]);
  assert.equal((await admin.query("select count(*)::integer n from public.shared_payables_documents where tenant_id=$1 and source_id='purchase-ves'", [scope.tenantId])).rows[0].n, 1, "repeated confirmation must preserve one source document");
  await admin.query("update public.shared_inventory_purchase_invoices set status='borrador' where tenant_id=$1 and id='purchase-ves'", [scope.tenantId]);
  assert.equal((await admin.query("select status from public.shared_payables_documents where tenant_id=$1 and source_id='purchase-ves'", [scope.tenantId])).rows[0].status, "voided", "unconfirming an unapplied source must void its payable");
  await admin.query("update public.shared_inventory_purchase_invoices set status='confirmada' where tenant_id=$1 and id='purchase-ves'", [scope.tenantId]);
  await admin.query("insert into public.shared_inventory_purchase_invoices(tenant_id,id,company_id,supplier_id,invoice_number,invoice_date,status,subtotal,vat_amount,total,dollar_rate,payment_terms,credit_days,currency_code) values($1,'purchase-usd',$2,'supplier-1','F-USD','2026-10-03','borrador',100,16,116,2,'credito',15,'USD')", [scope.tenantId, scope.companyId]);
  await admin.query("update public.shared_inventory_purchase_invoices set status='confirmada' where tenant_id=$1 and id='purchase-usd'", [scope.tenantId]);
  assert.deepEqual((await admin.query("select currency,principal::text from public.shared_payables_documents where tenant_id=$1 and source_id='purchase-usd'", [scope.tenantId])).rows[0], { currency: "USD", principal: "58.00000000" }, "USD debt must use the captured invoice rate");
  await admin.query("insert into public.shared_inventory_purchase_invoices(tenant_id,id,company_id,supplier_id,invoice_number,invoice_date,status,subtotal,vat_amount,total,document_type,affected_invoice_id,currency_code) values($1,'credit-ves',$2,'supplier-1','NC-1','2026-10-04','borrador',-10,-1.6,-11.6,'nota_credito','purchase-ves','VES')", [scope.tenantId, scope.companyId]);
  await admin.query("update public.shared_inventory_purchase_invoices set status='confirmada' where tenant_id=$1 and id='credit-ves'", [scope.tenantId]);
  await assert.rejects(admin.query("update public.shared_inventory_purchase_invoices set status='borrador' where tenant_id=$1 and id='purchase-ves'", [scope.tenantId]), /PAYABLES_HAS_APPLICATIONS/i, "an applied credit must protect its source payable from unconfirmation");
  const report = await a.query("select public.shared_payables_reporting_query($1::jsonb,$2::jsonb) result", [JSON.stringify(scope), JSON.stringify({ kind: "aging", supplierId: "supplier-1", asOf: "2026-10-23", limit: 20, offset: 0 })]);
  assert.ok(report.rows[0].result.totals.some((row) => row.currency === "USD"), "aging buckets must include the USD purchase source");
  const pendingReport = await a.query("select public.shared_payables_reporting_query($1::jsonb,$2::jsonb) result", [JSON.stringify(scope), JSON.stringify({ kind: "list_pending", supplierId: "supplier-1", limit: 50, offset: 0 })]);
  assert.ok(pendingReport.rows[0].result.rows.some((row) => row.documentId === "purchase:purchase-usd"), "stable reporting query must include the purchase source");
  // PostgREST runs STABLE RPCs in read-only transactions, where row-locking authorization fails.
  await a.query("begin transaction read only");
  try {
    await a.query("select public.shared_payables_query($1::jsonb,$2::jsonb)", [JSON.stringify(scope), JSON.stringify({ kind: "list_documents", limit: 20, offset: 0 })]);
    await a.query("select public.shared_payables_reporting_query($1::jsonb,$2::jsonb)", [JSON.stringify(scope), JSON.stringify({ kind: "aging", supplierId: "supplier-1", asOf: "2026-10-23", limit: 20, offset: 0 })]);
  } finally {
    await a.query("rollback");
  }

  // Corte 2: concurrent spending of one credit and concurrent installment plans over one balance.
  const ves = { amount: "0", baseCurrency: "VES", rate: "1", source: "VES identity", effectiveDate: "2026-10-05", policyVersion: "test", rounding: "half_up" };
  const debt = (id) => ({ kind: "create_adjustment", idempotencyKey: `debt-${id}`, correlationId: "c", documentId: id, direction: "positive", supplierId: "supplier-1", concept: "Cargo", reason: "Prueba", issuedAt: "2026-10-05", dueAt: "2026-10-30", currency: "VES", principal: "60.00", rateSnapshot: ves });
  await execute(a, debt("debt-a"));
  await execute(a, debt("debt-b"));
  await execute(a, { kind: "create_adjustment", idempotencyKey: "credit-x", correlationId: "c", documentId: "credit-x", direction: "negative", supplierId: "supplier-1", concept: "Crédito", reason: "Prueba", issuedAt: "2026-10-05", currency: "VES", principal: "100.00", rateSnapshot: ves });
  const spend = (client, target) => execute(client, { kind: "apply_credit", idempotencyKey: `spend-${target}`, correlationId: "c", creditDocumentId: "credit-x", occurredAt: "2026-10-06", allocations: [{ applicationId: `spend-${target}`, documentId: target, amount: "60.00" }] });
  const spent = await Promise.allSettled([spend(a, "debt-a"), spend(b, "debt-b")]);
  assert.equal(spent.filter((item) => item.status === "fulfilled").length, 1, "one credit cannot be spent twice by concurrent applications");
  assert.match(String(spent.find((item) => item.status === "rejected")?.reason?.message), /EXCEEDS_BALANCE/);
  assert.equal((await admin.query("select public.shared_payables_open_amount($1,'credit-x')::text v", [scope.tenantId])).rows[0].v, "40.00000000");
  const version = (await admin.query("select version from public.shared_payables_documents where tenant_id=$1 and id='debt-b'", [scope.tenantId])).rows[0].version;
  const split = (client, key) => execute(client, { kind: "create_installment_plan", idempotencyKey: key, correlationId: "c", planId: key, documentId: "debt-b", expectedVersion: version, installments: [{ documentId: `${key}-1`, amount: "30.00", dueAt: "2026-11-30" }, { documentId: `${key}-2`, amount: "30.00", dueAt: "2026-12-30" }] });
  const plans = await Promise.allSettled([split(a, "plan-a"), split(b, "plan-b")]);
  assert.equal(plans.filter((item) => item.status === "fulfilled").length, 1, "only one installment plan may transfer the same balance");
  assert.equal((await admin.query("select count(*)::int n from public.shared_payables_documents where tenant_id=$1 and kind='installment' and status='open'", [scope.tenantId])).rows[0].n, 2);

  // Cortes 3 y 4 under real concurrency.
  await admin.query(`insert into public.shared_treasury_cash_boxes(tenant_id,id,company_id,code,name,currency,responsible_actor_id) values($1,'cash-1',$2,'C1','Caja','VES',$3)`, [scope.tenantId, scope.companyId, scope.actorId]);
  await admin.query("select public.treasury_insert_ledger($1,$2,'{}'::jsonb,'fund-cash','{\"kind\":\"cash_box\",\"id\":\"cash-1\"}'::jsonb,'credit',$3::jsonb,'2026-10-01','2026-10-01','Fondeo','opening',null,null)", [scope.tenantId, scope.companyId, JSON.stringify({ amount: "1000", currency: "VES", operationalValue: { baseCurrency: "VES", amount: "1000", rate: "1", source: "identity", asOf: "2026-10-01", policyVersion: "v1", rounding: "half_up" } })]);
  const pay = (client, body) => client.query("select public.shared_payables_payment_command($1::jsonb,$2::jsonb) result", [JSON.stringify(scope), JSON.stringify({ correlationId: "c", ...body })]).then((result) => result.rows[0].result);
  const money = (amount) => ({ amount, currency: "VES", operationalValue: { baseCurrency: "VES", amount, rate: "1", source: "VES identity", asOf: "2026-10-10", policyVersion: "v1", rounding: "half_up" } });
  await pay(a, { kind: "configure_policy", idempotencyKey: "policy", expectedVersion: 0, vatWithholdingAgent: true, islrWithholdingAgent: true });
  await execute(a, debt("debt-pay"));
  const payDebt = (client, id) => pay(client, { kind: "execute_supplier_payment", idempotencyKey: id, paymentId: id, supplierId: "supplier-1", method: "cash", account: { kind: "cash_box", id: "cash-1" }, occurredAt: "2026-10-10", money: money("40.00"), lines: [{ lineId: `${id}-line`, documentId: "debt-pay", amount: "40.00" }] });
  const paid = await Promise.allSettled([payDebt(a, "pay-a"), payDebt(b, "pay-b")]);
  assert.equal(paid.filter((item) => item.status === "fulfilled").length, 1, "two concurrent payments cannot both consume the same debt");
  assert.equal((await admin.query("select public.shared_payables_open_amount($1,'debt-pay')::text v", [scope.tenantId])).rows[0].v, "20.00000000");
  assert.equal((await admin.query("select coalesce(sum(case when direction='credit' then amount else -amount end),0)::text v from public.shared_treasury_ledger_entries where tenant_id=$1 and account_id='cash-1'", [scope.tenantId])).rows[0].v, "960.00000000", "only the committed payment debits treasury");

  const batchCommand = (client, body) => client.query("select public.shared_payables_batch_command($1::jsonb,$2::jsonb) result", [JSON.stringify(scope), JSON.stringify({ correlationId: "c", ...body })]).then((result) => result.rows[0].result);
  await execute(a, debt("debt-batch"));
  for (const id of ["lot-a", "lot-b"]) await batchCommand(a, { kind: "create_payment_batch", idempotencyKey: id, batchId: id, supplierId: "supplier-1", plannedDate: "2026-10-20", currency: "VES" });
  const reserve = (client, id) => batchCommand(client, { kind: "set_payment_batch_item", idempotencyKey: `${id}-item`, itemId: `${id}-item`, batchId: id, documentId: "debt-batch", amount: "40", expectedVersion: 1 });
  const reserved = await Promise.allSettled([reserve(a, "lot-a"), reserve(b, "lot-b")]);
  assert.equal(reserved.filter((item) => item.status === "fulfilled").length, 1, "two batches cannot reserve more than the open balance");

  await execute(a, debt("debt-w1"));
  await execute(a, debt("debt-w2"));
  const withhold = (client, id, documentId) => pay(client, { kind: "execute_supplier_payment", idempotencyKey: id, paymentId: id, supplierId: "supplier-1", method: "cash", account: { kind: "cash_box", id: "cash-1" }, occurredAt: "2026-10-11", money: money("10.00"),
    lines: [{ lineId: `${id}-line`, documentId, amount: "10.00" }], withholdings: [{ id: `${id}-vat`, documentId, kind: "vat", rate: "100", taxableBaseVes: "5.00" }] });
  await Promise.all([withhold(a, "pw-1", "debt-w1"), withhold(b, "pw-2", "debt-w2")]);
  const numbers = (await admin.query("select receipt_number from public.shared_payables_withholdings where tenant_id=$1 order by receipt_number", [scope.tenantId])).rows.map((row) => row.receipt_number);
  assert.deepEqual(numbers, ["20261000000001", "20261000000002"], "concurrent withholdings receive distinct consecutive receipts");

  const before = (await admin.query("select (select count(*) from public.shared_payables_applications where tenant_id=$1)::int+(select count(*) from public.shared_payables_payments where tenant_id=$1)::int+(select count(*) from public.shared_payables_withholdings where tenant_id=$1)::int n", [scope.tenantId])).rows[0].n;
  await execute(a, { ...debt("debt-big"), idempotencyKey: "debt-big", principal: "5000.00" });
  await assert.rejects(pay(a, { kind: "execute_supplier_payment", idempotencyKey: "pay-big", paymentId: "pay-big", supplierId: "supplier-1", method: "cash", account: { kind: "cash_box", id: "cash-1" }, occurredAt: "2026-10-11", money: money("3000.00"),
    lines: [{ lineId: "pay-big-line", documentId: "debt-big", amount: "3000.00" }], withholdings: [{ id: "pay-big-vat", documentId: "debt-big", kind: "vat", rate: "75", taxableBaseVes: "100.00" }] }), /TREASURY_INSUFFICIENT_FUNDS/);
  const after = (await admin.query("select (select count(*) from public.shared_payables_applications where tenant_id=$1)::int+(select count(*) from public.shared_payables_payments where tenant_id=$1)::int+(select count(*) from public.shared_payables_withholdings where tenant_id=$1)::int n", [scope.tenantId])).rows[0].n;
  assert.equal(after, before, "a treasury rejection rolls back the payment, its applications and its withholding receipt");
  assert.equal((await admin.query("select max(receipt_number) m from public.shared_payables_withholdings where tenant_id=$1", [scope.tenantId])).rows[0].m, "20261000000002", "a rolled back receipt number is not consumed");

  console.log(JSON.stringify({ engine: "PostgreSQL", version: (await admin.query("show server_version")).rows[0].server_version, checks: ["migration installation without preseeded payables permissions", "concurrent idempotent manual create", "idempotency payload conflict", "due-date optimistic version", "same RIF and identifiers isolated across tenants", "purchase confirmation replay", "source void and reconfirm", "USD invoice rate snapshot", "credit-note application guard", "stable reporting query", "read-only transaction reads", "concurrent credit application", "concurrent installment plans", "concurrent payments on one document", "concurrent batch reservations", "concurrent withholding receipts", "treasury rejection rollback"], passed: true }));
} finally {
  await Promise.allSettled(clients.map((client) => client.end()));
  if (started) await control(pg_ctl, ["-D", cluster, "-m", "fast", "-w", "stop"]);
  // Retain the isolated cluster and logs in the task's temporary directory for inspection.
}
