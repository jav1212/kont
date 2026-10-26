/** Verifies chart persistence, backfill and competing writes in an isolated local PostgreSQL cluster. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const moduleRoot = process.env.ACCOUNTING_POSTGRES_MODULES ?? join(tmpdir(), "kont-treasury-postgres", "node_modules");
const { initdb, pg_ctl } = await import(pathToFileURL(join(moduleRoot, "@embedded-postgres/windows-x64/dist/index.js")).href);
const { default: pg } = await import(pathToFileURL(join(moduleRoot, "pg/lib/index.js")).href);
const temporaryRoot = resolve(tmpdir());
const cluster = await mkdtemp(join(temporaryRoot, "kont-accounting-db-"));
const port = Number(process.env.ACCOUNTING_TEST_PORT ?? "55485");
assert.ok(Number.isSafeInteger(port) && port >= 1024 && port <= 65535, "ACCOUNTING_TEST_PORT must be a TCP port above 1023.");
const scope = { tenantId: "00000000-0000-4000-8000-000000000001", organizationId: "00000000-0000-4000-8000-000000000002", companyId: "J-00000000-0", actorId: "00000000-0000-4000-8000-000000000003" };
const structure = { segments: [{ length: 1, separator: null }, { length: 2, separator: "." }, { length: 2, separator: "." }] };
const clients = [];
const checks = [];
let started = false;
let completed = false;
let serial = 0;

/**
 * Runs the bundled database controller with hidden windows and reports failures without command arguments.
 * @param {string} executable - Bundled PostgreSQL executable.
 * @param {string[]} args - Controller arguments restricted to this isolated cluster.
 * @returns {Promise<void>} Resolves after the controller exits successfully.
 * @throws {Error} If the executable fails or exits unsuccessfully.
 */
function control(executable, args) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(executable, args, { windowsHide: true, stdio: "ignore" });
    child.once("error", reject);
    child.once("exit", code => code === 0 ? resolveResult() : reject(new Error(`${basename(executable)} exited ${code}.`)));
  });
}

/**
 * Opens a tracked connection to the isolated loopback database.
 * @returns {Promise<import('pg').Client>} An independent connection closed in the finalizer.
 * @throws {Error} If the local server cannot be reached.
 */
async function connect() {
  const client = new pg.Client({ host: "127.0.0.1", port, user: "accounting_test", database: "postgres" });
  await client.connect();
  clients.push(client);
  return client;
}

/**
 * Invokes a persisted command, preserving complete trusted scope in both RPC parameters.
 * @param {import('pg').Client} client - Independent local connection.
 * @param {Record<string, unknown>} command - Business intent and concurrency fields.
 * @param {typeof scope} requestScope - Acting tenant and company scope.
 * @returns {Promise<Record<string, unknown>>} Committed command receipt.
 * @throws {Error} When the SQL command rejects its invariants or permissions.
 */
async function execute(client, command, requestScope = scope) {
  const payload = { ...requestScope, idempotencyKey: `test-${++serial}`, correlationId: "postgres-test", ...command };
  return (await client.query("select public.shared_accounting_execute_command($1::jsonb,$2::jsonb) result", [JSON.stringify(requestScope), JSON.stringify(payload)])).rows[0].result;
}

/**
 * Loads an explicitly supplied local snapshot without reading any external service.
 * @param {import('pg').Client} client - Database owner connection before applying P2.
 * @param {string} path - User-authorized local JSON snapshot path.
 * @returns {Promise<number>} Number of original accounts loaded for the backfill comparison.
 * @throws {Error} If the snapshot is incomplete or violates the original accounting schema.
 */
async function loadSnapshot(client, path) {
  const data = JSON.parse(await readFile(path, "utf8"));
  const required = ["shared_companies", "shared_accounting_charts", "shared_accounting_accounts", "shared_accounting_periods", "shared_accounting_entries", "shared_accounting_entry_lines"];
  for (const table of required) assert.ok(Array.isArray(data[table]), "Backfill snapshot is incomplete.");
  for (const company of data.shared_companies) {
    await client.query("insert into public.tenants(id) values($1) on conflict do nothing", [company.tenant_id]);
    await client.query("insert into public.organizations(id) values($1) on conflict do nothing", [company.organization_id]);
    await client.query("insert into public.shared_companies(tenant_id,id,organization_id) values($1,$2,$3) on conflict do nothing", [company.tenant_id, company.id, company.organization_id]);
  }
  for (const row of data.shared_accounting_charts) await client.query("insert into public.shared_accounting_charts(tenant_id,id,company_id,name) values($1,$2,$3,$2)", [row.tenant_id, row.id, row.company_id]);
  for (const row of data.shared_accounting_accounts) await client.query("insert into public.shared_accounting_accounts(tenant_id,id,company_id,chart_id,code,name,type,parent_code,is_active,is_group,opening_balance) values($1,$2,$3,$4,$5,$2,$6,$7,$8,$9,$10)", [row.tenant_id, row.id, row.company_id, row.chart_id, row.code, row.type, row.parent_code, row.is_active, row.is_group, row.opening_balance]);
  for (const row of data.shared_accounting_periods) await client.query("insert into public.shared_accounting_periods(tenant_id,id,company_id,name,start_date,end_date,status) values($1,$2,$3,$2,$4,$5,$6)", [row.tenant_id, row.id, row.company_id, row.start_date, row.end_date, row.status]);
  for (const row of data.shared_accounting_entries) await client.query("insert into public.shared_accounting_entries(tenant_id,id,company_id,period_id,entry_number,entry_date,status,source) values($1,$2,$3,$4,$5,$6,$7,$8)", [row.tenant_id, row.id, row.company_id, row.period_id, row.entry_number, row.entry_date, row.status, row.source]);
  for (const row of data.shared_accounting_entry_lines) await client.query("insert into public.shared_accounting_entry_lines(tenant_id,id,entry_id,account_id,type,amount) values($1,$2,$3,$4,$5,$6)", [row.tenant_id, row.id, row.entry_id, row.account_id, row.type, row.amount]);
  return data.shared_accounting_accounts.length;
}

