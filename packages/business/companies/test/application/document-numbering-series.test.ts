import assert from "node:assert/strict";
import test from "node:test";
import type { OrganizationId, UserId } from "@kontave/organizations/domain";
import {
  AllocateCompanyDocumentNumber,
  type AllocateCompanyDocumentNumberCommand,
  type CompanyDocumentNumberAllocation,
  CompanyDocumentNumberingOperation,
  type CompanyDocumentNumberingAuthorization,
  type CompanyDocumentNumberingScope,
  type CompanyDocumentNumberingSeriesRepository,
  ConfigureCompanyDocumentSeriesSelectionRule,
  type ConfigureCompanyDocumentSeriesSelectionRuleCommand,
  CreateCompanyDocumentNumberingSeries,
  type CreateCompanyDocumentNumberingSeriesCommand,
} from "../../src/application";
import { CompanyFailure, type CompanyDocumentNumberingSeries, type CompanyDocumentSeriesSelectionRule, type CompanyId } from "../../src/domain";

const organizationId = "8e2403ad-a266-4ffc-8680-b744f241001e" as OrganizationId;
const actorUserId = "7b12e42d-3945-4d34-a035-feb773b50001" as UserId;
const companyId = "company-a" as CompanyId;
const branchId = "6be10ba0-d5d3-4a61-a34f-73d0c81a2345";
const seriesId = "7be10ba0-d5d3-4a61-a34f-73d0c81a2345";
const scope = { actorUserId, organizationId, companyId };
const branchScope = { kind: "branch" as const, organizationId, companyId, branchId };

class Authorization implements CompanyDocumentNumberingAuthorization {
  readonly operations: CompanyDocumentNumberingOperation[] = [];
  async assertCanManageDocumentNumbering(
    _scope: CompanyDocumentNumberingScope,
    operation: CompanyDocumentNumberingOperation,
  ): Promise<void> {
    this.operations.push(operation);
  }
}
class Store implements CompanyDocumentNumberingSeriesRepository {
  readonly creates: CreateCompanyDocumentNumberingSeriesCommand[] = [];
  readonly rules: ConfigureCompanyDocumentSeriesSelectionRuleCommand[] = [];
  readonly receipts = new Map<string, CompanyDocumentNumberAllocation & { readonly intent: string }>();

  async createSeries(
    command: CreateCompanyDocumentNumberingSeriesCommand,
  ): Promise<CompanyDocumentNumberingSeries> {
    this.creates.push(command);
    return { id: seriesId, ...command, active: true, version: 1 };
  }

  async listSeries(): Promise<readonly CompanyDocumentNumberingSeries[]> { return []; }

  async configureSelectionRule(
    command: ConfigureCompanyDocumentSeriesSelectionRuleCommand,
  ): Promise<CompanyDocumentSeriesSelectionRule> {
    this.rules.push(command);
    return { scope: command.scope, documentType: command.documentType, policy: command.policy, defaultSeriesId: command.defaultSeriesId, version: command.expectedVersion + 1 };
  }

  async allocate(
    command: AllocateCompanyDocumentNumberCommand,
  ): Promise<CompanyDocumentNumberAllocation> {
    const intent = JSON.stringify({ documentId: command.documentId, scope: command.scope, documentType: command.documentType, selection: command.selection });
    const prior = this.receipts.get(command.idempotencyKey);
    if (prior) { if (prior.intent !== intent) throw new CompanyFailure("COMPANY_DOCUMENT_SERIES_IDEMPOTENCY_CONFLICT", "Conflicting replay."); return prior; }
    const result = { intent, documentId: command.documentId, seriesId, documentType: "sales_invoice" as const, displayNumber: "FAC-00000001", number: 1 };
    this.receipts.set(command.idempotencyKey, result); return result;
  }
}

test("creates a branch-scoped invoice series after normalizing its portable contract", async () => {
  const authorization = new Authorization(); const repository = new Store();
  const result = await new CreateCompanyDocumentNumberingSeries(authorization, repository).execute({ ...scope, idempotencyKey: " create-1 ", scope: branchScope, documentType: "sales_invoice", code: " fac-a ", prefix: " FAC- ", nextNumber: 1, maximumNumber: 999 });
  assert.equal(result.code, "FAC-A"); assert.equal(repository.creates[0]?.idempotencyKey, "create-1"); assert.deepEqual(authorization.operations, [CompanyDocumentNumberingOperation.Configure]);
});
test("rejects cross-company scopes and invalid bounds before persistence", async () => {
  const repository = new Store(); const useCase = new CreateCompanyDocumentNumberingSeries(new Authorization(), repository);
  await assert.rejects(() => useCase.execute({ ...scope, idempotencyKey: "x", scope: { kind: "company", organizationId, companyId: "other" as CompanyId }, documentType: "sales_invoice", code: "A", prefix: null, nextNumber: 1, maximumNumber: 9 }), (error: unknown) => error instanceof CompanyFailure && error.code === "COMPANY_OUTSIDE_ORGANIZATION");
  await assert.rejects(() => useCase.execute({ ...scope, idempotencyKey: "x", scope: branchScope, documentType: "sales_invoice", code: "A", prefix: null, nextNumber: 10, maximumNumber: 9 }), (error: unknown) => error instanceof CompanyFailure && error.code === "COMPANY_DOCUMENT_SERIES_INVALID");
  assert.equal(repository.creates.length, 0);
});
test("supports an invoice-only explicit-series rule while rejecting an incompatible default", async () => {
  const repository = new Store(); const configure = new ConfigureCompanyDocumentSeriesSelectionRule(new Authorization(), repository);
  const rule = await configure.execute({ ...scope, idempotencyKey: " policy-1 ", scope: branchScope, documentType: "sales_invoice", expectedVersion: 0, policy: "explicit_series_required", defaultSeriesId: null });
  assert.equal(rule.policy, "explicit_series_required"); assert.equal(repository.rules[0]?.idempotencyKey, "policy-1");
  await assert.rejects(() => configure.execute({ ...scope, idempotencyKey: "policy-2", scope: branchScope, documentType: "sales_invoice", expectedVersion: 1, policy: "explicit_series_required", defaultSeriesId: seriesId }), (error: unknown) => error instanceof CompanyFailure && error.code === "COMPANY_DOCUMENT_SERIES_SELECTION_INVALID");
});
test("delegates retry-safe allocation to the one transactionally coupled repository primitive", async () => {
  const repository = new Store(); const authorization = new Authorization(); const allocate = new AllocateCompanyDocumentNumber(authorization, repository);
  const command = { ...scope, idempotencyKey: "issue-1", documentId: "invoice-1", scope: branchScope, documentType: "sales_invoice" as const, selection: { kind: "explicit" as const, seriesId } };
  const first = await allocate.execute(command); const replay = await allocate.execute(command);
  assert.equal(first.number, 1); assert.equal(replay, first);
  await assert.rejects(() => allocate.execute({ ...command, documentId: "invoice-2" }), (error: unknown) => error instanceof CompanyFailure && error.code === "COMPANY_DOCUMENT_SERIES_IDEMPOTENCY_CONFLICT");
  assert.deepEqual(authorization.operations, [CompanyDocumentNumberingOperation.Allocate, CompanyDocumentNumberingOperation.Allocate, CompanyDocumentNumberingOperation.Allocate]);
});
