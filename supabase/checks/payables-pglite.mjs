import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const pgliteModule = process.env.PAYABLES_PGLITE_MODULE ?? "@electric-sql/pglite";
const { PGlite } = await import(pgliteModule);
const db = new PGlite();
const fixture = await readFile(new URL("./payables-fixture.sql", import.meta.url), "utf8");
const migrations = [
  ["treasury foundation", await readFile(new URL("../migrations/20261001200000_treasury_foundation.sql", import.meta.url), "utf8")],
  ["treasury reconciliation reads", await readFile(new URL("../migrations/20261015143000_treasury_reconciliation_read_versions.sql", import.meta.url), "utf8")],
  ["treasury tax policy reads", await readFile(new URL("../migrations/20261016140000_treasury_tax_policy_reads.sql", import.meta.url), "utf8")],
  ["foundation", await readFile(new URL("../migrations/20261023140521_payables_foundation_and_purchase_source.sql", import.meta.url), "utf8")],
  ["operations", await readFile(new URL("../migrations/20261023140537_payables_credits_batches_and_payments.sql", import.meta.url), "utf8")],
  ["read-only authorization", await readFile(new URL("../migrations/20261023153431_payables_read_only_authorization.sql", import.meta.url), "utf8")],
  ["document commands", await readFile(new URL("../migrations/20261023183249_payables_document_commands.sql", import.meta.url), "utf8")],
  ["treasury source disbursement", await readFile(new URL("../migrations/20261023191047_treasury_source_disbursement.sql", import.meta.url), "utf8")],
  ["payments and withholdings", await readFile(new URL("../migrations/20261023191501_payables_payments_and_withholdings.sql", import.meta.url), "utf8")],
  ["accounting integration", await readFile(new URL("../migrations/20261023191644_payables_accounting_integration.sql", import.meta.url), "utf8")],
  ["withholding voucher", await readFile(new URL("../migrations/20261023192513_payables_withholding_voucher.sql", import.meta.url), "utf8")],
];

try {
  await db.exec(fixture);
} catch (error) {
  console.error(JSON.stringify({ fixture: true, message: error.message, code: error.code, detail: error.detail, hint: error.hint, where: error.where }));
  await db.close();
  process.exitCode = 1;
  throw new Error("Payables fixture failed in PGlite.");
}
for (const [name, sql] of migrations) {
  try {
    await db.exec(sql);
  } catch (error) {
    console.error(JSON.stringify({ migration: name, message: error.message, code: error.code, detail: error.detail, hint: error.hint, where: error.where }));
    await db.close();
    process.exitCode = 1;
    throw new Error(`Payables ${name} migration failed in PGlite.`);
  }
}

const scope = { tenantId: "00000000-0000-4000-8000-000000000001", organizationId: "00000000-0000-4000-8000-000000000002", companyId: "company-1", actorId: "00000000-0000-4000-8000-000000000003" };
const readOnly = async (action) => {
  await db.exec("begin read only");
  try {
    return await action();
  } finally {
    await db.exec("rollback");
  }
};
const listDocuments = (requestScope = scope) => db.query("select public.shared_payables_query($1::jsonb,$2::jsonb) as result", [JSON.stringify(requestScope), JSON.stringify({ kind: "list_documents", limit: 10, offset: 0 })]);
const listPending = (requestScope = scope) => db.query("select public.shared_payables_reporting_query($1::jsonb,$2::jsonb) as result", [JSON.stringify(requestScope), JSON.stringify({ kind: "list_pending", limit: 10, offset: 0 })]);
await readOnly(() => listDocuments());
await readOnly(() => listPending());
const deniedScope = { ...scope, actorId: "00000000-0000-4000-8000-000000000099" };
await assert.rejects(() => readOnly(() => listDocuments(deniedScope)), /ORGANIZATIONAL_USER_ACCESS_DENIED/);
await assert.rejects(() => readOnly(() => listPending(deniedScope)), /ORGANIZATIONAL_USER_ACCESS_DENIED/);
const command = {
  kind: "create_manual_document", idempotencyKey: "manual-1", correlationId: "correlation-1", documentId: "manual-1", supplierId: "supplier-1",
  documentNumber: "M-001", concept: "Servicio", issuedAt: "2026-10-01", dueAt: "2026-10-31", currency: "VES", principal: "100.00",
  rateSnapshot: { amount: "100.00", baseCurrency: "VES", rate: "1", source: "VES identity", effectiveDate: "2026-10-01", policyVersion: "v1", rounding: "half_up" },
};
const created = await db.query("select public.shared_payables_execute_command($1::jsonb,$2::jsonb) as result", [JSON.stringify(scope), JSON.stringify(command)]);
assert.equal(created.rows[0].result.commandId, "manual-1");
const replay = await db.query("select public.shared_payables_execute_command($1::jsonb,$2::jsonb) as result", [JSON.stringify(scope), JSON.stringify(command)]);
assert.equal(replay.rows[0].result.replayed, true);
await assert.rejects(() => db.query("select public.shared_payables_execute_command($1::jsonb,$2::jsonb)", [JSON.stringify(scope), JSON.stringify({ ...command, principal: "101.00" })]), /PAYABLES_IDEMPOTENCY_CONFLICT/);

const changed = { kind: "change_due_date", idempotencyKey: "due-1", correlationId: "correlation-2", changeId: "change-1", documentId: "manual-1", dueAt: "2026-11-15", reason: "Acuerdo de plazo", expectedVersion: 1 };
const changedResult = await db.query("select public.shared_payables_execute_command($1::jsonb,$2::jsonb) as result", [JSON.stringify(scope), JSON.stringify(changed)]);
assert.equal(changedResult.rows[0].result.versions["manual-1"], 2);
const listed = await listDocuments();
assert.equal(listed.rows[0].result.rows[0].document.principal, "100.00000000");
assert.equal(listed.rows[0].result.rows[0].balance, "100.00000000");
const report = await listPending();
assert.equal(report.rows[0].result.total, 1);
assert.equal(report.rows[0].result.rows[0].documentId, "manual-1");

