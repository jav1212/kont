import assert from "node:assert/strict";
import test from "node:test";
import { KontaveRemoteFailure, RemoteAccountingPort, type RemoteTransport } from "../src";
import type { AccountingCommandRequest, AccountingQueryRequest } from "@kontave/client-contracts";

const command: AccountingCommandRequest = { kind: "create_chart", chartId: "chart-1", idempotencyKey: "key-1", correlationId: "trace-1" };
const query: AccountingQueryRequest = { kind: "list_charts" };

test("accounting remote port serializes scope-free requests to the client API", async () => {
  const requests: { path: string; init: RequestInit }[] = [];
  const transport: RemoteTransport = {
    get: async <T>() => undefined as T,
    request: async <T>(path: string, init: RequestInit) => {
      requests.push({ path, init });
      return (path.endsWith("/commands") ? { commandId: "chart-1", replayed: false, affectedIds: ["chart-1"], versions: { "chart-1": 1 } } : [{ id: "chart-1", name: "General" }]) as T;
    },
  };
  const port = new RemoteAccountingPort(transport);
  assert.equal((await port.command("org/1", "company-1", command)).commandId, "chart-1");
  assert.deepEqual(await port.query("org/1", "company-1", query), [{ id: "chart-1", name: "General" }]);
  assert.deepEqual(requests.map(({ path, init }) => [init.method, path, init.body]), [
    ["POST", "/api/client/v1/organizations/org%2F1/companies/company-1/accounting/commands", JSON.stringify(command)],
    ["POST", "/api/client/v1/organizations/org%2F1/companies/company-1/accounting/query", JSON.stringify(query)],
  ]);
});

test("accounting remote port rejects caller-supplied server scope", async () => {
  const port = new RemoteAccountingPort({ get: async <T>() => undefined as T, request: async <T>() => undefined as T });
  assert.throws(() => port.command("org-1", "company-1", { ...command, actorId: "forged" } as AccountingCommandRequest), /alcance del servidor/);
  assert.throws(() => port.query(" ", "company-1", query), /contexto contable/);
});

test("accounting remote port rejects malformed command receipts", async () => {
  const invalid: RemoteTransport = { get: async <T>() => undefined as T, request: async <T>() => ({ commandId: "x", replayed: false, affectedIds: [], versions: { x: -1 } }) as T };
  await assert.rejects(new RemoteAccountingPort(invalid).command("org-1", "company-1", command), (error: unknown) => error instanceof KontaveRemoteFailure && error.code === "INVALID_RESPONSE");
});