const baselineSql = `select a.tenant_id::text,a.company_id,a.id,a.chart_id,a.code,a.type,a.parent_code,a.is_active,a.is_group,a.opening_balance::text,
 coalesce(sum(case when l.type='debit' then l.amount else -l.amount end),0)::text posting_balance
 from public.shared_accounting_accounts a left join public.shared_accounting_entry_lines l on l.tenant_id=a.tenant_id and l.account_id=a.id
 group by a.tenant_id,a.company_id,a.id,a.chart_id,a.code,a.type,a.parent_code,a.is_active,a.is_group,a.opening_balance order by a.tenant_id,a.id`;

try {
  await control(initdb, ["-D", cluster, "-U", "accounting_test", "--auth=trust", "--encoding=UTF8", "--locale=C"]);
  await control(pg_ctl, ["-D", cluster, "-l", join(cluster, "server.log"), "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"]);
  started = true;
  const admin = await connect();
  for (const file of ["supabase/checks/accounting-fixture.sql", "supabase/migrations/131_shared_accounting_pilot.sql", "supabase/migrations/140_shared_accounting_chart_account_transactions.sql", "supabase/checks/accounting-fixture-seed.sql"]) await admin.query(await readFile(join(root, file), "utf8"));
  const loaded = process.env.ACCOUNTING_BACKFILL_FIXTURE ? await loadSnapshot(admin, process.env.ACCOUNTING_BACKFILL_FIXTURE) : 0;
  const baseline = (await admin.query(baselineSql)).rows;
  await admin.query(await readFile(join(root, "supabase/migrations/20261023200000_accounting_chart_persistence.sql"), "utf8"));
  assert.deepEqual((await admin.query(baselineSql)).rows, baseline, "Backfill must preserve every original account, classification, balance and posting identity.");
  checks.push(`backfill preserves ${loaded} supplied original accounts and their posting balances`);
  assert.equal((await admin.query("select count(*)::int n from public.access_control_permissions where code in('accounting.chart.manage','accounting.masters.manage','accounting.configure')")).rows[0].n, 3);
  checks.push("permissions install without preseeded new permission rows");
  const a = await connect(), b = await connect();
  await a.query("set role service_role"); await b.query("set role service_role");
  await a.query("set statement_timeout='15s'"); await b.query("set statement_timeout='15s'");
  const create = { kind: "create_chart", chartId: "main", name: "Main", structure, idempotencyKey: "same-intent" };
  const receipts = await Promise.all([execute(a, create), execute(b, create)]);
  assert.deepEqual(receipts.map(row => row.replayed).sort(), [false, true]);
  assert.equal((await execute(a, { ...create, correlationId: "new-trace" })).replayed, true);
  await assert.rejects(execute(a, { ...create, name: "Different" }), /ACCOUNTING_IDEMPOTENCY_CONFLICT/);
  checks.push("concurrent identical writes commit once, trace changes replay, changed intent conflicts");
  await execute(a, { kind: "create_account", chartId: "main", accountId: "root", code: "1", name: "Root", accountKind: "summary", accountType: "asset", isMemorandum: false, monetaryClass: "monetary" });
  const child = (id, code) => ({ kind: "create_account", chartId: "main", accountId: id, code, name: id, accountKind: "detail", accountType: "asset", isMemorandum: false, monetaryClass: "monetary" });
  await Promise.all([execute(a, child("child-a", "1.01")), execute(b, child("child-b", "1.02"))]);
  const duplicates = await Promise.allSettled([execute(a, child("duplicate-a", "1.03")), execute(b, child("duplicate-b", "1.03"))]);
  assert.equal(duplicates.filter(result => result.status === "fulfilled").length, 1);
  checks.push("concurrent children share a valid parent and duplicate codes cannot both commit");
  const versioned = id => ({ kind: "update_account", accountId: "child-a", expectedVersion: 1, name: id });
  const updates = await Promise.allSettled([execute(a, versioned("First")), execute(b, versioned("Second"))]);
  assert.equal(updates.filter(result => result.status === "fulfilled").length, 1);
  assert.ok(updates.some(result => result.status === "rejected" && /ACCOUNTING_VERSION_CONFLICT/.test(result.reason.message)));
  checks.push("optimistic account versions reject competing stale writes");
  const denied = { ...scope, actorId: "00000000-0000-4000-8000-000000000099" };
  await assert.rejects(execute(a, create, denied), /ACCESS_DENIED|ACCOUNTING_FORBIDDEN/);
  await a.query("begin read only");
  try { const result = await a.query("select public.shared_accounting_query($1::jsonb,$2::jsonb) result", [JSON.stringify(scope), JSON.stringify({ kind: "find_accounts", chartId: "main" })]); assert.equal(result.rows[0].result.length, 4); }
  finally { await a.query("rollback"); }
  checks.push("authorization precedes receipt replay and STABLE queries execute in read-only transactions");
  await execute(a, { kind: "create_chart", chartId: "second", name: "Second", structure });
  await Promise.all([execute(a, { kind: "activate_chart", chartId: "main", expectedVersion: 1 }), execute(b, { kind: "activate_chart", chartId: "second", expectedVersion: 1 })]);
  assert.equal((await admin.query("select count(*)::int n from public.shared_accounting_charts where tenant_id=$1 and company_id=$2 and status='active'", [scope.tenantId, scope.companyId])).rows[0].n, 1);
  checks.push("concurrent activation retains exactly one active chart");
  const imported = { kind: "create_chart", chartId: "invalid-import", name: "Bad import", structure, idempotencyKey: "bad-import", initialAccounts: [{ id: "import-root", code: "4", name: "Root", accountKind: "summary", accountType: "revenue" }, { id: "import-orphan", code: "5.01", name: "Orphan", accountKind: "detail", accountType: "expense" }] };
  await assert.rejects(execute(a, imported), /ACCOUNTING_PARENT_INVALID/);
  assert.equal((await admin.query("select count(*)::int n from public.shared_accounting_charts where tenant_id=$1 and id='invalid-import'", [scope.tenantId])).rows[0].n, 0);
  checks.push("failed imports roll back chart, accounts and idempotency receipt");
  const foreignScope = { ...scope, tenantId: "00000000-0000-4000-8000-000000000011", organizationId: "00000000-0000-4000-8000-000000000012" };
  await admin.query("insert into public.tenants(id) values($1)", [foreignScope.tenantId]);
  await admin.query("insert into public.organizations(id) values($1)", [foreignScope.organizationId]);
  await admin.query("insert into public.shared_companies(tenant_id,id,organization_id) values($1,$2,$3)", [foreignScope.tenantId, foreignScope.companyId, foreignScope.organizationId]);
  await admin.query("insert into public.shared_accounting_charts(tenant_id,id,company_id,name) values($1,'foreign-chart',$2,'Foreign')", [foreignScope.tenantId, foreignScope.companyId]);
  const isolated = await a.query("select public.shared_accounting_query($1::jsonb,$2::jsonb) result", [JSON.stringify(scope), JSON.stringify({ kind: "list_charts" })]);
  assert.ok(isolated.rows[0].result.every(row => row.id !== "foreign-chart"));
  await assert.rejects(execute(a, { kind: "create_account", chartId: "foreign-chart", accountId: "foreign-attack", code: "1", name: "Foreign", accountKind: "detail", accountType: "asset", isMemorandum: false, monetaryClass: null }), /ACCOUNTING_NOT_FOUND/);
  checks.push("the same company identifier in another tenant remains isolated");
  const restricted = await connect();
  await restricted.query("set role authenticated");
  await assert.rejects(restricted.query("select public.shared_accounting_query($1::jsonb,$2::jsonb)", [JSON.stringify(scope), JSON.stringify({ kind: "list_charts" })]), /permission denied/i);
  checks.push("authenticated clients cannot call service-only RPCs");
  completed = true;
  console.log(JSON.stringify({ engine: "PostgreSQL", version: (await admin.query("show server_version")).rows[0].server_version, loadedOriginalAccounts: loaded, checks, passed: true }));
} finally {
  await Promise.allSettled(clients.map(client => client.end()));
  if (started) await control(pg_ctl, ["-D", cluster, "-m", "fast", "-w", "stop"]);
  if (completed && process.env.ACCOUNTING_KEEP_TEST_CLUSTER !== "1") {
    const target = resolve(cluster);
    if (dirname(target) !== temporaryRoot || !basename(target).startsWith("kont-accounting-db-")) throw new Error("Refusing cleanup outside the isolated accounting test directory.");
    await rm(target, { recursive: true, force: true });
  }
}