await db.query("insert into public.shared_inventory_purchase_invoices(tenant_id,id,company_id,supplier_id,invoice_number,invoice_date,status,subtotal,vat_amount,total,dollar_rate,payment_terms,credit_days,currency_code,paid_at_registration) values($1,'purchase-1','company-1','supplier-1','F-001','2026-10-02','borrador',100,16,116,1,'credito',30,'VES',false)", [scope.tenantId]);
await db.query("update public.shared_inventory_purchase_invoices set status='confirmada' where tenant_id=$1 and id='purchase-1'", [scope.tenantId]);
const purchase = await db.query("select principal::text,status,due_at::text from public.shared_payables_documents where tenant_id=$1 and source_id='purchase-1'", [scope.tenantId]);
assert.deepEqual(purchase.rows[0], { principal: "116.00000000", status: "open", due_at: "2026-11-01" });
await db.query("insert into public.shared_inventory_purchase_invoices(tenant_id,id,company_id,supplier_id,invoice_number,invoice_date,status,subtotal,vat_amount,total,financial_tax_amount,vat_retention_amount,taxes,payment_terms,credit_days,currency_code) values($1,'purchase-tax','company-1','supplier-1','F-002','2026-10-02','borrador',100,16,116,3,3,'[{\"monto\":5}]','contado',0,'VES')", [scope.tenantId]);
await db.query("update public.shared_inventory_purchase_invoices set status='confirmada' where tenant_id=$1 and id='purchase-tax'", [scope.tenantId]);
const gross = await db.query("select principal::text from public.shared_payables_documents where tenant_id=$1 and source_id='purchase-tax'", [scope.tenantId]);
assert.equal(gross.rows[0].principal, "124.00000000");
const taxApplied = await db.query("select sum(amount)::text as amount from public.shared_payables_applications where tenant_id=$1 and document_id='purchase:purchase-tax'", [scope.tenantId]);
assert.equal(taxApplied.rows[0].amount, "3.00000000");
// A purchase's own withholdings follow the purchase: unconfirming reverses them and voids the payable,
// and confirming again reactivates the same facts instead of duplicating them.
await db.query("update public.shared_inventory_purchase_invoices set status='borrador' where tenant_id=$1 and id='purchase-tax'", [scope.tenantId]);
const releasedTax = await db.query("select d.status,(select count(*)::int from public.shared_payables_applications a where a.tenant_id=d.tenant_id and a.document_id=d.id and a.reversed_at is null) active from public.shared_payables_documents d where d.tenant_id=$1 and d.id='purchase:purchase-tax'", [scope.tenantId]);
assert.deepEqual(releasedTax.rows[0], { status: "voided", active: 0 });
await db.query("update public.shared_inventory_purchase_invoices set status='confirmada' where tenant_id=$1 and id='purchase-tax'", [scope.tenantId]);
const restoredTax = await db.query("select d.status,(select sum(a.amount)::text from public.shared_payables_applications a where a.tenant_id=d.tenant_id and a.document_id=d.id and a.reversed_at is null) applied,(select count(*)::int from public.shared_payables_applications a where a.tenant_id=d.tenant_id and a.document_id=d.id) facts from public.shared_payables_documents d where d.tenant_id=$1 and d.id='purchase:purchase-tax'", [scope.tenantId]);
assert.deepEqual(restoredTax.rows[0], { status: "open", applied: "3.00000000", facts: 1 });
await db.query("insert into public.shared_inventory_purchase_invoices(tenant_id,id,company_id,supplier_id,invoice_number,invoice_date,status,subtotal,vat_amount,total,dollar_rate,vat_retention_amount,payment_terms,credit_days,currency_code) values($1,'purchase-usd','company-1','supplier-1','F-USD','2026-10-04','borrador',100,16,116,2,4,'credito',15,'USD')", [scope.tenantId]);
await db.query("update public.shared_inventory_purchase_invoices set status='confirmada' where tenant_id=$1 and id='purchase-usd'", [scope.tenantId]);
const usd = await db.query("select principal::text,currency from public.shared_payables_documents where tenant_id=$1 and source_id='purchase-usd'", [scope.tenantId]);
assert.deepEqual(usd.rows[0], { principal: "58.00000000", currency: "USD" });
const usdRetention = await db.query("select amount::text from public.shared_payables_applications where tenant_id=$1 and document_id='purchase:purchase-usd'", [scope.tenantId]);
assert.equal(usdRetention.rows[0].amount, "2.00000000");
await db.query("update public.shared_inventory_purchase_invoices set status='borrador' where tenant_id=$1 and id='purchase-1'", [scope.tenantId]);
const voided = await db.query("select status from public.shared_payables_documents where tenant_id=$1 and source_id='purchase-1'", [scope.tenantId]);
assert.equal(voided.rows[0].status, "voided");
await db.query("update public.shared_inventory_purchase_invoices set status='confirmada' where tenant_id=$1 and id='purchase-1'", [scope.tenantId]);
const reopened = await db.query("select status,principal::text from public.shared_payables_documents where tenant_id=$1 and source_id='purchase-1'", [scope.tenantId]);
assert.deepEqual(reopened.rows[0], { status: "open", principal: "116.00000000" });
await db.query("insert into public.shared_inventory_purchase_invoices(tenant_id,id,company_id,supplier_id,invoice_number,invoice_date,status,subtotal,vat_amount,total,document_type,affected_invoice_id,currency_code) values($1,'credit-1','company-1','supplier-1','NC-001','2026-10-03','borrador',-8.62,-1.38,-10,'nota_credito','purchase-1','VES')", [scope.tenantId]);
await db.query("update public.shared_inventory_purchase_invoices set status='confirmada' where tenant_id=$1 and id='credit-1'", [scope.tenantId]);
const balanceAfterCredit = await db.query("select greatest(d.principal-coalesce(sum(a.amount),0),0)::text as balance from public.shared_payables_documents d left join public.shared_payables_applications a on a.tenant_id=d.tenant_id and a.document_id=d.id where d.tenant_id=$1 and d.source_id='purchase-1' group by d.tenant_id,d.id,d.principal", [scope.tenantId]);
assert.equal(balanceAfterCredit.rows[0].balance, "106.00000000");
await assert.rejects(() => db.query("update public.shared_inventory_purchase_invoices set status='borrador' where tenant_id=$1 and id='purchase-1'", [scope.tenantId]), /PAYABLES_HAS_APPLICATIONS/);
const count = await db.query("select count(*)::int as count from public.shared_payables_documents where tenant_id=$1 and source_id='purchase-1'", [scope.tenantId]);
assert.equal(count.rows[0].count, 1);

