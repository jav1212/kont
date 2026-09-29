import {
  AuditTrailFailure,
  createAuditEntry,
  sameAuditScope,
  type AuditAction,
  type AuditEntry,
} from "../../domain";
import type { AuditTrailRepository } from "../../application";
import type { AuditTrailPage, AuditTrailQuery } from "../../application";

/** Minimal RPC source; this portable package does not depend on an SDK. */
export interface AuditTrailSupabaseSource {
  /**
   * Calls a database function through the configured transport.
   * @param name - Stable database function name.
   * @param parameters - Function arguments serialized for PostgREST.
   * @returns The returned payload or structured database error.
   */
  rpc(
    name: string,
    parameters: Record<string, unknown>,
  ): PromiseLike<{
    data: unknown;
    error: { message?: string; code?: string } | null;
  }>;
}
/** Reads durable facts through the SQL permission gate. */
export class SupabaseAuditTrailRepository implements Pick<
  AuditTrailRepository,
  "query"
> {
  /**
   * Creates a scope-checked audit query adapter.
   * @param source - RPC source.
   * @param actorUserId - Caller identity established outside this adapter.
   * @returns An adapter that delegates scope authorization to SQL.
   */
  constructor(
    private readonly source: AuditTrailSupabaseSource,
    private readonly actorUserId: string,
  ) {}
  /** @param query - Scope and page filters. @returns A validated audit page. @throws {AuditTrailFailure} When SQL rejects or returns malformed data. */
  async query(query: AuditTrailQuery): Promise<AuditTrailPage> {
    const { data, error } = await this.source.rpc(
      "query_operational_audit_trail",
      {
        p_tenant_id: query.scope.tenantId,
        p_organization_id: query.scope.organizationId,
        p_company_id: query.scope.companyId,
        p_actor_user_id: this.actorUserId,
        p_entity_type: query.entityType ?? null,
        p_entity_id: query.entityId ?? null,
        p_actions: query.actions ?? null,
        p_offset: query.offset ?? 0,
        p_limit: query.limit ?? 50,
      },
    );
    if (error)
      throw new AuditTrailFailure(
        "AUDIT_SCOPE_VIOLATION",
        error.message ?? error.code ?? "Audit query was rejected.",
      );
    const page = decodePage(data);
    if (
      page.offset !== (query.offset ?? 0) ||
      page.limit !== (query.limit ?? 50) ||
      page.entries.length > page.limit ||
      page.entries.some(
        (entry) =>
          !sameAuditScope(entry.scope, query.scope) ||
          (query.entityType !== undefined &&
            entry.entityType !== query.entityType) ||
          (query.entityId !== undefined && entry.entityId !== query.entityId) ||
          (query.actions !== undefined &&
            !query.actions.includes(entry.action)),
      )
    )
      throw invalid("Audit page crosses its requested scope or filters.");
    return page;
  }
}
/** Decodes untrusted PostgREST data into the portable contract.
 * @param value - Untrusted JSON returned by the RPC.
 * @returns A validated immutable audit entry.
 * @throws {AuditTrailFailure} When the payload does not satisfy the contract.
 */
export function decodeAuditEntry(value: unknown): AuditEntry {
  if (!object(value)) throw invalid("Audit entry is not an object.");
  try {
    return createAuditEntry({
      id: text(value.id),
      scope: {
        tenantId: text(value.tenant_id),
        organizationId: text(value.organization_id),
        companyId: text(value.company_id),
      },
      entityType: entity(value.entity_type),
      entityId: text(value.entity_id),
      action: action(value.action),
      context: {
        actorId: nullableText(value.actor_id),
        occurredAt: iso(value.occurred_at),
        branchId: nullableText(value.branch_id),
        deviceId: nullableText(value.device_id),
      },
      before: jsonObjectOrNull(value.before_snapshot),
      after: jsonObjectOrNull(value.after_snapshot),
    });
  } catch (cause) {
    if (cause instanceof AuditTrailFailure) throw cause;
    throw invalid("Audit entry has invalid fields.");
  }
}
function decodePage(value: unknown): AuditTrailPage {
  if (
    !object(value) ||
    !Array.isArray(value.entries) ||
    !integer(value.total) ||
    !integer(value.offset) ||
    !integer(value.limit)
  )
    throw invalid("Audit page is invalid.");
  return Object.freeze({
    entries: Object.freeze(value.entries.map(decodeAuditEntry)),
    total: value.total,
    offset: value.offset,
    limit: value.limit,
  });
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown): string {
  if (typeof value !== "string") throw invalid("Expected text.");
  return value;
}
function nullableText(value: unknown): string | null {
  return value === null || value === undefined ? null : text(value);
}
function iso(value: unknown): string {
  const result = text(value);
  if (Number.isNaN(new Date(result).valueOf()))
    throw invalid("Expected timestamp.");
  return new Date(result).toISOString();
}
function integer(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
function jsonObjectOrNull(value: unknown): Record<string, never> | null {
  if (value === null) return null;
  if (!object(value)) throw invalid("Expected JSON object.");
  return value as Record<string, never>;
}
function action(value: unknown): AuditAction {
  if (
    value === "create" ||
    value === "update" ||
    value === "delete" ||
    value === "cancel"
  )
    return value;
  throw invalid("Invalid action.");
}
function entity(
  value: unknown,
):
  | "invoice"
  | "payment_order"
  | "receivable_payment_reversal"
  | "customer"
  | "product"
  | "employee"
  | "payroll_receipt"
  | "accounting_entry" {
  if (
    typeof value === "string" &&
    [
      "invoice",
      "payment_order",
      "receivable_payment_reversal",
      "customer",
      "product",
      "employee",
      "payroll_receipt",
      "accounting_entry",
    ].includes(value)
  )
    return value as never;
  throw invalid("Invalid entity type.");
}
function invalid(message: string): AuditTrailFailure {
  return new AuditTrailFailure("INVALID_AUDIT_QUERY", message);
}
