/** Runs treasury migration and concurrency checks in an isolated loopback PostgreSQL cluster. */
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
// pg_ctl's detached server can inherit pipe handles on Windows. Ignore those
// handles and await the launcher exit so a live server does not hold this promise.
const control = (arguments_) => new Promise((resolveResult, reject) => {
  const child = spawn(pg_ctl, arguments_, { windowsHide: true, stdio: "ignore" });
  child.once("error", reject);
  child.once("exit", (code) => code === 0 ? resolveResult() : reject(new Error(`pg_ctl exited ${code}`)));
});
const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dependencies = process.env.TREASURY_POSTGRES_MODULES ?? join(tmpdir(), "kont-treasury-postgres", "node_modules");
const { initdb, pg_ctl } = await import(pathToFileURL(join(dependencies, "@embedded-postgres/windows-x64/dist/index.js")).href);
const { default: pg } = await import(pathToFileURL(join(dependencies, "pg/lib/index.js")).href);
const cluster = await mkdtemp(join(tmpdir(), "kont-treasury-db-"));
const port = Number(process.env.TREASURY_TEST_PORT ?? "55483");
assert.ok(Number.isSafeInteger(port) && port >= 1024 && port <= 65535);
const scope = { tenantId: "00000000-0000-4000-8000-000000000001", organizationId: "00000000-0000-4000-8000-000000000002", actorId: "00000000-0000-4000-8000-000000000003", companyId: "J-00000000-0" };
const options = { host: "127.0.0.1", port, user: "treasury_test", database: "postgres" };
const clients = [];
let started = false;
const connection = async () => {
  const client = new pg.Client(options);
  await client.connect();
  clients.push(client);
  return client;
};
const money = (amount) => ({ amount, currency: "VES", minorUnit: 2, operationalValue: { baseCurrency: "VES", amount, rate: "1", source: "identity", asOf: "2026-09-30", policyVersion: "1", rounding: "half_up", minorUnit: 2 } });
const execute = async (client, command, requestScope = scope) => {
  const result = await client.query("select public.shared_treasury_execute_command($1::jsonb,$2::jsonb) as result", [JSON.stringify(requestScope), JSON.stringify({ ...requestScope, correlationId: "pg-test", ...command })]);
  return result.rows[0].result;
};