const batchScope = { ...scope, idempotencyKey: "batch-create", correlationId: "batch-correlation" };
const createdBatch = await db.query("select public.shared_payables_batch_command($1::jsonb,$2::jsonb) as result", [JSON.stringify(scope), JSON.stringify({ ...batchScope, kind: "create_payment_batch", batchId: "batch-1", supplierId: "supplier-1", plannedDate: "2026-10-30", currency: "VES" })]);
assert.equal(createdBatch.rows[0].result.commandId, "batch-1");
await db.query("select public.shared_payables_batch_command($1::jsonb,$2::jsonb)", [JSON.stringify(scope), JSON.stringify({ kind: "set_payment_batch_item", idempotencyKey: "batch-item", correlationId: "batch-item-correlation", itemId: "batch-item-1", batchId: "batch-1", documentId: "manual-1", amount: "25", expectedVersion: 1 })]);
const batchList = await db.query("select public.shared_payables_reporting_query($1::jsonb,$2::jsonb) as result", [JSON.stringify(scope), JSON.stringify({ kind: "payment_batches", limit: 10, offset: 0 })]);
assert.equal(batchList.rows[0].result.rows[0].reserved, "25.00000000");
await db.query("select public.shared_payables_batch_command($1::jsonb,$2::jsonb)", [JSON.stringify(scope), JSON.stringify({ kind: "submit_payment_batch", idempotencyKey: "batch-submit", correlationId: "batch-submit-correlation", batchId: "batch-1", expectedVersion: 1 })]);
const authorized = await db.query("select public.shared_payables_batch_command($1::jsonb,$2::jsonb) as result", [JSON.stringify(scope), JSON.stringify({ kind: "authorize_payment_batch", idempotencyKey: "batch-authorize", correlationId: "batch-authorize-correlation", batchId: "batch-1", expectedVersion: 2, decision: "authorized", separationRequired: false })]);
assert.equal(authorized.rows[0].result.status, "authorized");

// Corte 2: credits, adjustments, installments and opening balances.
const run = (body) => db.query("select public.shared_payables_execute_command($1::jsonb,$2::jsonb) as result", [JSON.stringify(scope), JSON.stringify({ correlationId: `c-${body.idempotencyKey}`, ...body })]).then((result) => result.rows[0].result);
const open = async (id) => (await db.query("select public.shared_payables_open_amount($1,$2)::text as amount,(select status from public.shared_payables_documents where tenant_id=$1 and id=$2) status", [scope.tenantId, id])).rows[0];
const ves = { amount: "0", baseCurrency: "VES", rate: "1", source: "VES identity", effectiveDate: "2026-10-05", policyVersion: "v1", rounding: "half_up" };
const creditNote = await open("purchase:credit-1");
assert.deepEqual(creditNote, { amount: "0.00000000", status: "settled" }, "a fiscal credit note becomes a consumed credit document");
await run({ kind: "create_adjustment", idempotencyKey: "adj-pos", documentId: "adj-pos", direction: "positive", supplierId: "supplier-1", documentNumber: "AJ+1", concept: "Flete omitido", reason: "Cargo acordado", issuedAt: "2026-10-05", dueAt: "2026-10-20", currency: "VES", principal: "40.00", rateSnapshot: ves });
await run({ kind: "create_adjustment", idempotencyKey: "adj-neg", documentId: "adj-neg", direction: "negative", supplierId: "supplier-1", documentNumber: "AJ-1", concept: "Descuento", reason: "Descuento comercial", issuedAt: "2026-10-05", currency: "VES", principal: "50.00", rateSnapshot: ves });
assert.equal((await db.query("select side,due_at::text from public.shared_payables_documents where tenant_id=$1 and id='adj-neg'", [scope.tenantId])).rows[0].side, "credit");
await assert.rejects(() => run({ kind: "apply_credit", idempotencyKey: "apply-over", creditDocumentId: "adj-neg", occurredAt: "2026-10-06", allocations: [{ applicationId: "ap-over", documentId: "adj-pos", amount: "40.00" }, { applicationId: "ap-over-2", documentId: "purchase:purchase-1", amount: "10.01" }] }), /PAYABLES_EXCEEDS_BALANCE/);
await assert.rejects(() => run({ kind: "apply_credit", idempotencyKey: "apply-reserved", creditDocumentId: "adj-neg", occurredAt: "2026-10-06", allocations: [{ applicationId: "ap-reserved", documentId: "manual-1", amount: "76.00" }] }), /PAYABLES_EXCEEDS_BALANCE/, "reserved batch amounts cannot be consumed by a credit");
await assert.rejects(() => run({ kind: "apply_credit", idempotencyKey: "apply-usd", creditDocumentId: "adj-neg", occurredAt: "2026-10-06", allocations: [{ applicationId: "ap-usd", documentId: "purchase:purchase-usd", amount: "1.00" }] }), /PAYABLES_CURRENCY_MISMATCH/);
const applied = await run({ kind: "apply_credit", idempotencyKey: "apply-ok", creditDocumentId: "adj-neg", occurredAt: "2026-10-06", allocations: [{ applicationId: "ap-1", documentId: "adj-pos", amount: "40.00" }, { applicationId: "ap-2", documentId: "purchase:purchase-1", amount: "10.00" }] });
assert.deepEqual(applied.affectedIds, ["ap-1", "ap-2"]);
assert.deepEqual(await open("adj-pos"), { amount: "0.00000000", status: "settled" });
assert.deepEqual(await open("adj-neg"), { amount: "0.00000000", status: "settled" });
assert.deepEqual(await open("purchase:purchase-1"), { amount: "96.00000000", status: "open" });
await run({ kind: "reverse_credit_application", idempotencyKey: "rev-1", applicationId: "ap-1", reason: "Aplicación errada" });
assert.deepEqual(await open("adj-pos"), { amount: "40.00000000", status: "open" });
assert.deepEqual(await open("adj-neg"), { amount: "40.00000000", status: "open" });
await assert.rejects(() => run({ kind: "reverse_credit_application", idempotencyKey: "rev-1b", applicationId: "ap-1", reason: "Otra vez" }), /PAYABLES_INVALID/);

