import {
  AuditTrailFailure,
  auditScope,
  copyAuditEntry,
  createAuditEntry,
  sameAuditScope,
  type AuditAction,
  type AuditEntry,
  type AuditOperationContext,
  type AuditRecordMetadata,
  type AuditScope,
  type AuditValue,
  type AuditedEntityType,
} from "../domain";

/** Page request constrained to one tenant, organization, and company. */
export interface AuditTrailQuery {
  readonly scope: AuditScope;
  readonly entityType?: AuditedEntityType;
  readonly entityId?: string;
  readonly actions?: readonly AuditAction[];
  readonly offset?: number;
  readonly limit?: number;
}
/** Deterministic page of immutable audit facts. */
export interface AuditTrailPage {
  readonly entries: readonly AuditEntry[];
  readonly total: number;
  readonly offset: number;
  readonly limit: number;
}

/**
 * Persistence boundary for audit facts. Implementations must append entries only.
 * A production adapter must commit this operation in the same database transaction as
 * the business mutation; this capability cannot make an independently committed mutation atomic.
 */
export interface AuditTrailRepository extends AuditTrailReader {
  /**
   * Appends one immutable audit fact.
   * @param entry - Immutable fact to append once.
   * @returns Nothing when the fact is durable.
   * @throws {AuditTrailFailure} On duplicate ID or unavailable persistence.
   */
  append(entry: AuditEntry): Promise<void>;
}

/** Read-only boundary shared by audit queries and metadata projections. */
export interface AuditTrailReader {
  /**
   * Reads one deterministic, scope-bound page of audit facts.
   * @param query - Scope-bound filtering and pagination request.
   * @returns A page with no records outside the requested scope.
   * @throws {AuditTrailFailure} When persistence cannot safely satisfy the request.
   */
  query(query: AuditTrailQuery): Promise<AuditTrailPage>;
}

/** Creates IDs for append-only audit facts. */
export interface AuditEntryIdGenerator {
  /**
   * Produces an identifier for a new immutable fact.
   * @returns A unique nonempty entry identifier.
   */
  next(): string;
}

/** Input accepted by the record-audit use case. */
export interface RecordAuditInput {
  readonly scope: AuditScope;
  readonly entityType: AuditedEntityType;
  readonly entityId: string;
  readonly action: AuditAction;
  readonly context: AuditOperationContext;
  readonly before: Record<string, AuditValue> | null;
  readonly after: Record<string, AuditValue> | null;
}

/** A validated mutation plan that a transaction adapter commits only after its audit fact is accepted. */
export interface AuditedMutationResult<TResult> {
  readonly before: Record<string, AuditValue> | null;
  readonly after: Record<string, AuditValue> | null;
  readonly commit: () => Promise<TResult>;
}
/** Opaque transaction supplied by a persistence adapter to a mutation callback. */
export interface AuditMutationTransaction {
  readonly transactionId: string;
}
/** Atomic boundary for a business write and its audit append. The adapter opens one transaction, invokes `mutate` using that transaction, and commits both records or rolls both back. */
export interface AtomicAuditedMutationPort {
  /** @param input - Metadata plus a transaction-bound mutation callback. @returns The business result after one atomic commit. @throws {AuditTrailFailure} When validation or commit fails. */ execute<
    TResult,
  >(input: {
    readonly audit: Omit<RecordAuditInput, "before" | "after">;
    readonly entryId: string;
    readonly mutate: (
      transaction: AuditMutationTransaction,
    ) => Promise<AuditedMutationResult<TResult>>;
  }): Promise<TResult>;
}

/** Records one immutable create, update, delete, or cancel fact. */
export class RecordAuditTrail {
  /**
   * Creates the append-only recording use case.
   * @param repository - Append-only repository.
   * @param ids - Explicit ID generator used at the command boundary.
   * @returns A use case for validated immutable facts.
   */
  constructor(
    private readonly repository: AuditTrailRepository,
    private readonly ids: AuditEntryIdGenerator,
  ) {}
  /** @param input - Mutation fact after authorization and business validation. @returns The immutable persisted fact. @throws {AuditTrailFailure} When input is invalid or persistence rejects the append. */
  async execute(input: RecordAuditInput): Promise<AuditEntry> {
    const entry = createAuditEntry({ ...input, id: this.ids.next() });
    await this.repository.append(entry);
    return copyAuditEntry(entry);
  }
}

