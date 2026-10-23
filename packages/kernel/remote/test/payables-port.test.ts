import assert from "node:assert/strict";
import test from "node:test";
import { RemotePayablesPort, type RemoteTransport } from "../src";
import type { PayablesCommandRequest, PayablesQueryRequest } from "@kontave/client-contracts";

const command: PayablesCommandRequest = { kind: "change_due_date", idempotencyKey: "key-1", correlationId: "correlation-1", changeId: "change-1", documentId: "doc-1", dueAt: "2026-11-30", reason: "Acuerdo", expectedVersion: 2 };
const query: PayablesQueryRequest = { kind: "list_pending", currency: "USD", limit: 50, offset: 0 };

function transport(response: unknown, requests: { path: string; init: RequestInit }[] = []): RemoteTransport {
  return {
    get: async <T>() => undefined as T,
    request: async <T>(path: string, init: RequestInit) => { requests.push({ path, init }); return (typeof response === "function" ? (response as (path: string) => unknown)(path) : response) as T; },
  };
}

test("payables remote port uses scoped routes and decodes exact-string reports", async () => {
  const requests: { path: string; init: RequestInit }[] = [];
  const port = new RemotePayablesPort(transport((path: string) => path.endsWith("/commands")
    ? { commandId: "change-1", replayed: false, affectedIds: ["doc-1"], versions: { "doc-1": 3 } }
    : { rows: [{ documentId: "doc-1", balance: "116.00000000", currency: "USD" }], total: 1, totals: [{ currency: "USD", net: "116.00000000" }] }, requests));
  assert.equal((await port.command("organization-1", "company-1", command)).versions["doc-1"], 3);
  assert.equal((await port.query("organization-1", "company-1", query)).rows[0]?.balance, "116.00000000");
  assert.deepEqual(requests.map(({ path, init }) => [init.method, path, init.body]), [
    ["POST", "/api/client/v1/organizations/organization-1/companies/company-1/payables/commands", JSON.stringify(command)],
    ["POST", "/api/client/v1/organizations/organization-1/companies/company-1/payables/query", JSON.stringify(query)],
  ]);
});

test("payables remote port rejects server scope and float amounts", async () => {
  const port = new RemotePayablesPort(transport({ rows: [{ documentId: "doc-1", balance: 116.1 }], total: 1 }));
  assert.throws(() => port.command("organization-1", "company-1", { ...command, companyId: "forged" }), /no puede incluir alcance/i);
  assert.throws(() => port.query("", "company-1", query), /contexto de cuentas por pagar/i);
  await assert.rejects(() => port.query("organization-1", "company-1", query), "a JSON number amount could already be rounded");
});