const parent = (await db.query("select version from public.shared_payables_documents where tenant_id=$1 and id='purchase:purchase-1'", [scope.tenantId])).rows[0].version;
await assert.rejects(() => run({ kind: "create_installment_plan", idempotencyKey: "plan-bad", planId: "plan-bad", documentId: "purchase:purchase-1", expectedVersion: parent, installments: [{ documentId: "g-bad-1", amount: "48.00", dueAt: "2026-11-01" }, { documentId: "g-bad-2", amount: "47.99", dueAt: "2026-12-01" }] }), /PAYABLES_EXCEEDS_BALANCE/);
const plan = await run({ kind: "create_installment_plan", idempotencyKey: "plan-1", planId: "plan-1", documentId: "purchase:purchase-1", expectedVersion: parent, installments: [{ documentId: "g-1", amount: "48.00", dueAt: "2026-11-01" }, { documentId: "g-2", amount: "48.00", dueAt: "2026-12-01" }] });
assert.equal(plan.commandId, "plan-1");
assert.deepEqual(await open("purchase:purchase-1"), { amount: "0.00000000", status: "settled" });
assert.deepEqual(await open("g-2"), { amount: "48.00000000", status: "open" });
await run({ kind: "apply_credit", idempotencyKey: "apply-g1", creditDocumentId: "adj-neg", occurredAt: "2026-10-07", allocations: [{ applicationId: "ap-g1", documentId: "g-1", amount: "5.00" }] });
await assert.rejects(() => run({ kind: "undo_installment_plan", idempotencyKey: "undo-blocked", planId: "plan-1", expectedVersion: 1, reason: "Renegociado" }), /PAYABLES_HAS_APPLICATIONS/);
await run({ kind: "reverse_credit_application", idempotencyKey: "rev-g1", applicationId: "ap-g1", reason: "Liberar giro" });
await run({ kind: "undo_installment_plan", idempotencyKey: "undo-1", planId: "plan-1", expectedVersion: 1, reason: "Renegociado" });
assert.deepEqual(await open("purchase:purchase-1"), { amount: "96.00000000", status: "open" });
assert.equal((await open("g-1")).status, "voided");

await run({ kind: "import_opening_document", idempotencyKey: "opening-1", documentId: "opening-1", supplierId: "supplier-1", documentNumber: "F-2019-77", concept: "Saldo inicial", evidence: "Estado de cuenta al 30/09", issuedAt: "2019-05-01", dueAt: "2019-06-01", currency: "VES", principal: "12.50", rateSnapshot: ves });
await assert.rejects(() => run({ kind: "import_opening_document", idempotencyKey: "opening-dup", documentId: "opening-dup", supplierId: "supplier-1", documentNumber: "F-2019-77", concept: "Saldo inicial", evidence: "Duplicado", issuedAt: "2019-05-01", dueAt: "2019-06-01", currency: "VES", principal: "12.50", rateSnapshot: ves }), /PAYABLES_SOURCE_ALREADY_REGISTERED/);
await db.query("insert into public.shared_accounting_periods(tenant_id,id,company_id,start_date,end_date,status) values($1,'2026-09','company-1','2026-09-01','2026-09-30','closed')", [scope.tenantId]);
await assert.rejects(() => run({ kind: "create_adjustment", idempotencyKey: "adj-closed", documentId: "adj-closed", direction: "positive", supplierId: "supplier-1", concept: "Cargo", reason: "Retroactivo", issuedAt: "2026-09-15", dueAt: "2026-09-30", currency: "VES", principal: "1.00", rateSnapshot: ves }), /PAYABLES_PERIOD_CLOSED/);

// A fiscal credit note larger than the invoice keeps the remainder as available credit,
// and unconfirming it reverses only its own application.
await db.query("insert into public.shared_inventory_purchase_invoices(tenant_id,id,company_id,supplier_id,invoice_number,invoice_date,status,subtotal,vat_amount,total,payment_terms,credit_days,currency_code) values($1,'small','company-1','supplier-1','F-S','2026-10-08','borrador',10,0,10,'credito',10,'VES')", [scope.tenantId]);
await db.query("update public.shared_inventory_purchase_invoices set status='confirmada' where tenant_id=$1 and id='small'", [scope.tenantId]);
await db.query("insert into public.shared_inventory_purchase_invoices(tenant_id,id,company_id,supplier_id,invoice_number,invoice_date,status,subtotal,vat_amount,total,document_type,affected_invoice_id,currency_code) values($1,'nc-big','company-1','supplier-1','NC-B','2026-10-09','borrador',-25,0,-25,'nota_credito','small','VES')", [scope.tenantId]);
await db.query("update public.shared_inventory_purchase_invoices set status='confirmada' where tenant_id=$1 and id='nc-big'", [scope.tenantId]);
assert.deepEqual(await open("purchase:small"), { amount: "0.00000000", status: "settled" });
assert.deepEqual(await open("purchase:nc-big"), { amount: "15.00000000", status: "open" });
await db.query("update public.shared_inventory_purchase_invoices set status='borrador' where tenant_id=$1 and id='nc-big'", [scope.tenantId]);
assert.deepEqual(await open("purchase:small"), { amount: "10.00000000", status: "open" });
assert.equal((await open("purchase:nc-big")).status, "voided");

const detail = await readOnly(() => db.query("select public.shared_payables_reporting_query($1::jsonb,$2::jsonb) as result", [JSON.stringify(scope), JSON.stringify({ kind: "document_detail", documentId: "purchase:purchase-1", limit: 1, offset: 0 })]));
const detailRow = detail.rows[0].result.rows[0];
assert.equal(detailRow.openAmount, "96.00000000");
assert.equal(detailRow.installmentPlans[0].status, "undone");
assert.ok(detailRow.counterparts.some((row) => row.documentId === "adj-neg" && row.balance === "40.00000000"));

