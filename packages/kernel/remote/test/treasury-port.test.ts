import assert from "node:assert/strict";
import test from "node:test";
import { KontaveRemoteFailure, RemoteTreasuryPort, type RemoteTransport } from "../src";
import type { TreasuryCommandRequest, TreasuryQueryRequest } from "@kontave/client-contracts";

const command: TreasuryCommandRequest = { kind: "create_bank", idempotencyKey: "key-1", correlationId: "correlation-1", bankId: "bank-1", code: "BANCO", name: "Banco", countryCode: "VE" };
const query: TreasuryQueryRequest = { kind: "list_cash_boxes", page: 1, pageSize: 25 };
const ledgerQuery: TreasuryQueryRequest = { kind: "list_ledger_entries", accountKind: "cash_box", accountId: "cash-1", from: "2026-09-01", to: "2026-09-30", responsibleActorId: "cashier-1", page: 1, pageSize: 25 };

test("treasury remote port uses scoped command and query routes with serialized request bodies", async () => {
  const requests: { path: string; init: RequestInit }[] = [];
  const transport: RemoteTransport = {
    get: async <T>() => undefined as T,
    request: async <T>(path: string, init: RequestInit) => {
      requests.push({ path, init });
      return (path.endsWith("/commands")
        ? { commandId: "command-1", replayed: false, affectedIds: ["bank-1"], versions: { "bank-1": 1 } }
        : { items: [{ rowKind: "cash_box", id: "cash-1", code: "CAJA", name: "Caja", currency: "VES", status: "active", version: 1 }], page: 1, pageSize: 25, total: 1, asOf: "2026-09-30T00:00:00.000Z" }) as T;
    },
  };
  const port = new RemoteTreasuryPort(transport);
  assert.equal((await port.command("organization-1", "company-1", command)).commandId, "command-1");
  assert.equal((await port.query("organization-1", "company-1", query)).items.length, 1);
  assert.deepEqual(requests.map(({ path, init }) => [init.method, path, init.body]), [
    ["POST", "/api/client/v1/organizations/organization-1/companies/company-1/treasury/commands", JSON.stringify(command)],
    ["POST", "/api/client/v1/organizations/organization-1/companies/company-1/treasury/query", JSON.stringify(query)],
  ]);
});

test("treasury remote port rejects blank route scope before transport", () => {
  const port = new RemoteTreasuryPort({ get: async <T>() => undefined as T, request: async <T>() => undefined as T });
  assert.throws(() => port.command("", "company-1", command), /contexto de tesorería/i);
  assert.throws(() => port.query("organization-1", " ", query), /contexto de tesorería/i);
});

test("treasury remote port rejects injected server scope fields before serialization", () => {
  const port = new RemoteTreasuryPort({ get: async <T>() => undefined as T, request: async <T>() => undefined as T });
  const injected = Object.assign({}, command, { actorId: "forged-user", tenantId: "forged-tenant" });
  assert.throws(() => port.command("organization-1", "company-1", injected), /no puede incluir alcance/i);
});

test("treasury remote port rejects malformed receipts and page values", async () => {
  const malformed: RemoteTransport = { get: async <T>() => undefined as T, request: async <T>(path: string) => (path.endsWith("/commands") ? { commandId: "command", replayed: "no", affectedIds: [], versions: {} } : { items: [{ total: Infinity }], page: 1, pageSize: 10, total: 0, asOf: "today" }) as T };
  const port = new RemoteTreasuryPort(malformed);
  await assert.rejects(port.command("organization-1", "company-1", command), invalidResponse);
  await assert.rejects(port.query("organization-1", "company-1", query), invalidResponse);
});

test("treasury remote port rejects malformed discriminated read-model rows", async () => {
  const malformed: RemoteTransport = { get: async <T>() => undefined as T, request: async <T>() => ({ items: [{ rowKind: "cash_box", id: "cash-1", code: "C", name: "Caja", currency: "VES", status: "active", version: "1" }], page: 1, pageSize: 10, total: 1, asOf: "today" }) as T };
  const port = new RemoteTreasuryPort(malformed);
  await assert.rejects(port.query("organization-1", "company-1", query), invalidResponse);
});

