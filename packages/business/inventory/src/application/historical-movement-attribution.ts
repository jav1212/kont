import { compareDecimal, decimalScale, exactDecimal, type ExactDecimal } from "@kontave/monetary/domain";
import type { CompanyId } from "@kontave/companies/domain";
import type { OrganizationId, UserId } from "@kontave/organizations/domain";

/** Historical movement types that can be reviewed without changing the original inventory event. */
export type HistoricalInventoryMovementType =
  | "entrada"
  | "salida"
  | "ajuste_positivo"
  | "ajuste_negativo"
  | "devolucion_entrada"
  | "devolucion_salida"
  | "autoconsumo";

/** A reviewed, independent legacy movement that may be attributed once to a branch. */
export interface HistoricalInventoryMovementAttributionCandidate {
  readonly movementId: string;
  readonly companyId: string;
  readonly productId: string;
  readonly type: HistoricalInventoryMovementType;
  readonly date: string;
  readonly quantity: ExactDecimal;
  readonly unit: string;
  readonly unitCostVes: ExactDecimal;
  readonly totalCostVes: ExactDecimal;
  readonly reference: string | null;
  /** SHA-256 token that binds a reviewed candidate to its immutable source data. */
  readonly fingerprint: string;
  readonly attributedBranchId: string | null;
}

/** Scope used to read one candidate before an historical attribution is made. */
export interface GetHistoricalInventoryMovementAttributionCandidateQuery {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly companyId: CompanyId;
  readonly movementId: string;
}

/** Command for an atomic, idempotent attribution of one independent historical movement. */
export interface AttributeHistoricalInventoryMovementCommand extends GetHistoricalInventoryMovementAttributionCandidateQuery {
  readonly branchId: string;
  readonly expectedMovementFingerprint: string;
  readonly reason: string;
  readonly idempotencyKey: string;
}

/** Immutable authoritative record of an historical movement attributed to a branch. */
export interface HistoricalInventoryMovementAttribution {
  readonly movementId: string;
  readonly companyId: string;
  readonly branchId: string;
  readonly productId: string;
  readonly type: HistoricalInventoryMovementType;
  readonly date: string;
  readonly quantity: ExactDecimal;
  readonly unit: string;
  readonly unitCostVes: ExactDecimal;
  readonly totalCostVes: ExactDecimal;
  readonly attributedAt: string;
  readonly attributedBy: string;
  readonly reason: string;
}

/** Read port that previews a candidate without modifying source inventory history. */
export interface HistoricalInventoryMovementAttributionCandidateReader {
  /**
   * @param query - Validated actor, organization, company and movement scope.
   * @returns An immutable candidate, including its concurrency fingerprint.
   * @throws {HistoricalInventoryMovementAttributionFailure} When the candidate cannot be read.
   */
  get(query: GetHistoricalInventoryMovementAttributionCandidateQuery): Promise<HistoricalInventoryMovementAttributionCandidate>;
}

/** Write port that permanently links a reviewed independent movement to one branch. */
export interface HistoricalInventoryMovementAttributionWriter {
  /**
   * @param command - Validated reviewed attribution command.
   * @returns The authoritative immutable attribution.
   * @throws {HistoricalInventoryMovementAttributionFailure} When attribution cannot be recorded.
   */
  attribute(command: AttributeHistoricalInventoryMovementCommand): Promise<HistoricalInventoryMovementAttribution>;
}

/** Expected failure for previewing or attributing an historical inventory movement. */
export class HistoricalInventoryMovementAttributionFailure extends Error {
  /**
   * @param code - Stable reason appropriate for a transport boundary.
   * @param message - Safe diagnostic text.
   * @param options - Optional retained underlying cause.
   * @returns A typed historical-attribution failure.
   */
  constructor(
    readonly code:
      | "INVENTORY_BRANCH_ATTRIBUTION_INVALID"
      | "INVENTORY_BRANCH_ATTRIBUTION_ACCESS_DENIED"
      | "INVENTORY_BRANCH_ATTRIBUTION_MOVEMENT_UNAVAILABLE"
      | "INVENTORY_BRANCH_ATTRIBUTION_ALREADY_ATTRIBUTED"
      | "INVENTORY_BRANCH_ATTRIBUTION_STALE"
      | "INVENTORY_BRANCH_ATTRIBUTION_IDEMPOTENCY_CONFLICT"
      | "INVENTORY_BRANCH_ATTRIBUTION_UNAVAILABLE",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "HistoricalInventoryMovementAttributionFailure";
  }
}

/** Loads an immutable, authorization-scoped candidate before an attribution is reviewed. */
export class GetHistoricalInventoryMovementAttributionCandidate {
  /**
   * @param reader - Read port that authorizes and finds an independent source movement.
   * @returns A candidate-preview use case.
   */
  constructor(private readonly reader: HistoricalInventoryMovementAttributionCandidateReader) {}