try {
  await run(initdb, ["-D", cluster, "-U", "treasury_test", "--auth=trust", "--encoding=UTF8", "--locale=C"], { windowsHide: true });
  await control(["-D", cluster, "-l", join(cluster, "server.log"), "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"]);
  started = true;
  const admin = await connection();
  await admin.query("create role anon; create role authenticated; create role service_role");
  await admin.query(await readFile(join(repository, "supabase/checks/treasury-fixture.sql"), "utf8"));
  await admin.query(await readFile(join(repository, "supabase/migrations/291_user_security_access.sql"), "utf8"));
  await admin.query(await readFile(join(repository, "supabase/migrations/20261001200000_treasury_foundation.sql"), "utf8"));
  await admin.query(await readFile(join(repository, "supabase/migrations/20261023080000_treasury_read_only_access_assertion.sql"), "utf8"));
  assert.equal((await admin.query("select provolatile from pg_proc where oid='public.shared_treasury_query(jsonb,jsonb)'::regprocedure")).rows[0].provolatile, "s", "read queries must share one MVCC snapshot across count and page projection");
  assert.equal((await admin.query("select count(*)::integer count from public.access_control_permissions where code like 'treasury.%'")).rows[0].count, 7, "Treasury migration must register its complete permission catalog");
  assert.equal((await admin.query("select count(*)::integer count from public.organization_role_permissions rp join public.organization_roles r on r.id=rp.role_id where r.code='owner' and rp.permission_code like 'treasury.%'")).rows[0].count, 7, "Treasury migration must install owner grants");
  const viewerId = "00000000-0000-4000-8000-000000000099";
  await admin.query("insert into auth.users(id) values($1)", [viewerId]);
  await admin.query("insert into public.organization_roles(id,organization_id,code) values('00000000-0000-4000-8000-000000000098',$1,'viewer')", [scope.organizationId]);
  await admin.query("insert into public.organization_memberships(organization_id,user_id,role_id) values($1,$2,'00000000-0000-4000-8000-000000000098')", [scope.organizationId, viewerId]);
  const a = await connection();
  const b = await connection();
  await a.query("set role service_role");
  await b.query("set role service_role");
  const createCash = { kind: "create_cash_box", cashBoxId: "cash", code: "C1", name: "Test cash", currency: "VES", responsibleActorId: scope.actorId, idempotencyKey: "create-cash" };
  const result = await execute(a, createCash);
  assert.equal(result.replayed, false);
  assert.equal((await execute(b, createCash)).replayed, true);
  await assert.rejects(execute(a, { ...createCash, name: "Changed intent" }), /IDEMPOTENCY/i);
  await assert.rejects(execute(a, { ...createCash, idempotencyKey: "unauthorized-cash", cashBoxId: "unauthorized-cash" }, { ...scope, actorId: "00000000-0000-4000-8000-000000000099" }), /ORGANIZATIONAL_USER_ACCESS_DENIED/i);
  await assert.rejects(a.query("select public.shared_treasury_query($1::jsonb,$2::jsonb)", [JSON.stringify({ ...scope, actorId: viewerId }), JSON.stringify({ kind: "list_cash_boxes", page: 1, pageSize: 1 })]), /ORGANIZATIONAL_USER_ACCESS_DENIED/i);
  await a.query("begin read only");
  try {
    await a.query("select public.shared_treasury_query($1::jsonb,$2::jsonb)", [JSON.stringify(scope), JSON.stringify({ kind: "list_cash_boxes", page: 1, pageSize: 1 })]);
    await assert.rejects(a.query("select public.shared_treasury_query($1::jsonb,$2::jsonb)", [JSON.stringify({ ...scope, actorId: viewerId }), JSON.stringify({ kind: "list_cash_boxes", page: 1, pageSize: 1 })]), /ORGANIZATIONAL_USER_ACCESS_DENIED/i);
  } finally {
    await a.query("rollback");
  }
  const taxActorId = "00000000-0000-4000-8000-000000000097";
  const taxRoleId = "00000000-0000-4000-8000-000000000096";
  await admin.query("insert into auth.users(id) values($1)", [taxActorId]);
  await admin.query("insert into public.organization_roles(id,organization_id,code) values($1,$2,'tax-configurator')", [taxRoleId, scope.organizationId]);
  await admin.query("insert into public.organization_memberships(organization_id,user_id,role_id) values($1,$2,$3)", [scope.organizationId, taxActorId, taxRoleId]);
  await admin.query("insert into public.organization_role_permissions(role_id,permission_code) values($1,'treasury.read'),($1,'treasury.tax.configure')", [taxRoleId]);
  const taxPolicy = await execute(a, { kind: "configure_bank_debit_tax_policy", policyId: "policy-tax-only", expectedVersion: 0, effectiveFrom: "2030-01-01", ratePercent: "0.5", baseCurrency: "VES", rounding: "half_up", legalBasis: "Permission test", approvalReference: "TEST-1", subjectTypes: ["bank_debit"], idempotencyKey: "tax-policy-only-permission" }, { ...scope, actorId: taxActorId });
  assert.equal(taxPolicy.replayed, false, "tax policy must require its specific permission without treasury.post");
  await admin.query("insert into public.organization_role_permissions(role_id,permission_code) values('00000000-0000-4000-8000-000000000098','treasury.read')");
  const replayPayload = { ...scope, correlationId: "pg-test", ...createCash };
  await assert.rejects(a.query("select public.shared_treasury_execute_command($1::jsonb,$2::jsonb)", [JSON.stringify({ ...scope, actorId: viewerId }), JSON.stringify(replayPayload)]), /ORGANIZATIONAL_USER_ACCESS_DENIED/i, "read-only actors must not replay a writer's command receipt");
  const cashDetail = await a.query("select public.shared_treasury_query($1::jsonb,$2::jsonb) as result", [JSON.stringify(scope), JSON.stringify({ kind: "list_cash_boxes", cashBoxId: "cash", page: 1, pageSize: 1 })]);
  assert.equal(cashDetail.rows[0].result.total, 1, "company-scoped detail filter must return its exact cash box");
  assert.equal(cashDetail.rows[0].result.items[0].id, "cash");

  await execute(a, { kind: "post_ledger_entry", idempotencyKey: "opening", entryId: "opening", account: { kind: "cash_box", id: "cash" }, direction: "credit", money: money("100"), operationalDate: "2026-09-30", valueDate: "2026-09-30", concept: "Documented opening", expectedAccountVersion: 1, movementType: "cash_income", source: { type: "opening_balance", id: "fixture" } });
  const debit = (id) => ({ kind: "post_ledger_entry", idempotencyKey: id, entryId: id, account: { kind: "cash_box", id: "cash" }, direction: "debit", money: money("80"), operationalDate: "2026-09-30", valueDate: "2026-09-30", concept: "Concurrent expense", expectedAccountVersion: 2, movementType: "cash_expense" });
  const race = await Promise.allSettled([execute(a, debit("race-a")), execute(b, debit("race-b"))]);
  assert.equal(race.filter((item) => item.status === "fulfilled").length, 1, "exactly one conflicting debit must commit");
  const balance = await admin.query("select sum(case direction when 'credit' then amount else -amount end)::text as amount from public.shared_treasury_ledger_entries where tenant_id=$1 and account_id='cash' and status='posted'", [scope.tenantId]);
  assert.equal(Number(balance.rows[0].amount), 20);
  const responsibleMovements = await a.query("select public.shared_treasury_query($1::jsonb,$2::jsonb) result", [JSON.stringify(scope), JSON.stringify({ kind: "list_ledger_entries", accountKind: "cash_box", accountId: "cash", from: "2026-09-30", to: "2026-09-30", responsibleActorId: scope.actorId, page: 1, pageSize: 20 })]);
  assert.equal(responsibleMovements.rows[0].result.total, 2, "cash movements must be filterable by their authorized creator");
  assert.ok(responsibleMovements.rows[0].result.items.every((item) => item.responsibleActorId === scope.actorId));
  const openingMovement = responsibleMovements.rows[0].result.items.find((item) => item.id === "opening");
  assert.equal(openingMovement.movementType, "cash_income");
  assert.equal(openingMovement.concept, "Documented opening");
  assert.equal(openingMovement.sourceType, "opening_balance");
  assert.equal(openingMovement.sourceId, "fixture");
  const unrelatedActorMovements = await a.query("select public.shared_treasury_query($1::jsonb,$2::jsonb) result", [JSON.stringify(scope), JSON.stringify({ kind: "list_ledger_entries", accountKind: "cash_box", accountId: "cash", from: "2026-09-30", to: "2026-09-30", responsibleActorId: "00000000-0000-4000-8000-000000000099", page: 1, pageSize: 20 })]);
  assert.equal(unrelatedActorMovements.rows[0].result.total, 0, "responsible-actor filters must not include movements from another actor");
  await execute(a, { kind: "create_bank", idempotencyKey: "bank", bankId: "bank", code: "BANK", name: "Test bank", countryCode: "VE" });
  await execute(a, { kind: "create_bank_account", idempotencyKey: "bank-account", bankAccountId: "bank-account", bankId: "bank", currency: "VES", holderName: "Test company", accountNumber: "12345678", allowOverdraft: false });
  await execute(a, { kind: "create_beneficiary", idempotencyKey: "beneficiary", beneficiaryId: "beneficiary", legalName: "Test payee", bankDetails: [] });
  const statement = { kind: "import_bank_statement", idempotencyKey: "statement-import", statementId: "statement", bankAccountId: "bank-account", periodStart: "2026-09-01", periodEnd: "2026-09-30", externalReference: "statement-1", lines: [{ lineId: "statement-line", externalId: "bank-row-1", valueDate: "2026-09-30", direction: "credit", money: money("10"), reference: "BANK-REF", description: "Statement credit" }] };
  await execute(a, statement);
  const repeatedStatement = await execute(b, { ...statement, idempotencyKey: "statement-import-again", statementId: "statement-copy" });
  assert.equal(repeatedStatement.replayed, true, "same bank statement content must return the original import");
  await assert.rejects(execute(b, { ...statement, idempotencyKey: "statement-import-changed", statementId: "statement-changed", lines: [{ ...statement.lines[0], money: money("9") }] }), /TREASURY_CONFLICT/i);
  await assert.rejects(execute(b, { ...statement, idempotencyKey: "statement-import-overlap", statementId: "statement-overlap", externalReference: "statement-2" }), /TREASURY_CONFLICT/i);
  await execute(a, { kind: "post_ledger_entry", idempotencyKey: "bank-opening", entryId: "bank-opening", account: { kind: "bank_account", id: "bank-account" }, direction: "credit", money: money("10"), operationalDate: "2026-09-30", valueDate: "2026-09-30", concept: "Opening funds", expectedAccountVersion: 1, movementType: "bank_credit" });
  const manualMatch = (matchId, idempotencyKey) => ({ kind: "reconcile_manually", idempotencyKey, matchId, bankAccountId: "bank-account", statementLineId: "statement-line", ledgerEntryId: "bank-opening", expectedStatementLineVersion: 1, expectedLedgerEntryVersion: 1, reason: "Concurrent match" });
  const matchRace = await Promise.allSettled([execute(a, manualMatch("match-a", "match-race-a")), execute(b, manualMatch("match-b", "match-race-b"))]);
  assert.equal(matchRace.filter((item) => item.status === "fulfilled").length, 1, "only one connection may claim the same statement and ledger rows");
  assert.equal((await admin.query("select count(*)::integer count from public.shared_treasury_reconciliation_matches where tenant_id=$1 and status='active'", [scope.tenantId])).rows[0].count, 1);
  await admin.query("insert into public.shared_payment_orders(tenant_id,id,company_id,beneficiary,concept,amount,currency,due_date) values($1,'payment-order-race',$2,'Test payee','Concurrent settlement',5,'VES','2026-09-30')", [scope.tenantId, scope.companyId]);
  const settlement = (paymentId, idempotencyKey) => ({ kind: "execute_payment_order", idempotencyKey, paymentId, paymentOrderId: "payment-order-race", beneficiaryId: "beneficiary", account: { kind: "cash_box", id: "cash", currency: "VES" }, money: money("5"), operationalDate: "2026-09-30", valueDate: "2026-09-30", method: "cash", taxableBankDebit: false, expectedAccountVersion: 3 });
  const settlementRace = await Promise.allSettled([execute(a, settlement("payment-a", "payment-race-a")), execute(b, settlement("payment-b", "payment-race-b"))]);
  assert.equal(settlementRace.filter((item) => item.status === "fulfilled").length, 1, "a payment order may only settle once across independent connections");
  assert.equal((await admin.query("select count(*)::integer count from public.shared_treasury_payment_executions where tenant_id=$1 and payment_order_id='payment-order-race'", [scope.tenantId])).rows[0].count, 1);
  await execute(a, { kind: "create_bank_account", idempotencyKey: "deposit-race-account-a", bankAccountId: "deposit-race-a", bankId: "bank", currency: "VES", holderName: "Test company", accountNumber: "22220001", allowOverdraft: false });
  await execute(a, { kind: "create_bank_account", idempotencyKey: "deposit-race-account-b", bankAccountId: "deposit-race-b", bankId: "bank", currency: "VES", holderName: "Test company", accountNumber: "22220002", allowOverdraft: false });
  await admin.query("insert into public.shared_sales_receivables(tenant_id,id,company_id) values($1,'receivable-race',$2)", [scope.tenantId, scope.companyId]);
  await admin.query("insert into public.shared_sales_receivable_payments(tenant_id,id,receivable_id,received_amount,received_currency_code) values($1,'collection-race','receivable-race',100,'VES')", [scope.tenantId]);
  const collectionDeposit = (depositId, destinationBankAccountId, idempotencyKey) => ({ kind: "create_deposit", idempotencyKey, depositId, destinationBankAccountId, expectedDestinationVersion: 1, money: money("60"), depositDate: "2026-09-30", reference: depositId, collectionAllocations: [{ collectionId: "collection-race", amount: money("60") }] });
  const collectionRace = await Promise.allSettled([execute(a, collectionDeposit("deposit-race-a", "deposit-race-a", "collection-deposit-a")), execute(b, collectionDeposit("deposit-race-b", "deposit-race-b", "collection-deposit-b"))]);
  assert.equal(collectionRace.filter((item) => item.status === "fulfilled").length, 1, "separate deposits must not reserve more than the collected amount");
  assert.equal((await admin.query("select coalesce(sum(amount),0)::text amount from public.shared_treasury_collection_allocations where tenant_id=$1 and collection_id='collection-race'", [scope.tenantId])).rows[0].amount, "60.00000000");
  await execute(a, { kind: "configure_bank_debit_tax_policy", idempotencyKey: "check-tax-policy", policyId: "check-tax-policy", expectedVersion: 0, effectiveFrom: "2026-09-01", ratePercent: "0", baseCurrency: "VES", rounding: "half_up", legalBasis: "Test classification fixture", approvalReference: "test approval", subjectTypes: ["check_issue"] });
  const overlappingCheckbook = (checkbookId, idempotencyKey, lastNumber) => ({ kind: "create_checkbook", idempotencyKey, checkbookId, bankAccountId: "bank-account", firstNumber: 10, lastNumber });
  const checkbookRace = await Promise.allSettled([execute(a, overlappingCheckbook("book-range-a", "book-range-a-key", 19)), execute(b, overlappingCheckbook("book-range-b", "book-range-b-key", 15))]);
  assert.equal(checkbookRace.filter((item) => item.status === "fulfilled").length, 1, "overlapping checkbook ranges must serialize across connections");
  await execute(a, { kind: "create_checkbook", idempotencyKey: "checkbook", checkbookId: "checkbook", bankAccountId: "bank-account", firstNumber: 1, lastNumber: 1 });
  const issue = (checkId, idempotencyKey) => ({ kind: "issue_check", idempotencyKey, checkId, checkbookId: "checkbook", bankAccountId: "bank-account", number: 1, beneficiaryId: "beneficiary", beneficiarySnapshot: "Test payee", money: money("10"), issueDate: "2026-09-30", concept: "Competing issue", expectedCheckbookVersion: 1, expectedBankAccountVersion: 2 });
  const checkRace = await Promise.allSettled([execute(a, issue("check-a", "issue-check-a")), execute(b, issue("check-b", "issue-check-b"))]);
  assert.equal(checkRace.filter((item) => item.status === "fulfilled").length, 1, "one connection alone must claim the final check folio");
  const checkState = await admin.query("select c.number,b.next_number,b.version,b.status from public.shared_treasury_checks c join public.shared_treasury_checkbooks b on b.tenant_id=c.tenant_id and b.id=c.checkbook_id where c.tenant_id=$1 and b.id='checkbook'", [scope.tenantId]);
  assert.deepEqual(checkState.rows[0], { number: "1", next_number: "2", version: 2, status: "closed" });
  const checkByNumber = await a.query("select public.shared_treasury_query($1::jsonb,$2::jsonb) result", [JSON.stringify(scope), JSON.stringify({ kind: "list_checks", bankAccountId: "bank-account", number: "1", page: 1, pageSize: 10 })]);
  assert.equal(checkByNumber.rows[0].result.total, 1, "TES-016 must filter checks by exact folio");
  const absentCheckNumber = await a.query("select public.shared_treasury_query($1::jsonb,$2::jsonb) result", [JSON.stringify(scope), JSON.stringify({ kind: "list_checks", bankAccountId: "bank-account", number: "2", page: 1, pageSize: 10 })]);
  assert.equal(absentCheckNumber.rows[0].result.total, 0, "folios must not leak neighboring checks");
  await execute(a, { kind: "configure_bank_debit_tax_policy", idempotencyKey: "check-tax-policy-v2", policyId: "check-tax-policy", expectedVersion: 1, effectiveFrom: "2026-10-01", ratePercent: "1", baseCurrency: "VES", rounding: "half_up", legalBasis: "Test temporal revision", approvalReference: "test approval v2", subjectTypes: ["check_issue"] });
  const beforeHistoricalCreditVersion = (await admin.query("select version from public.shared_treasury_bank_accounts where tenant_id=$1 and id='bank-account'", [scope.tenantId])).rows[0].version;
  await execute(a, { kind: "post_ledger_entry", idempotencyKey: "historical-check-funding", entryId: "historical-check-funding", account: { kind: "bank_account", id: "bank-account" }, direction: "credit", money: money("2"), operationalDate: "2026-09-30", valueDate: "2026-09-30", concept: "Historical check test funding", expectedAccountVersion: beforeHistoricalCreditVersion, movementType: "bank_credit" });
  await execute(a, { kind: "create_checkbook", idempotencyKey: "historical-checkbook", checkbookId: "historical-checkbook", bankAccountId: "bank-account", firstNumber: 20, lastNumber: 20 });
  const bankAccountVersion = (await admin.query("select version from public.shared_treasury_bank_accounts where tenant_id=$1 and id='bank-account'", [scope.tenantId])).rows[0].version;
  await execute(a, { kind: "issue_check", idempotencyKey: "historical-check", checkId: "historical-check", checkbookId: "historical-checkbook", bankAccountId: "bank-account", number: 20, beneficiaryId: "beneficiary", beneficiarySnapshot: "Test payee", money: money("1"), issueDate: "2026-09-30", concept: "Backdated check", expectedCheckbookVersion: 1, expectedBankAccountVersion: bankAccountVersion });
  const historicalAssessment = await admin.query("select a.policy_version,r.rate::text rate,a.tax_amount::text amount,r.effective_to::text policy_end from public.shared_treasury_idb_assessments a join public.shared_treasury_idb_rules r on r.tenant_id=a.tenant_id and r.id=a.policy_id and r.version=a.policy_version where a.tenant_id=$1 and a.ledger_entry_id='historical-check:ledger'", [scope.tenantId]);
  assert.deepEqual(historicalAssessment.rows[0], { policy_version: 1, rate: "0.00000000", amount: "0.00000000", policy_end: "2026-09-30" }, "late-entered movement must use the policy effective on its operational date");
  console.log(JSON.stringify({ engine: "PostgreSQL", version: (await admin.query("show server_version")).rows[0].server_version, checks: ["migration and Treasury permission catalog", "stable read-model snapshot", "member and permission authorization including ungranted role", "idempotent replay", "intent conflict", "company-scoped cash detail", "cash movement responsible-actor filter", "bank statement replay and overlap protection", "independent connection debit race", "payment-order settlement race", "collection reservation race", "manual reconciliation race", "overlapping checkbook range race", "final check folio race", "exact check-folio query", "temporal tax policy retains historical applicability", "reconstructed balance"], passed: true }));
} finally {
  await Promise.allSettled(clients.map((client) => client.end()));
  if (started) await control(["-D", cluster, "-m", "fast", "-w", "stop"]);
  // Retain isolated fixtures and logs in this task's temp directory for inspection.
}