// Cortes 3 y 4: payments through the real Treasury writer, withholdings, void/reverse, batches and policy.
const t = scope.tenantId;
await db.exec(`
  insert into public.shared_treasury_cash_boxes(tenant_id,id,company_id,code,name,currency,responsible_actor_id) values('${t}','cash-1','company-1','C1','Caja principal','VES','${scope.actorId}');
  insert into public.shared_treasury_banks(tenant_id,id,company_id,code,name,country_code) values('${t}','bank-1','company-1','0102','Banco de Venezuela','VE');
  insert into public.shared_treasury_bank_accounts(tenant_id,id,company_id,bank_id,currency,holder_name,account_number,account_number_hash) values('${t}','acct-ves','company-1','bank-1','VES','Empresa','01020000000000001234','h1');
  insert into public.shared_treasury_checkbooks(tenant_id,id,company_id,bank_account_id,first_number,last_number,next_number) values('${t}','book-1','company-1','acct-ves',1,50,1);
  insert into public.shared_treasury_idb_rules(tenant_id,id,company_id,effective_from,rate,base_currency,rounding,legal_basis,approval_reference,subject_types) values('${t}','idb','company-1','2026-01-01',2,'VES','half_up','LIGTF','test','["bank_debit","check_issue"]');
`);
const fund = (id, kind, account) => db.query("select public.treasury_insert_ledger($1,'company-1','{}'::jsonb,$2,$3::jsonb,'credit',$4::jsonb,'2026-10-01','2026-10-01','Fondeo','opening',null,null)", [t, id, JSON.stringify({ kind, id: account }), JSON.stringify({ amount: "1000", currency: "VES", operationalValue: { baseCurrency: "VES", amount: "1000", rate: "1", source: "identity", asOf: "2026-10-01", policyVersion: "v1", rounding: "half_up" } })]);
await fund("fund-cash", "cash_box", "cash-1");
await fund("fund-bank", "bank_account", "acct-ves");
const balanceOf = async (kind, account) => (await db.query("select coalesce(sum(case when direction='credit' then amount else -amount end),0)::text b from public.shared_treasury_ledger_entries where tenant_id=$1 and account_kind=$2 and account_id=$3 and status in ('posted','reversed')", [t, kind, account])).rows[0].b;
const payCommand = (body, actor = scope.actorId) => db.query("select public.shared_payables_payment_command($1::jsonb,$2::jsonb) as result", [JSON.stringify({ ...scope, actorId: actor }), JSON.stringify({ correlationId: `c-${body.idempotencyKey}`, ...body })]).then((result) => result.rows[0].result);
const vesMoney = (amount, date = "2026-10-10") => ({ amount, currency: "VES", operationalValue: { baseCurrency: "VES", amount, rate: "1", source: "VES identity", asOf: date, policyVersion: "v1", rounding: "half_up" } });

await assert.rejects(() => payCommand({ kind: "execute_supplier_payment", idempotencyKey: "pay-noagent", paymentId: "pay-noagent", supplierId: "supplier-1", method: "cash", account: { kind: "cash_box", id: "cash-1" }, occurredAt: "2026-10-10", money: vesMoney("10.00"), lines: [{ lineId: "l-noagent", documentId: "adj-pos", amount: "10.00" }], withholdings: [{ id: "w-noagent", documentId: "adj-pos", kind: "vat", rate: "75", taxableBaseVes: "1.60" }] }), /PAYABLES_FORBIDDEN/, "only withholding agents may withhold");
await payCommand({ kind: "configure_policy", idempotencyKey: "policy-1", expectedVersion: 0, vatWithholdingAgent: true, islrWithholdingAgent: true, separationRequired: false, negativeAdjustmentThresholdVes: "10" });

const cash = await payCommand({ kind: "execute_supplier_payment", idempotencyKey: "pay-cash", paymentId: "pay-cash", supplierId: "supplier-1", method: "cash", account: { kind: "cash_box", id: "cash-1" }, occurredAt: "2026-10-10", money: vesMoney("40.00"), lines: [{ lineId: "l-cash", documentId: "adj-pos", amount: "40.00" }] });
assert.equal(cash.ledgerEntryId, "pay-cash:disbursement");
assert.deepEqual(await open("adj-pos"), { amount: "0.00000000", status: "settled" }, "CXP-018: a full application settles the document");
assert.equal(await balanceOf("cash_box", "cash-1"), "960.00000000");
const replayPay = await payCommand({ kind: "execute_supplier_payment", idempotencyKey: "pay-cash", paymentId: "pay-cash", supplierId: "supplier-1", method: "cash", account: { kind: "cash_box", id: "cash-1" }, occurredAt: "2026-10-10", money: vesMoney("40.00"), lines: [{ lineId: "l-cash", documentId: "adj-pos", amount: "40.00" }] });
assert.equal(replayPay.replayed, true);
await assert.rejects(() => payCommand({ kind: "execute_supplier_payment", idempotencyKey: "pay-over", paymentId: "pay-over", supplierId: "supplier-1", method: "cash", account: { kind: "cash_box", id: "cash-1" }, occurredAt: "2026-10-10", money: vesMoney("50.00"), lines: [{ lineId: "l-over", documentId: "purchase:purchase-1", amount: "40.00" }] }), /PAYABLES_INVALID/, "D4: lines must consume the whole payment");
await run({ kind: "create_adjustment", idempotencyKey: "adj-huge", documentId: "adj-huge", direction: "positive", supplierId: "supplier-1", concept: "Equipo", reason: "Compra mayor", issuedAt: "2026-10-05", dueAt: "2026-11-30", currency: "VES", principal: "5000.00", rateSnapshot: ves });
const factsBefore = (await db.query("select (select count(*) from public.shared_payables_applications where tenant_id=$1)::int+(select count(*) from public.shared_payables_payments where tenant_id=$1)::int n", [t])).rows[0].n;
await assert.rejects(() => payCommand({ kind: "execute_supplier_payment", idempotencyKey: "pay-funds", paymentId: "pay-funds", supplierId: "supplier-1", method: "cash", account: { kind: "cash_box", id: "cash-1" }, occurredAt: "2026-10-10", money: vesMoney("2000.00"), lines: [{ lineId: "l-funds", documentId: "adj-huge", amount: "2000.00" }] }), /TREASURY_INSUFFICIENT_FUNDS/, "cash boxes never overdraw");
await assert.rejects(() => payCommand({ kind: "execute_supplier_payment", idempotencyKey: "pay-exceeds", paymentId: "pay-exceeds", supplierId: "supplier-1", method: "cash", account: { kind: "cash_box", id: "cash-1" }, occurredAt: "2026-10-10", money: vesMoney("20.00"), lines: [{ lineId: "l-exceeds", documentId: "opening-1", amount: "20.00" }] }), /PAYABLES_EXCEEDS_BALANCE/, "D4: no overpayment");
const factsAfter = (await db.query("select (select count(*) from public.shared_payables_applications where tenant_id=$1)::int+(select count(*) from public.shared_payables_payments where tenant_id=$1)::int n", [t])).rows[0].n;
assert.equal(factsAfter, factsBefore, "a rejected disbursement rolls back every payable fact");
assert.equal(await balanceOf("cash_box", "cash-1"), "960.00000000");