test("treasury remote port validates movement origin and responsible actor metadata on ledger rows", async () => {
  const transport: RemoteTransport = { get: async <T>() => undefined as T, request: async <T>() => ({ items: [{ rowKind: "ledger_entry", id: "entry-1", accountId: "cash-1", accountKind: "cash_box", direction: "credit", amount: "10.00", currency: "VES", movementType: "cash_income", concept: "Collection", sourceType: "receivable_payment", sourceId: "payment-1", sourceLineId: "line-1", status: "posted", operationalDate: "2026-09-30", valueDate: "2026-09-30", responsibleActorId: "cashier-1" }], page: 1, pageSize: 25, total: 1, asOf: "2026-10-01T00:00:00.000Z" }) as T };
  const port = new RemoteTreasuryPort(transport);
  assert.equal((await port.query("organization-1", "company-1", ledgerQuery)).items.length, 1);
  const malformed: RemoteTransport = { get: async <T>() => undefined as T, request: async <T>() => ({ items: [{ rowKind: "ledger_entry", id: "entry-1", accountId: "cash-1", accountKind: "cash_box", direction: "credit", amount: "10.00", currency: "VES", movementType: "cash_income", concept: "Collection", sourceType: null, sourceId: null, sourceLineId: null, status: "posted", operationalDate: "2026-09-30", valueDate: "2026-09-30", responsibleActorId: 42 }], page: 1, pageSize: 25, total: 1, asOf: "2026-10-01T00:00:00.000Z" }) as T };
  await assert.rejects(new RemoteTreasuryPort(malformed).query("organization-1", "company-1", ledgerQuery), invalidResponse);
});

test("treasury remote port accepts reconciliation, tax-policy and payment-execution rows", async () => {
  const rows = [
    { rowKind: "reconciliation_rule", id: "rule-1", bankAccountId: "bank-account-1", activeFrom: "2026-10-01", dateWindowDays: 3, toleranceAmount: "0.00", currency: "VES", referenceWeight: "100", dateWeight: "1", version: 1, active: false },
    { rowKind: "reconciliation_statement", id: "statement-1", bankAccountId: "bank-account-1", periodStart: "2026-10-01", periodEnd: "2026-10-31", externalReference: "EXT", status: "open", version: 1, closedAt: null, differenceExplanation: null },
    { rowKind: "bank_debit_tax_policy", id: "policy-1", effectiveFrom: "2026-01-01", effectiveTo: null, ratePercent: "2", baseCurrency: "VES", rounding: "half_up", legalBasis: "IGTF", approvalReference: "APR-1", subjectTypes: ["bank_debit"], version: 1, active: true },
    { rowKind: "bank_debit_tax_assessment", id: "assessment-1", ledgerEntryId: "entry-1", bankAccountId: "bank-account-1", movementType: "bank_debit", concept: "Pago", operationalDate: "2026-10-02", entryVersion: 1, policyId: "policy-1", policyVersion: 1, ratePercent: "2", taxableAmount: "100.00", taxAmount: "2.00", currency: "VES", exclusionId: null, exclusionReason: null, evidenceReference: null },
    { rowKind: "payment_order_execution", paymentId: "payment-1", paymentOrderId: "order-1", amount: "100.00", currency: "VES", occurredOn: "2026-10-02", ledgerEntryId: "entry-1" },
  ];
  const transport: RemoteTransport = { get: async <T>() => undefined as T, request: async <T>() => ({ items: rows, page: 1, pageSize: 25, total: rows.length, asOf: "2026-10-02T00:00:00.000Z" }) as T };
  assert.equal((await new RemoteTreasuryPort(transport).query("organization-1", "company-1", query)).items.length, rows.length);
  const malformed: RemoteTransport = { get: async <T>() => undefined as T, request: async <T>() => ({ items: [{ ...rows[0], active: "no" }], page: 1, pageSize: 25, total: 1, asOf: "2026-10-02T00:00:00.000Z" }) as T };
  await assert.rejects(new RemoteTreasuryPort(malformed).query("organization-1", "company-1", query), invalidResponse);
});

function invalidResponse(cause: unknown): boolean { return cause instanceof KontaveRemoteFailure && cause.code === "INVALID_RESPONSE"; }