  /**
   * @param query - Untrusted source-movement scope.
   * @returns The immutable candidate snapshot.
   * @throws {HistoricalInventoryMovementAttributionFailure} When validation or loading fails.
   */
  async execute(query: GetHistoricalInventoryMovementAttributionCandidateQuery): Promise<HistoricalInventoryMovementAttributionCandidate> {
    const valid = validateGetHistoricalInventoryMovementAttributionCandidateQuery(query);
    try {
      return freezeHistoricalInventoryMovementAttributionCandidate(await this.reader.get(valid));
    } catch (cause: unknown) {
      if (cause instanceof HistoricalInventoryMovementAttributionFailure) throw cause;
      throw unavailable(cause);
    }
  }
}

/** Attributes a reviewed independent source movement after validating portable invariants. */
export class AttributeHistoricalInventoryMovement {
  /**
   * @param writer - Write port that atomically verifies and persists the attribution.
   * @returns An historical-attribution use case.
   */
  constructor(private readonly writer: HistoricalInventoryMovementAttributionWriter) {}

  /**
   * @param command - Untrusted reviewed attribution command.
   * @returns The immutable authoritative attribution.
   * @throws {HistoricalInventoryMovementAttributionFailure} When validation or attribution fails.
   */
  async execute(command: AttributeHistoricalInventoryMovementCommand): Promise<HistoricalInventoryMovementAttribution> {
    const valid = validateAttributeHistoricalInventoryMovementCommand(command);
    try {
      return freezeHistoricalInventoryMovementAttribution(await this.writer.attribute(valid));
    } catch (cause: unknown) {
      if (cause instanceof HistoricalInventoryMovementAttributionFailure) throw cause;
      throw unavailable(cause);
    }
  }
}

/**
 * Validates candidate-preview scope without performing persistence or authorization work.
 * @param query - Untrusted candidate query.
 * @returns A frozen canonical query.
 * @throws {HistoricalInventoryMovementAttributionFailure} When a portable invariant is violated.
 */
export function validateGetHistoricalInventoryMovementAttributionCandidateQuery(
  query: GetHistoricalInventoryMovementAttributionCandidateQuery,
): GetHistoricalInventoryMovementAttributionCandidateQuery {
  if (!query || typeof query !== "object") throw invalid("Historical movement query is required.");
  return Object.freeze({
    actorUserId: uuidValue(query.actorUserId, "Actor user ID") as UserId,
    organizationId: uuidValue(query.organizationId, "Organization ID") as OrganizationId,
    companyId: text(query.companyId, "Company ID", 128) as CompanyId,
    movementId: text(query.movementId, "Movement ID", 128),
  });
}

/**
 * Validates an historical-attribution command without performing persistence or authorization work.
 * @param command - Untrusted reviewed attribution command.
 * @returns A frozen canonical command.
 * @throws {HistoricalInventoryMovementAttributionFailure} When a portable invariant is violated.
 */
export function validateAttributeHistoricalInventoryMovementCommand(
  command: AttributeHistoricalInventoryMovementCommand,
): AttributeHistoricalInventoryMovementCommand {
  const scope = validateGetHistoricalInventoryMovementAttributionCandidateQuery(command);
  return Object.freeze({
    ...scope,
    branchId: uuidValue(command.branchId, "Branch ID"),
    expectedMovementFingerprint: fingerprint(command.expectedMovementFingerprint),
    reason: reason(command.reason),
    idempotencyKey: text(command.idempotencyKey, "Idempotency key", 128),
  });
}

/**
 * Validates an untrusted candidate response before exposing it to a consumer.
 * @param value - Candidate response from a persistence adapter.
 * @returns A frozen exact-decimal candidate.
 * @throws {HistoricalInventoryMovementAttributionFailure} When the response violates the contract.
 */
export function freezeHistoricalInventoryMovementAttributionCandidate(
  value: HistoricalInventoryMovementAttributionCandidate,
): HistoricalInventoryMovementAttributionCandidate {
  if (!value || typeof value !== "object") throw invalid("Historical movement candidate is invalid.");
  return Object.freeze({
    movementId: text(value.movementId, "Response movement ID", 128),
    companyId: text(value.companyId, "Response company ID", 128),
    productId: text(value.productId, "Response product ID", 128),
    type: movementType(value.type),
    date: civilDate(value.date),
    quantity: positiveDecimal(value.quantity, "Response quantity"),
    unit: text(value.unit, "Response unit", 64),
    unitCostVes: nonNegativeDecimal(value.unitCostVes, "Response unit cost"),
    totalCostVes: nonNegativeDecimal(value.totalCostVes, "Response total cost"),
    reference: nullableLegacyReference(value.reference),
    fingerprint: fingerprint(value.fingerprint),
    attributedBranchId: value.attributedBranchId === null ? null : uuidValue(value.attributedBranchId, "Response attributed branch ID"),
  });
}