// CXP-022/023: a USD debt paid in VES at today's rates; the snapshot only measures the difference.
const usdPayment = await payCommand({ kind: "execute_supplier_payment", idempotencyKey: "pay-usd", paymentId: "pay-usd", supplierId: "supplier-1", method: "cash", account: { kind: "cash_box", id: "cash-1" }, occurredAt: "2026-10-10", money: vesMoney("60.00"), rates: { USD: { rate: "3", source: "bcv" } }, lines: [{ lineId: "l-usd", documentId: "purchase:purchase-usd", amount: "60.00" }] });
const usdLine = (await db.query("select applied_amount::text,exchange_difference_ves::text,debt_rate::text,debt_current_rate::text from public.shared_payables_payment_lines where tenant_id=$1 and id='l-usd'", [t])).rows[0];
assert.deepEqual(usdLine, { applied_amount: "20.00000000", exchange_difference_ves: "20.00000000", debt_rate: "2.00000000", debt_current_rate: "3.00000000" });
assert.ok(usdPayment.affectedIds.includes("purchase:purchase-usd"));

// CXP-020: check from the next checkbook number; one debit plus IDB at issue.
await run({ kind: "create_adjustment", idempotencyKey: "adj-chk", documentId: "adj-chk", direction: "positive", supplierId: "supplier-1", concept: "Servicio", reason: "Cargo", issuedAt: "2026-10-05", dueAt: "2026-10-30", currency: "VES", principal: "30.00", rateSnapshot: ves });
const check = await payCommand({ kind: "execute_supplier_payment", idempotencyKey: "pay-chk", paymentId: "pay-chk", supplierId: "supplier-1", method: "check", checkbookId: "book-1", account: { kind: "bank_account", id: "acct-ves" }, occurredAt: "2026-10-10", money: vesMoney("30.00"), lines: [{ lineId: "l-chk", documentId: "adj-chk", amount: "30.00" }] });
assert.equal(check.checkNumber, "1");
assert.equal(await balanceOf("bank_account", "acct-ves"), "969.40000000", "check debit plus 2% IDB");

// CXP-021/024/025: transfer with VAT and ISLR withheld at payment, sharing correlatives.
await run({ kind: "create_adjustment", idempotencyKey: "adj-w", documentId: "adj-w", direction: "positive", supplierId: "supplier-1", concept: "Servicio", reason: "Honorarios", issuedAt: "2026-10-05", dueAt: "2026-10-30", currency: "VES", principal: "100.00", rateSnapshot: ves });
await assert.rejects(() => payCommand({ kind: "execute_supplier_payment", idempotencyKey: "pay-noref", paymentId: "pay-noref", supplierId: "supplier-1", method: "transfer", account: { kind: "bank_account", id: "acct-ves" }, occurredAt: "2026-10-11", money: vesMoney("10.00"), lines: [{ lineId: "l-noref", documentId: "adj-w", amount: "10.00" }] }), /TREASURY_INVALID/, "a transfer requires its reference");
const withheld = await payCommand({ kind: "execute_supplier_payment", idempotencyKey: "pay-w1", paymentId: "pay-w1", supplierId: "supplier-1", method: "transfer", reference: "REF-1", account: { kind: "bank_account", id: "acct-ves" }, occurredAt: "2026-10-11", money: vesMoney("50.00"),
  lines: [{ lineId: "l-w1", documentId: "adj-w", amount: "50.00" }], withholdings: [{ id: "w-vat-1", documentId: "adj-w", kind: "vat", rate: "100", taxableBaseVes: "16.00" }, { id: "w-islr-1", documentId: "adj-w", kind: "islr", rate: "2", taxableBaseVes: "100.00", subtrahendVes: "0", conceptCode: "053", taxUnitValue: "9" }] });
assert.deepEqual(withheld.warnings, []);
const receipts = (await db.query("select kind,receipt_number,amount_ves::text from public.shared_payables_withholdings where tenant_id=$1 order by kind", [t])).rows;
assert.deepEqual(receipts, [{ kind: "islr", receipt_number: "202600000001", amount_ves: "2.00000000" }, { kind: "vat", receipt_number: "20261000000001", amount_ves: "16.00000000" }]);
assert.deepEqual(await open("adj-w"), { amount: "32.00000000", status: "open" }, "payment 50 + VAT 16 + ISLR 2 reduce the 100 debt");
await assert.rejects(() => payCommand({ kind: "execute_supplier_payment", idempotencyKey: "pay-w2", paymentId: "pay-w2", supplierId: "supplier-1", method: "transfer", reference: "REF-2", account: { kind: "bank_account", id: "acct-ves" }, occurredAt: "2026-10-11", money: vesMoney("10.00"), lines: [{ lineId: "l-w2", documentId: "adj-w", amount: "10.00" }], withholdings: [{ id: "w-vat-2", documentId: "adj-w", kind: "vat", rate: "75", taxableBaseVes: "16.00" }] }), /PAYABLES_WITHHOLDING_DUPLICATE/);
const late = await payCommand({ kind: "execute_supplier_payment", idempotencyKey: "pay-late", paymentId: "pay-late", supplierId: "supplier-1", method: "cash", account: { kind: "cash_box", id: "cash-1" }, occurredAt: "2026-10-12", money: vesMoney("10.00"), lines: [{ lineId: "l-late", documentId: "purchase:purchase-1", amount: "10.00" }], withholdings: [{ id: "w-late", documentId: "purchase:purchase-1", kind: "islr", rate: "1", taxableBaseVes: "100.00", conceptCode: "053" }] });
assert.equal(late.warnings[0].code, "LATE_WITHHOLDING", "withholding a purchase registered earlier is allowed but flagged");
assert.equal((await db.query("select receipt_number from public.shared_payables_withholdings where tenant_id=$1 and id='w-late'", [t])).rows[0].receipt_number, "202600000002");

