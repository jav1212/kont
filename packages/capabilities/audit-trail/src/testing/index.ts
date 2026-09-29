import { AuditTrailFailure, copyAuditEntry, type AuditEntry } from "../domain";
import type {
  AuditTrailPage,
  AuditTrailQuery,
  AuditTrailRepository,
} from "../application";

/** In-memory append-only adapter for unit and contract tests; it is not durable or transactionally coupled to business writes. */
export class InMemoryAuditTrailRepository implements AuditTrailRepository {
  private readonly entries: AuditEntry[] = [];
  /** {@inheritDoc AuditTrailRepository.append} */
  async append(entry: AuditEntry): Promise<void> {
    if (this.entries.some((stored) => stored.id === entry.id))
      throw new AuditTrailFailure(
        "AUDIT_ENTRY_CONFLICT",
        "Audit entry already exists.",
      );
    this.entries.push(copyAuditEntry(entry));
  }
  /** {@inheritDoc AuditTrailRepository.query} */
  async query(query: AuditTrailQuery): Promise<AuditTrailPage> {
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 50;
    const entries = this.entries
      .filter(
        (entry) =>
          entry.scope.tenantId === query.scope.tenantId &&
          entry.scope.organizationId === query.scope.organizationId &&
          entry.scope.companyId === query.scope.companyId &&
          (query.entityType === undefined ||
            entry.entityType === query.entityType) &&
          (query.entityId === undefined || entry.entityId === query.entityId) &&
          (query.actions === undefined || query.actions.includes(entry.action)),
      )
      .sort(
        (left, right) =>
          left.context.occurredAt.localeCompare(right.context.occurredAt) ||
          left.id.localeCompare(right.id),
      );
    return Object.freeze({
      entries: Object.freeze(
        entries.slice(offset, offset + limit).map(copyAuditEntry),
      ),
      total: entries.length,
      offset,
      limit,
    });
  }
}

/** Deterministic ID source for tests. */
export class SequenceAuditEntryIdGenerator {
  private nextValue = 0;
  /**
   * Produces the next ordered audit ID.
   * @returns A new ordered audit entry ID.
   */
  next(): string {
    this.nextValue += 1;
    return `audit-${this.nextValue}`;
  }
}
