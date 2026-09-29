/** JSON values accepted as audit snapshots. */
export type AuditValue =
  | null
  | boolean
  | number
  | string
  | readonly AuditValue[]
  | { readonly [key: string]: AuditValue };
/** Entity families accepted by audit queries and covered by AUD-016 through AUD-022. */
export const AUDITED_ENTITY_TYPES = [
  "invoice",
  "payment_order",
  "receivable_payment_reversal",
  "customer",
  "product",
  "employee",
  "payroll_receipt",
  "accounting_entry",
] as const;
/** Entity families accepted by audit queries and covered by AUD-016 through AUD-022. */
export type AuditedEntityType = (typeof AUDITED_ENTITY_TYPES)[number];
/** Mutations whose facts must be retained permanently. */
export const AUDIT_ACTIONS = ["create", "update", "delete", "cancel"] as const;
/** Mutations whose facts must be retained permanently. */
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
/** Scope preventing tenant, organization, or company boundary crossings. */ export interface AuditScope {
  readonly tenantId: string;
  readonly organizationId: string;
  readonly companyId: string;
}
/** Identity and origin of an audited mutation. */ export interface AuditOperationContext {
  readonly actorId: string | null;
  readonly occurredAt: string;
  readonly branchId: string | null;
  readonly deviceId: string | null;
}
/** Changed field with deep-immutable values. */ export interface AuditFieldChange {
  readonly field: string;
  readonly before?: AuditValue;
  readonly after?: AuditValue;
}
/** Immutable audit fact. */ export interface AuditEntry {
  readonly id: string;
  readonly scope: AuditScope;
  readonly entityType: AuditedEntityType;
  readonly entityId: string;
  readonly action: AuditAction;
  readonly context: AuditOperationContext;
  readonly before: Readonly<Record<string, AuditValue>> | null;
  readonly after: Readonly<Record<string, AuditValue>> | null;
  readonly changes: readonly AuditFieldChange[];
}
/** Creation and latest-mutation information; missing creation is never inferred. */ export interface AuditRecordMetadata {
  readonly createdAt: string | null;
  readonly createdBy: string | null;
  readonly lastModifiedAt: string;
  readonly lastModifiedBy: string | null;
}
/** Typed audit boundary failure. */ export class AuditTrailFailure extends Error {
  /** @param code - Stable code. @param message - Safe explanation. */ constructor(
    readonly code:
      | "INVALID_AUDIT_ENTRY"
      | "INVALID_AUDIT_QUERY"
      | "AUDIT_ENTRY_CONFLICT"
      | "AUDIT_ENTRY_NOT_FOUND"
      | "AUDIT_SCOPE_VIOLATION",
    message: string,
  ) {
    super(message);
    this.name = "AuditTrailFailure";
  }
}
/** Validates a scope. @param value - Candidate scope. @returns Frozen scope. @throws {AuditTrailFailure} On invalid identifiers. */ export function auditScope(
  value: AuditScope,
): AuditScope {
  if (!value || typeof value !== "object") throw invalid("scope is required.");
  return Object.freeze({
    tenantId: identifier(value.tenantId, "tenantId"),
    organizationId: identifier(value.organizationId, "organizationId"),
    companyId: identifier(value.companyId, "companyId"),
  });
}
/** Validates actor, timestamp, branch and device. @param value - Candidate context. @returns Frozen context. @throws {AuditTrailFailure} On invalid data. */ export function auditOperationContext(
  value: AuditOperationContext,
): AuditOperationContext {
  if (!value || typeof value !== "object")
    throw invalid("context is required.");
  const at = new Date(value.occurredAt);
  if (
    typeof value.occurredAt !== "string" ||
    Number.isNaN(at.valueOf()) ||
    at.toISOString() !== value.occurredAt
  )
    throw invalid("occurredAt must be an ISO-8601 instant.");
  return Object.freeze({
    actorId: nullableIdentifier(value.actorId, "actorId"),
    occurredAt: value.occurredAt,
    branchId: nullableIdentifier(value.branchId, "branchId"),
    deviceId: nullableIdentifier(value.deviceId, "deviceId"),
  });
}
/** Builds an immutable fact and derives its changes. @param input - Candidate fact. @returns Frozen audit fact. @throws {AuditTrailFailure} On invalid boundary data. */ export function createAuditEntry(
  input: Omit<
    AuditEntry,
    "changes" | "scope" | "context" | "before" | "after"
  > & {
    readonly scope: AuditScope;
    readonly context: AuditOperationContext;
    readonly before: Record<string, AuditValue> | null;
    readonly after: Record<string, AuditValue> | null;
  },
): AuditEntry {
  if (!input || !isAction(input.action) || !isEntity(input.entityType))
    throw invalid("Audit action or entity type is invalid.");
  if (
    (input.action === "create" &&
      (input.before !== null || input.after === null)) ||
    (input.action === "delete" &&
      (input.before === null || input.after !== null)) ||
    ((input.action === "update" || input.action === "cancel") &&
      (input.before === null || input.after === null))
  )
    throw invalid("Snapshots do not match the audit action.");
  const before = input.before === null ? null : snapshot(input.before);
  const after = input.after === null ? null : snapshot(input.after);
  const changes = Object.freeze(diff(before, after));
  if (
    (input.action === "update" || input.action === "cancel") &&
    changes.length === 0
  )
    throw invalid("An update or cancellation must alter at least one field.");
  return Object.freeze({
    id: identifier(input.id, "id"),
    scope: auditScope(input.scope),
    entityType: input.entityType,
    entityId: identifier(input.entityId, "entityId"),
    action: input.action,
    context: auditOperationContext(input.context),
    before,
    after,
    changes,
  });
}
/** Makes a detached deep-immutable copy. @param entry - Persisted fact. @returns Safe copy. */ export function copyAuditEntry(
  entry: AuditEntry,
): AuditEntry {
  return createAuditEntry({
    ...entry,
    before:
      entry.before === null
        ? null
        : (clone(entry.before, new WeakSet<object>()) as Record<
            string,
            AuditValue
          >),
    after:
      entry.after === null
        ? null
        : (clone(entry.after, new WeakSet<object>()) as Record<
            string,
            AuditValue
          >),
  });
}
/** Compares complete scopes. @param left - First scope. @param right - Second scope. @returns Whether all identifiers match. */ export function sameAuditScope(
  left: AuditScope,
  right: AuditScope,
): boolean {
  return (
    left.tenantId === right.tenantId &&
    left.organizationId === right.organizationId &&
    left.companyId === right.companyId
  );
}
function invalid(message: string): AuditTrailFailure {
  return new AuditTrailFailure("INVALID_AUDIT_ENTRY", message);
}
function identifier(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 128)
    throw invalid(`${field} is invalid.`);
  return value.trim();
}
function nullableIdentifier(value: unknown, field: string): string | null { return value === null ? null : identifier(value, field); }
function isAction(value: unknown): value is AuditAction {
  return (
    value === "create" ||
    value === "update" ||
    value === "delete" ||
    value === "cancel"
  );
}
function isEntity(value: unknown): value is AuditedEntityType {
  return [
    "invoice",
    "payment_order",
    "receivable_payment_reversal",
    "customer",
    "product",
    "employee",
    "payroll_receipt",
    "accounting_entry",
  ].includes(value as string);
}
function snapshot(
  value: Record<string, AuditValue>,
): Readonly<Record<string, AuditValue>> {
  if (!plain(value)) throw invalid("Snapshot must be a plain JSON object.");
  return freeze(clone(value, new WeakSet<object>())) as Readonly<
    Record<string, AuditValue>
  >;
}
function plain(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const p = Object.getPrototypeOf(value);
  return p === Object.prototype || p === null;
}
function clone(value: unknown, seen: WeakSet<object>): AuditValue {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw invalid("Snapshot numbers must be finite.");
    return value;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw invalid("Snapshot cannot contain cycles.");
    seen.add(value);
    const result = Array.from(value, (x) => clone(x, seen));
    seen.delete(value);
    return result;
  }
  if (plain(value)) {
    if (seen.has(value)) throw invalid("Snapshot cannot contain cycles.");
    seen.add(value);
    const result: Record<string, AuditValue> = {};
    for (const [key, child] of Object.entries(value)) {
      if (child === undefined)
        throw invalid("Snapshot cannot contain undefined values.");
      Object.defineProperty(result, key, {
        value: clone(child, seen),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    seen.delete(value);
    return result;
  }
  throw invalid("Snapshot must contain only JSON values.");
}
function freeze(value: AuditValue): AuditValue {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function diff(
  before: Readonly<Record<string, AuditValue>> | null,
  after: Readonly<Record<string, AuditValue>> | null,
): AuditFieldChange[] {
  const keys = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);
  return [...keys].sort().flatMap((field) => {
    const old =
        before !== null && Object.hasOwn(before, field)
          ? before[field]
          : undefined,
      next =
        after !== null && Object.hasOwn(after, field)
          ? after[field]
          : undefined;
    return stable(old) === stable(next)
      ? []
      : [
          Object.freeze({
            field,
            ...(old === undefined
              ? {}
              : { before: freeze(clone(old, new WeakSet<object>())) }),
            ...(next === undefined
              ? {}
              : { after: freeze(clone(next, new WeakSet<object>())) }),
          }),
        ];
  });
}
function stable(value: AuditValue | undefined): string {
  return value === undefined
    ? "undefined"
    : JSON.stringify(value, (_key, child: unknown) =>
        plain(child)
          ? Object.fromEntries(
              Object.entries(child).sort(([a], [b]) => a.localeCompare(b)),
            )
          : child,
      );
}
