import type { CompanyDocumentSeriesSelection } from "@kontave/companies/application";
import type { CompanyDocumentSeriesScope, CompanyId } from "@kontave/companies/domain";
import { SalesFailure } from "../domain";
import type {
  SalesBranchAttribution,
  SalesOperationOrigin,
  SalesRegisterAttribution,
  SecuredSalesScope,
} from "./secured-sales";

/**
 * Input for the durable delivery-note confirmation that allocates one configured document-series number.
 * This commercial workflow deliberately carries no fiscal document or tax-reporting fact: a delivery note is not an invoice.
 */
export interface IssueSalesDeliveryNoteWithDocumentSeriesCommand
  extends SecuredSalesScope,
    SalesOperationOrigin,
    SalesBranchAttribution,
    SalesRegisterAttribution {
  /** Existing legacy sales draft identifier that is being confirmed as a delivery note. */
  readonly deliveryNoteId: string;
  /** Stable caller intent key; an identical retry returns the original durable allocation. */
  readonly idempotencyKey: string;
  /** Company or registered-branch series boundary that owns the allocated number. */
  readonly documentSeriesScope: CompanyDocumentSeriesScope;
  /** Explicit series choice or the persisted rule used to resolve it. */
  readonly documentSeriesSelection: CompanyDocumentSeriesSelection;
  /** Whether the already-authorized caller asks to permit negative inventory. */
  readonly allowNegativeStock: boolean;
  /** Optional commercial price list that the persistent transaction authorizes. */
  readonly priceListId?: string | null;
}

/** Durable delivery-note confirmation and its immutable document-number allocation. */
export interface IssuedSalesDeliveryNoteWithDocumentSeries {
  /** Confirmed legacy sales draft identifier. */
  readonly deliveryNoteId: string;
  /** Company that owns both delivery note and allocation. */
  readonly companyId: CompanyId;
  /** Confirmed lifecycle state. */
  readonly status: "confirmed";
  /** Selected configured company series. */
  readonly seriesId: string;
  /** Human-readable number copied to the confirmed delivery note. */
  readonly displayNumber: string;
  /** Sequence value from the configured series. */
  readonly number: number;
  /** Whether this is the exact durable result of an earlier matching request. */
  readonly replayed: boolean;
}

/** Port that owns commercial delivery-note confirmation and company-series allocation as one transaction. */
export interface SalesDeliveryNoteDocumentSeriesIssuanceRepository {
  /**
   * Confirms a delivery note and persists its series allocation atomically.
   * @param command - Validated caller intent and all commercial confirmation choices.
   * @returns Durable delivery-note evidence or an exact idempotent replay.
   * @throws {SalesFailure} When access, selection, stock, credit, concurrency, or persistence rejects confirmation.
   */
  issue(command: IssueSalesDeliveryNoteWithDocumentSeriesCommand): Promise<IssuedSalesDeliveryNoteWithDocumentSeries>;
}

/** Application service that validates portable delivery-note issuance without introducing fiscal invoice invariants. */
export class IssueSalesDeliveryNoteWithDocumentSeries {
  /**
   * @param repository - Transactional persistence and authorization boundary.
   * @returns A delivery-note issuance application service.
   */
  constructor(private readonly repository: SalesDeliveryNoteDocumentSeriesIssuanceRepository) {}

  /**
   * Assigns a series number and confirms one delivery-note draft atomically through the repository.
   * @param command - Authenticated scope, draft, selected series policy, and confirmation choices.
   * @returns The confirmed delivery-note allocation, including an idempotent replay indication.
   * @throws {SalesFailure} When input is malformed or the durable transaction rejects it.
   */
  issue(command: IssueSalesDeliveryNoteWithDocumentSeriesCommand): Promise<IssuedSalesDeliveryNoteWithDocumentSeries> {
    return this.repository.issue(normalize(command));
  }
}

function normalize(command: IssueSalesDeliveryNoteWithDocumentSeriesCommand): IssueSalesDeliveryNoteWithDocumentSeriesCommand {
  if (!command || typeof command !== "object") throw invalid();
  identifier(command.actorUserId);
  identifier(command.organizationId);
  identifier(command.companyId);
  identifier(command.deliveryNoteId);
  if (!isUuid(command.actorUserId) || !isUuid(command.organizationId) || typeof command.allowNegativeStock !== "boolean") throw invalid();
  const idempotencyKey = issuanceKey(command.idempotencyKey);
  if (command.priceListId != null) identifier(command.priceListId);
  if (command.branchId != null) identifier(command.branchId);
  if (command.deviceId != null) identifier(command.deviceId);
  if (command.salesRegisterId != null) identifier(command.salesRegisterId);
  if (command.companyBranchId != null && !isUuid(command.companyBranchId)) throw invalid();
  if (command.salesRegisterId != null && command.companyBranchId != null) throw invalid();

  const scope = command.documentSeriesScope as unknown;
  if (!scope || typeof scope !== "object" || !("organizationId" in scope) || !("companyId" in scope) || !("kind" in scope)
    || scope.organizationId !== command.organizationId || scope.companyId !== command.companyId
    || (scope.kind !== "company" && scope.kind !== "branch")) throw documentSeriesInvalid();
  if (scope.kind === "branch") {
    if (!("branchId" in scope) || !isUuid(scope.branchId) || command.companyBranchId !== scope.branchId) throw documentSeriesInvalid();
  } else if ("branchId" in scope) throw documentSeriesInvalid();

  const selection = command.documentSeriesSelection as unknown;
  if (!selection || typeof selection !== "object" || !("kind" in selection)) throw documentSeriesInvalid();
  let normalizedSelection: CompanyDocumentSeriesSelection;
  if (selection.kind === "explicit") {
    if (!("seriesId" in selection) || !isUuid(selection.seriesId)) throw documentSeriesInvalid();
    normalizedSelection = Object.freeze({ kind: "explicit", seriesId: selection.seriesId.trim() });
  } else if (selection.kind === "policy") normalizedSelection = Object.freeze({ kind: "policy" });
  else throw documentSeriesInvalid();

  return Object.freeze({
    ...command,
    deliveryNoteId: command.deliveryNoteId.trim(),
    idempotencyKey,
    priceListId: command.priceListId?.trim() || null,
    branchId: command.branchId?.trim() || null,
    deviceId: command.deviceId?.trim() || null,
    companyBranchId: command.companyBranchId?.trim() || null,
    salesRegisterId: command.salesRegisterId?.trim() || null,
    documentSeriesScope: Object.freeze({ ...scope }) as CompanyDocumentSeriesScope,
    documentSeriesSelection: normalizedSelection,
  });
}

function identifier(value: unknown): void {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 128) throw invalid();
}
function issuanceKey(value: unknown): string {
  if (typeof value !== "string") throw invalid();
  const normalized = value.trim();
  if (normalized.length < 8 || normalized.length > 128) throw invalid();
  return normalized;
}
function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}
function invalid(): SalesFailure {
  return new SalesFailure("SALES_DOCUMENT_SERIES_INVALID", "Sales delivery-note issuance command is invalid.");
}
function documentSeriesInvalid(): SalesFailure {
  return new SalesFailure("SALES_DOCUMENT_SERIES_SELECTION_INVALID", "Sales delivery-note document-series selection is invalid.");
}