// CXP-028: void restores the debt and the cash box; CXP-029: reverse on its own date keeps the check number used.
const cashPayment = (await db.query("select version from public.shared_payables_payments where tenant_id=$1 and id='pay-cash'", [t])).rows[0].version;
await payCommand({ kind: "void_supplier_payment", idempotencyKey: "void-cash", paymentId: "pay-cash", expectedVersion: cashPayment, reason: "Registrado por error" });
assert.deepEqual(await open("adj-pos"), { amount: "40.00000000", status: "open" });
assert.equal((await db.query("select status from public.shared_payables_payments where tenant_id=$1 and id='pay-cash'", [t])).rows[0].status, "voided");
await payCommand({ kind: "reverse_supplier_payment", idempotencyKey: "rev-chk", paymentId: "pay-chk", expectedVersion: 1, reversalDate: "2026-10-15", reason: "Cheque devuelto" });
assert.equal((await db.query("select status from public.shared_treasury_checks where tenant_id=$1 and id='pay-chk:check'", [t])).rows[0].status, "voided");
assert.equal(await balanceOf("bank_account", "acct-ves"), "948.40000000", "1000 - check 30 - IDB 0.60 - transfer 50 - IDB 1 + reversal 30; the check IDB stays");
assert.equal((await db.query("select next_number::text from public.shared_treasury_checkbooks where tenant_id=$1 and id='book-1'", [t])).rows[0].next_number, "2", "a voided check number is never reused");
await payCommand({ kind: "mark_withholdings_declared", idempotencyKey: "declare-vat", withholdingKind: "vat", fiscalPeriod: "2026-10" });
await assert.rejects(() => payCommand({ kind: "void_supplier_payment", idempotencyKey: "void-w1", paymentId: "pay-w1", expectedVersion: 1, reason: "Error" }), /PAYABLES_WITHHOLDING_DECLARED/);

// CXP-013-016: executing the authorized batch pays its reserved items once.
const batchVersion = (await db.query("select version from public.shared_payables_payment_batches where tenant_id=$1 and id='batch-1'", [t])).rows[0].version;
await payCommand({ kind: "execute_payment_batch", idempotencyKey: "exec-batch", batchId: "batch-1", expectedVersion: batchVersion, method: "cash", account: { kind: "cash_box", id: "cash-1" }, occurredAt: "2026-10-12", money: vesMoney("25.00") });
assert.equal((await db.query("select status from public.shared_payables_payment_batches where tenant_id=$1 and id='batch-1'", [t])).rows[0].status, "executed");
assert.deepEqual(await open("manual-1"), { amount: "75.00000000", status: "open" });
assert.equal((await db.query("select public.shared_payables_reserved_amount($1,'manual-1')::text r", [t])).rows[0].r, "0", "execution releases the reservation");

// D8: policy separation and negative adjustment threshold are enforced in SQL.
await payCommand({ kind: "configure_policy", idempotencyKey: "policy-2", expectedVersion: 1, vatWithholdingAgent: true, islrWithholdingAgent: true, separationRequired: true, negativeAdjustmentThresholdVes: "10" });
const batch = (body) => db.query("select public.shared_payables_batch_command($1::jsonb,$2::jsonb) as result", [JSON.stringify(scope), JSON.stringify({ correlationId: "c", ...body })]).then((result) => result.rows[0].result);
await batch({ kind: "create_payment_batch", idempotencyKey: "b2", batchId: "batch-2", supplierId: "supplier-1", plannedDate: "2026-10-20", currency: "VES" });
await batch({ kind: "set_payment_batch_item", idempotencyKey: "b2-i", itemId: "b2-i", batchId: "batch-2", documentId: "adj-w", amount: "5", expectedVersion: 1 });
await batch({ kind: "submit_payment_batch", idempotencyKey: "b2-s", batchId: "batch-2", expectedVersion: 1 });
await assert.rejects(() => batch({ kind: "authorize_payment_batch", idempotencyKey: "b2-a", batchId: "batch-2", expectedVersion: 2, decision: "authorized", separationRequired: false }), /PAYABLES_FORBIDDEN/, "the policy, not the client flag, requires a second actor");
await run({ kind: "create_adjustment", idempotencyKey: "adj-big", documentId: "adj-big", direction: "negative", supplierId: "supplier-1", concept: "Descuento", reason: "Grande", issuedAt: "2026-10-12", currency: "VES", principal: "20.00", rateSnapshot: ves });
await assert.rejects(() => run({ kind: "apply_credit", idempotencyKey: "apply-big", creditDocumentId: "adj-big", occurredAt: "2026-10-12", allocations: [{ applicationId: "ap-big", documentId: "adj-pos", amount: "5.00" }] }), /PAYABLES_APPROVAL_PENDING/);
await assert.rejects(() => payCommand({ kind: "decide_adjustment", idempotencyKey: "approve-self", documentId: "adj-big", decision: "approved" }), /PAYABLES_FORBIDDEN/);
await payCommand({ kind: "decide_adjustment", idempotencyKey: "approve-other", documentId: "adj-big", decision: "approved" }, "00000000-0000-4000-8000-000000000013");
await run({ kind: "apply_credit", idempotencyKey: "apply-big-2", creditDocumentId: "adj-big", occurredAt: "2026-10-12", allocations: [{ applicationId: "ap-big", documentId: "adj-pos", amount: "5.00" }] });

// CXP-005/006/027/030: statement closing equals the supplier balance; reports agree.
const report2 = (query) => readOnly(() => db.query("select public.shared_payables_reporting_query($1::jsonb,$2::jsonb) as result", [JSON.stringify(scope), JSON.stringify({ limit: 200, offset: 0, ...query })])).then((result) => result.rows[0].result);
const balance = await report2({ kind: "supplier_balance", asOf: "2026-12-31" });
const statement = await report2({ kind: "supplier_statement", supplierId: "supplier-1", from: "2026-10-01", to: "2026-12-31" });
for (const total of balance.totals) assert.equal(Number(statement.totals.find((row) => row.currency === total.currency).closing), Number(total.net), `statement closes at the ${total.currency} balance`);
const aging = await report2({ kind: "aging", asOf: "2026-12-31" });
assert.ok(aging.totals.length >= 1 && aging.rows.length >= 1);
const history = await report2({ kind: "payment_history", supplierId: "supplier-1" });
assert.ok(history.rows.find((row) => row.id === "pay-w1").withholdings.length === 2);
const withholdingReport = await report2({ kind: "withholdings", withholdingKind: "vat", fiscalPeriod: "2026-10" });
assert.ok(withholdingReport.rows.some((row) => row.receiptNumber === "20261000000001" && row.status === "declared"));
const pending = await report2({ kind: "list_pending", currency: "VES", documentKind: "positive_adjustment" });
assert.ok(pending.rows.every((row) => row.kind === "positive_adjustment" && row.currency === "VES") && pending.totals[0].currency === "VES");
const settled = await report2({ kind: "list_settled" });
assert.ok(settled.rows.every((row) => row.settledAt), "CXP-004 shows the settlement date");
assert.ok((await report2({ kind: "treasury_accounts" })).rows.some((row) => row.kind === "bank_account" && row.checkbooks.length === 1));
assert.ok((await report2({ kind: "suppliers" })).rows.some((row) => row.id === "supplier-1"));