/** Executes a business mutation and immutable audit fact through one explicit atomic port. */
export class ExecuteAuditedMutation {
  /**
   * Creates the transaction-bound mutation use case.
   * @param transactions - Adapter responsible for one transaction containing the business write and audit append.
   * @param ids - Explicit audit ID generator.
   * @returns A use case that delegates atomic commit to the adapter.
   */
  constructor(
    private readonly transactions: AtomicAuditedMutationPort,
    private readonly ids: AuditEntryIdGenerator,
  ) {}
  /** @param input - Audit metadata and callback that reads prior/post snapshots using the supplied transaction and returns a deferred commit. @returns The committed business result. @throws {AuditTrailFailure} When the trail cannot be validated or atomically committed. */
  async execute<TResult>(input: {
    readonly audit: Omit<RecordAuditInput, "before" | "after">;
    readonly mutate: (
      transaction: AuditMutationTransaction,
    ) => Promise<AuditedMutationResult<TResult>>;
  }): Promise<TResult> {
    return this.transactions.execute({
      audit: input.audit,
      entryId: this.ids.next(),
      mutate: input.mutate,
    });
  }
}

/** Lists detailed audit tracks for one scope, optionally narrowed to an entity or actions. */
export class QueryAuditTrail {
  /**
   * Creates the scope-validating audit query use case.
   * @param repository - Scope-enforcing audit repository.
   * @returns A query use case that detaches returned facts.
   */
  constructor(private readonly repository: AuditTrailReader) {}
  /** @param query - Filter and page boundary. @returns A detached immutable result page. @throws {AuditTrailFailure} When pagination is unsafe. */
  async execute(query: AuditTrailQuery): Promise<AuditTrailPage> {
    validateQuery(query);
    const page = await this.repository.query(query);
    validatePage(query, page);
    return Object.freeze({
      ...page,
      entries: Object.freeze(page.entries.map(copyAuditEntry)),
    });
  }
}

/** Resolves creation and latest mutation metadata for one audited record. */
export class GetAuditRecordMetadata {
  /**
   * Creates the metadata projection use case.
   * @param repository - Scope-enforcing audit repository.
   * @returns A use case that resolves creation and latest-mutation metadata.
   */
  constructor(private readonly repository: AuditTrailReader) {}
  /** @param input - Exact scope, entity type, and entity identifier. @returns Creation/latest metadata or null if no fact exists. */
  async execute(input: {
    readonly scope: AuditScope;
    readonly entityType: AuditedEntityType;
    readonly entityId: string;
  }): Promise<AuditRecordMetadata | null> {
    const entries: AuditEntry[] = [];
    let offset = 0;
    let total = 0;
    do {
      const query = {
        scope: input.scope,
        entityType: input.entityType,
        entityId: input.entityId,
        offset,
        limit: 100,
      } as const;
      const page = await new QueryAuditTrail(this.repository).execute(query);
      entries.push(...page.entries);
      total = page.total;
      offset += page.entries.length;
      if (page.entries.length === 0 && offset < total)
        throw new AuditTrailFailure(
          "INVALID_AUDIT_QUERY",
          "Repository returned an incomplete audit page.",
        );
    } while (offset < total);
    if (entries.length === 0) return null;
    const ordered = entries.sort(
      (left, right) =>
        left.context.occurredAt.localeCompare(right.context.occurredAt) ||
        left.id.localeCompare(right.id),
    );
    const created = ordered.find((entry) => entry.action === "create");
    const latest = ordered.at(-1);
    if (!latest) return null;
    return Object.freeze({
      createdAt: created?.context.occurredAt ?? null,
      createdBy: created?.context.actorId ?? null,
      lastModifiedAt: latest.context.occurredAt,
      lastModifiedBy: latest.context.actorId,
    });
  }
}
function validateQuery(query: AuditTrailQuery): void {
  try {
    auditScope(query.scope);
  } catch {
    throw new AuditTrailFailure(
      "INVALID_AUDIT_QUERY",
      "Audit query scope is invalid.",
    );
  }
  if (
    (query.offset !== undefined &&
      (!Number.isInteger(query.offset) || query.offset < 0)) ||
    (query.limit !== undefined &&
      (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 100))
  )
    throw new AuditTrailFailure(
      "INVALID_AUDIT_QUERY",
      "Audit query pagination is invalid.",
    );
}
function validatePage(query: AuditTrailQuery, page: AuditTrailPage): void {
  if (
    !Number.isInteger(page.total) ||
    page.total < 0 ||
    !Number.isInteger(page.offset) ||
    !Number.isInteger(page.limit) ||
    page.offset !== (query.offset ?? 0) ||
    page.limit !== (query.limit ?? 50) ||
    page.entries.length > page.limit
  )
    throw new AuditTrailFailure(
      "INVALID_AUDIT_QUERY",
      "Repository returned an invalid audit page.",
    );
  for (const entry of page.entries) {
    if (
      !sameAuditScope(entry.scope, query.scope) ||
      (query.entityType !== undefined &&
        entry.entityType !== query.entityType) ||
      (query.entityId !== undefined && entry.entityId !== query.entityId) ||
      (query.actions !== undefined && !query.actions.includes(entry.action))
    )
      throw new AuditTrailFailure(
        "AUDIT_SCOPE_VIOLATION",
        "Repository returned an entry outside the requested audit scope.",
      );
  }
}