/**
 * Validates an untrusted write response before exposing it to a consumer.
 * @param value - Attribution response from a persistence adapter.
 * @returns A frozen exact-decimal attribution.
 * @throws {HistoricalInventoryMovementAttributionFailure} When the response violates the contract.
 */
export function freezeHistoricalInventoryMovementAttribution(
  value: HistoricalInventoryMovementAttribution,
): HistoricalInventoryMovementAttribution {
  if (!value || typeof value !== "object") throw invalid("Historical movement attribution is invalid.");
  return Object.freeze({
    movementId: text(value.movementId, "Response movement ID", 128),
    companyId: text(value.companyId, "Response company ID", 128),
    branchId: uuidValue(value.branchId, "Response branch ID"),
    productId: text(value.productId, "Response product ID", 128),
    type: movementType(value.type),
    date: civilDate(value.date),
    quantity: positiveDecimal(value.quantity, "Response quantity"),
    unit: text(value.unit, "Response unit", 64),
    unitCostVes: nonNegativeDecimal(value.unitCostVes, "Response unit cost"),
    totalCostVes: nonNegativeDecimal(value.totalCostVes, "Response total cost"),
    attributedAt: instant(value.attributedAt),
    attributedBy: uuidValue(value.attributedBy, "Response attributed-by user ID"),
    reason: reason(value.reason),
  });
}

function decodeDecimal(value: unknown, label: string): ExactDecimal { if (typeof value !== "string" || value.trim() !== value) throw invalid(`${label} must be decimal text.`); try { return exactDecimal(value); } catch { throw invalid(`${label} must be decimal text.`); } }
function positiveDecimal(value: unknown, label: string): ExactDecimal { const parsed = decodeDecimal(value, label); if (decimalScale(parsed) > 4 || compareDecimal(parsed, exactDecimal("0")) <= 0) throw invalid(`${label} must be positive with at most four decimal places.`); return parsed; }
function nonNegativeDecimal(value: unknown, label: string): ExactDecimal { const parsed = decodeDecimal(value, label); if (decimalScale(parsed) > 4 || compareDecimal(parsed, exactDecimal("0")) < 0) throw invalid(`${label} must be non-negative with at most four decimal places.`); return parsed; }
function civilDate(value: unknown): string { if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw invalid("Movement date must use YYYY-MM-DD format."); const [year, month, day] = value.split("-").map(Number) as [number, number, number]; const parsed = new Date(Date.UTC(year, month - 1, day)); if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) throw invalid("Movement date is invalid."); return value; }
function instant(value: unknown): string { if (typeof value !== "string" || value.trim() !== value || Number.isNaN(Date.parse(value))) throw invalid("Response attribution instant is invalid."); return value; }
function text(value: unknown, label: string, max: number): string { const normalized = typeof value === "string" ? value.trim() : ""; if (!normalized || normalized.length > max || /[\u0000-\u001f\u007f]/.test(normalized)) throw invalid(`${label} is invalid.`); return normalized; }
/** Preserves legacy empty references while bounding an untrusted read-only preview payload. */
function nullableLegacyReference(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 4096 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw invalid("Response reference is invalid.");
  }
  return value;
}
function reason(value: unknown): string { const normalized = text(value, "Reason", 500); if (normalized.length < 10) throw invalid("Reason must contain between 10 and 500 characters."); return normalized; }
function movementType(value: unknown): HistoricalInventoryMovementType { if (typeof value !== "string" || !historicalMovementTypes.has(value as HistoricalInventoryMovementType)) throw invalid("Response movement type is invalid."); return value as HistoricalInventoryMovementType; }
function fingerprint(value: unknown): string { if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw invalid("Expected movement fingerprint must be a lowercase SHA-256 hash."); return value; }
function uuidValue(value: unknown, label: string): string { if (typeof value !== "string" || !uuid.test(value)) throw invalid(`${label} must be a UUID.`); return value; }
function invalid(message: string): HistoricalInventoryMovementAttributionFailure { return new HistoricalInventoryMovementAttributionFailure("INVENTORY_BRANCH_ATTRIBUTION_INVALID", message); }
function unavailable(cause: unknown): HistoricalInventoryMovementAttributionFailure { return new HistoricalInventoryMovementAttributionFailure("INVENTORY_BRANCH_ATTRIBUTION_UNAVAILABLE", "Historical inventory movement attribution is unavailable.", { cause }); }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const historicalMovementTypes = new Set<HistoricalInventoryMovementType>(["entrada", "salida", "ajuste_positivo", "ajuste_negativo", "devolucion_entrada", "devolucion_salida", "autoconsumo"]);