// Corte 5 (CXP-031): rules through the versioned configuration, one journal per payment, compensating journal on void.
const reconciliation = () => readOnly(() => db.query("select public.shared_payables_accounting_reconciliation($1::jsonb,$2::jsonb) as result", [JSON.stringify(scope), JSON.stringify({ limit: 200, offset: 0 })])).then((result) => result.rows[0].result);
assert.equal((await reconciliation()).rulesActive, false, "the view stays hidden while no rule is active");
await db.exec(`insert into public.shared_accounting_accounts(tenant_id,id,company_id,code,name,type) values
  ('${t}','acc-suppliers','company-1','2.1.01','Proveedores','liability'),('${t}','acc-cash','company-1','1.1.01','Caja y bancos','asset'),
  ('${t}','acc-vat','company-1','2.1.05','Retenciones IVA por enterar','liability'),('${t}','acc-islr','company-1','2.1.06','Retenciones ISLR por enterar','liability'),
  ('${t}','acc-loss','company-1','6.1.01','Pérdida cambiaria','expense'),('${t}','acc-gain','company-1','4.2.01','Ganancia cambiaria','revenue');
  insert into public.shared_accounting_periods(tenant_id,id,company_id,start_date,end_date,status) values('${t}','2026-10','company-1','2026-10-01','2026-10-31','open');`);
const config = (await db.query("select public.get_native_accounting_rule_configuration($1,$2,'company-1','payables.payment_posted') c", [scope.actorId, scope.organizationId])).rows[0].c;
await db.query("select public.replace_native_accounting_rule_configuration($1,$2,'company-1','payables.payment_posted',$3,$4::jsonb)", [scope.actorId, scope.organizationId, config.version, JSON.stringify([
  { id: "r-pay", amountField: "payment_amount", debitAccountId: "acc-suppliers", creditAccountId: "acc-cash", description: "Pago a proveedores", isActive: true },
  { id: "r-vat", amountField: "withholding_vat", debitAccountId: "acc-suppliers", creditAccountId: "acc-vat", description: "Retención IVA", isActive: true },
  { id: "r-islr", amountField: "withholding_islr", debitAccountId: "acc-suppliers", creditAccountId: "acc-islr", description: "Retención ISLR", isActive: true },
  { id: "r-loss", amountField: "exchange_loss", debitAccountId: "acc-loss", creditAccountId: "acc-suppliers", description: "Diferencial cambiario", isActive: true },
])]);
await assert.rejects(() => db.query("select public.replace_native_accounting_rule_configuration($1,$2,'company-1','payables.payment_posted',$3,$4::jsonb)", [scope.actorId, scope.organizationId, config.version, "[]"]), /STALE/, "rule configuration is optimistic");
const accounting = (body) => db.query("select public.shared_payables_accounting_command($1::jsonb,$2::jsonb) as result", [JSON.stringify(scope), JSON.stringify(body)]).then((result) => result.rows[0].result);
const posted = await accounting({ kind: "post_payment_accounting", paymentId: "pay-w1" });
const journal = (await db.query("select type,account_id,amount::text from public.shared_accounting_entry_lines where tenant_id=$1 and entry_id=$2 order by type,account_id", [t, posted.journalEntryId])).rows;
assert.deepEqual(journal.map((row) => JSON.stringify(row)).sort(), [
  { type: "credit", account_id: "acc-cash", amount: "50.00" }, { type: "credit", account_id: "acc-islr", amount: "2.00" }, { type: "credit", account_id: "acc-vat", amount: "16.00" },
  { type: "debit", account_id: "acc-suppliers", amount: "16.00" }, { type: "debit", account_id: "acc-suppliers", amount: "2.00" }, { type: "debit", account_id: "acc-suppliers", amount: "50.00" },
].map((row) => JSON.stringify(row)).sort(), "payment and withholdings hit suppliers and their counter accounts");
assert.equal((await accounting({ kind: "post_payment_accounting", paymentId: "pay-w1" })).replayed, true);
await accounting({ kind: "post_payment_accounting", paymentId: "pay-late" });
await payCommand({ kind: "void_supplier_payment", idempotencyKey: "void-late", paymentId: "pay-late", expectedVersion: 1, reason: "Duplicado" });
const states = Object.fromEntries((await reconciliation()).rows.map((row) => [row.paymentId, row.state]));
assert.equal(states["pay-w1"], "contabilizado");
assert.equal(states["pay-late"], "diferencia", "a voided payment with an active journal is a difference");
assert.equal(states["pay-usd"], "sin_asiento");
await accounting({ kind: "reverse_payment_accounting", paymentId: "pay-late" });
assert.equal(Object.fromEntries((await reconciliation()).rows.map((row) => [row.paymentId, row.state]))["pay-late"], "contabilizado");
const voucher = (await readOnly(() => db.query("select public.shared_payables_withholding_voucher($1::jsonb,$2::jsonb) as result", [JSON.stringify(scope), JSON.stringify({ withholdingId: "w-islr-1" })]))).rows[0].result.rows[0];
assert.deepEqual([voucher.receiptNumber, voucher.conceptCode, voucher.amountVes, voucher.supplier.name, voucher.document.id], ["202600000001", "053", "2.00000000", "Proveedor Uno", "adj-w"], "CXP-026 voucher reprints the persisted receipt");

await db.close();
console.log("Payables PGlite checks passed.");
