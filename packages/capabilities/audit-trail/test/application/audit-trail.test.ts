import assert from "node:assert/strict";
import test from "node:test";
import {
  ExecuteAuditedMutation,
  GetAuditRecordMetadata,
  QueryAuditTrail,
  RecordAuditTrail,
  type AtomicAuditedMutationPort,
  type AuditMutationTransaction,
  type AuditTrailRepository,
  type AuditedMutationResult,
  type RecordAuditInput,
} from "../../src/application";
import { createAuditEntry } from "../../src/domain";
import {
  InMemoryAuditTrailRepository,
  SequenceAuditEntryIdGenerator,
} from "../../src/testing";

const scope = {
  tenantId: "tenant-1",
  organizationId: "organization-1",
  companyId: "company-1",
};
const context = {
  actorId: "user-1",
  occurredAt: "2026-01-01T00:00:00.000Z",
  branchId: "branch-1",
  deviceId: "device-1",
};

test("JSON property names preserve their values without changing snapshot prototypes", () => {
  const entry = createAuditEntry({
    id: "reserved",
    scope,
    context,
    entityType: "invoice",
    entityId: "i",
    action: "create",
    before: null,
    after: { ["__proto__"]: { label: "value" }, toString: "literal" },
  });
  assert.equal(Object.getPrototypeOf(entry.after), Object.prototype);
  assert.equal(Object.hasOwn(entry.after ?? {}, "__proto__"), true);
  assert.deepEqual(
    entry.changes.map((change) => change.field),
    ["__proto__", "toString"],
  );
  assert.throws(
    () =>
      createAuditEntry({
        id: "sparse",
        scope,
        context,
        entityType: "invoice",
        entityId: "i",
        action: "create",
        before: null,
        after: { values: Array(1) },
      }),
    { code: "INVALID_AUDIT_ENTRY" },
  );
});
class TransactionalDouble implements AtomicAuditedMutationPort {
  constructor(private readonly repository: AuditTrailRepository) {}
  async execute<TResult>(input: {
    readonly audit: Omit<RecordAuditInput, "before" | "after">;
    readonly entryId: string;
    readonly mutate: (
      transaction: AuditMutationTransaction,
    ) => Promise<AuditedMutationResult<TResult>>;
  }): Promise<TResult> {
    const plan = await input.mutate({ transactionId: "tx-1" });
    const entry = createAuditEntry({
      ...input.audit,
      id: input.entryId,
      before: plan.before,
      after: plan.after,
    });
    const result = await plan.commit();
    await this.repository.append(entry);
    return result;
  }
}
test("isolates detailed tracks by tenant, organization, and company and pages deterministically", async () => {
  const repository = new InMemoryAuditTrailRepository();
  const record = new RecordAuditTrail(
    repository,
    new SequenceAuditEntryIdGenerator(),
  );
  await record.execute({
    scope,
    context,
    entityType: "invoice",
    entityId: "invoice-1",
    action: "create",
    before: null,
    after: { amount: 10 },
  });
  await record.execute({
    scope,
    context: { ...context, occurredAt: "2026-01-02T00:00:00.000Z" },
    entityType: "invoice",
    entityId: "invoice-2",
    action: "create",
    before: null,
    after: { amount: 20 },
  });
  await record.execute({
    scope: { ...scope, companyId: "company-2" },
    context,
    entityType: "invoice",
    entityId: "invoice-3",
    action: "create",
    before: null,
    after: { amount: 30 },
  });
  const page = await new QueryAuditTrail(repository).execute({
    scope,
    limit: 1,
    offset: 1,
  });
  assert.equal(page.total, 2);
  assert.equal(page.entries[0]?.entityId, "invoice-2");
});
test("records immutable nested diffs and metadata", async () => {
  const repository = new InMemoryAuditTrailRepository();
  const record = new RecordAuditTrail(
    repository,
    new SequenceAuditEntryIdGenerator(),
  );
  await record.execute({
    scope,
    context,
    entityType: "customer",
    entityId: "customer-1",
    action: "create",
    before: null,
    after: { nested: { code: "A" } },
  });
  await record.execute({
    scope,
    context: {
      ...context,
      actorId: "user-2",
      occurredAt: "2026-01-02T00:00:00.000Z",
    },
    entityType: "customer",
    entityId: "customer-1",
    action: "update",
    before: { nested: { code: "A" } },
    after: { nested: { code: "B" } },
  });
  const entries = await new QueryAuditTrail(repository).execute({
    scope,
    entityId: "customer-1",
  });
  const nested = entries.entries[1]?.changes[0]?.after as { code: string };
  assert.throws(() => {
    nested.code = "mutated";
  });
  assert.equal(nested.code, "B");
  const metadata = await new GetAuditRecordMetadata(repository).execute({
    scope,
    entityType: "customer",
    entityId: "customer-1",
  });
  assert.equal(metadata?.createdAt, context.occurredAt);
});
test("reads metadata across more than one thousand facts and never invents a create", async () => {
  const repository = new InMemoryAuditTrailRepository();
  const record = new RecordAuditTrail(
    repository,
    new SequenceAuditEntryIdGenerator(),
  );
  for (let index = 0; index < 1_001; index += 1)
    await record.execute({
      scope,
      context: {
        ...context,
        occurredAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
      },
      entityType: "employee",
      entityId: "employee-1",
      action: index === 0 ? "create" : "update",
      before: index === 0 ? null : { value: index - 1 },
      after: { value: index },
    });
  const metadata = await new GetAuditRecordMetadata(repository).execute({
    scope,
    entityType: "employee",
    entityId: "employee-1",
  });
  assert.equal(metadata?.createdAt, "2026-01-01T00:00:00.000Z");
  assert.equal(metadata?.lastModifiedAt, "2026-01-01T00:16:40.000Z");
});
test("rejects malformed snapshots and repository scope leaks", async () => {
  assert.throws(
    () =>
      createAuditEntry({
        id: "1",
        scope,
        context,
        entityType: "invoice",
        entityId: "i",
        action: "create",
        before: null,
        after: { value: Number.NaN },
      }),
    { code: "INVALID_AUDIT_ENTRY" },
  );
  const leak: AuditTrailRepository = {
    append: async () => undefined,
    query: async () => ({
      entries: [
        createAuditEntry({
          id: "leak",
          scope: { ...scope, companyId: "other" },
          context,
          entityType: "invoice",
          entityId: "i",
          action: "create",
          before: null,
          after: {},
        }),
      ],
      total: 1,
      offset: 0,
      limit: 50,
    }),
  };
  await assert.rejects(() => new QueryAuditTrail(leak).execute({ scope }), {
    code: "AUDIT_SCOPE_VIOLATION",
  });
});
test("transactional adapter does not publish a track when the staged commit fails", async () => {
  const repository = new InMemoryAuditTrailRepository();
  const execute = new ExecuteAuditedMutation(
    new TransactionalDouble(repository),
    new SequenceAuditEntryIdGenerator(),
  );
  await assert.rejects(() =>
    execute.execute({
      audit: {
        scope,
        context,
        entityType: "invoice",
        entityId: "invoice-1",
        action: "update",
      },
      mutate: async () => ({
        before: { status: "draft" },
        after: { status: "confirmed" },
        commit: async () => {
          throw new Error("write failed");
        },
      }),
    }),
  );
  assert.equal(
    (await new QueryAuditTrail(repository).execute({ scope })).total,
    0,
  );
});
