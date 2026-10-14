import assert from "node:assert/strict";
import test from "node:test";
import { ListVatDeclarationHistory, type VatDeclarationHistoryRepository } from "../../src/application";
import { TaxReportingFailure } from "../../src/domain";

test("declaration history validates bounded periods and forwards authenticated scope and cursor", async () => {
  let received: Parameters<VatDeclarationHistoryRepository["listDeclarations"]> | null = null;
  const repository: VatDeclarationHistoryRepository = { async listDeclarations(...args) { received = args; return { items: [], nextCursor: null }; } };
  const scope = { tenantId: "tenant-1", organizationId: "org-1", companyId: "company-1" };
  const request = { fromPeriod: "2026-01", toPeriod: "2026-12", limit: 25, cursor: { period: "2026-06", id: "decl-1", revision: 2 } } as const;
  const page = await new ListVatDeclarationHistory(repository).execute(scope, request, "actor-1");
  assert.deepEqual(page, { items: [], nextCursor: null });
  assert.equal(received?.[2], "actor-1");
  assert.deepEqual(received?.[1], request);
});

test("declaration history rejects malformed cursors before persistence", async () => {
  let called = false;
  const repository: VatDeclarationHistoryRepository = { async listDeclarations() { called = true; return { items: [], nextCursor: null }; } };
  assert.throws(() => new ListVatDeclarationHistory(repository).execute(
    { tenantId: "tenant-1", organizationId: "org-1", companyId: "company-1" },
    { fromPeriod: "2026-01", toPeriod: "2026-12", limit: 10, cursor: { period: "2026-06", id: " ", revision: 0 } }, "actor-1",
  ), (error: unknown) => error instanceof TaxReportingFailure);
  assert.equal(called, false);
});
