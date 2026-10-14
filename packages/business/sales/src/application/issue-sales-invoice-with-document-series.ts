import type { CompanyDocumentSeriesSelection } from "@kontave/companies/application";
import type { CompanyDocumentSeriesScope, CompanyId } from "@kontave/companies/domain";
import type { FiscalDocument } from "@kontave/fiscal/domain";
import { fiscalDate, fiscalInstant } from "@kontave/fiscal/domain";
import { fiscalDocumentTaxFactForSalesSeriesIssue, type FiscalDocumentFactMetadata } from "@kontave/tax-reporting/fiscal-document-mapper";
import { TaxReportingFailure, type TaxReportingFact, type TaxReportingScope } from "@kontave/tax-reporting/domain";
import { SalesFailure } from "../domain";
import type {
  SalesBranchAttribution,
  SalesOperationOrigin,
  SalesRegisterAttribution,
  SecuredSalesScope,
} from "./secured-sales";

/**
 * Input for the one durable operation that assigns a company document number and confirms a sales invoice.
 * The repository must make assignment, stock posting, credit authorization, fiscal issuance, and IVA recognition one transaction.
 */
export interface IssueSalesInvoiceWithDocumentSeriesCommand
  extends SecuredSalesScope,
    SalesOperationOrigin,
    SalesBranchAttribution,
    SalesRegisterAttribution {
  /** Existing draft invoice identifier. */
  readonly invoiceId: string;
  /** Expected update time of the commercial draft used to prepare the fiscal snapshot. */
  readonly sourceUpdatedAt: string;
  /** Stable caller intent key; a retry returns the original durable issuance. */
  readonly idempotencyKey: string;
  /** Company or registered-branch series boundary that owns the allocated number. */
  readonly documentSeriesScope: CompanyDocumentSeriesScope;
  /** Explicit series choice or the persisted rule used to resolve it. */
  readonly documentSeriesSelection: CompanyDocumentSeriesSelection;
  /** Whether the already-authorized caller asks to permit negative inventory. */
  readonly allowNegativeStock: boolean;
  /** Authorized tenant, organization, and company for tax reporting. */
  readonly taxScope: TaxReportingScope;
  /** Complete, validated outbound invoice draft with saved tax determinations. */
  readonly fiscalDocumentDraft: FiscalDocument;
  /** Legal/commercial issue date to store with the assigned invoice number. */
  readonly fiscalIssueDate: string;
  /** Issuance instant used for both fiscal and reporting audit records. */
  readonly issuedAt: string;
  /** Explicit lineage and counterparty evidence for the VAT fact. */
  readonly factMetadata: FiscalDocumentFactMetadata;
  /** Optional commercial price list that the persistent transaction authorizes. */
  readonly priceListId?: string | null;
}

/** Durable invoice confirmation and its immutable document-number allocation. */
export interface IssuedSalesInvoiceWithDocumentSeries {
  /** Confirmed draft invoice identifier. */
  readonly invoiceId: string;
  /** Company that owns both invoice and allocation. */
  readonly companyId: CompanyId;
  /** Confirmed lifecycle state. */
  readonly status: "confirmed";
  /** Selected configured company series. */
  readonly seriesId: string;
  /** Human-readable number copied to the confirmed invoice. */
  readonly displayNumber: string;
  /** Sequence value from the configured series. */
  readonly number: number;
  /** Whether this is the exact durable result of an earlier matching request. */
  readonly replayed: boolean;
  /** Fiscal document finalized with the assigned series number. */
  readonly fiscalDocument: FiscalDocument;
  /** Immutable IVA fact committed with the commercial and fiscal documents. */
  readonly taxFact: TaxReportingFact;
}

/** Port that owns the cross-capability transaction for commercial confirmation and company series allocation. */
export interface SalesInvoiceDocumentSeriesIssuanceRepository {
  /**
   * Confirms the draft and persists its series allocation in one transaction.
   * @param command - Validated caller intent and all confirmation choices.
   * @returns Durable issuance evidence or an exact idempotent replay.
   * @throws {SalesFailure} When access, selection, stock, credit, concurrency, or persistence rejects the issuance.
   */
  issue(
    command: IssueSalesInvoiceWithDocumentSeriesCommand,
    fact: TaxReportingFact,
  ): Promise<IssuedSalesInvoiceWithDocumentSeries>;
}

/** Application service that validates the portable issuance intent before it reaches a transaction adapter. */
export class IssueSalesInvoiceWithDocumentSeries {
  /**
   * @param repository - Transactional persistence and authorization boundary.
   * @returns An issuance application service.
   */
  constructor(
    private readonly repository: SalesInvoiceDocumentSeriesIssuanceRepository,
  ) {}

  /**
   * Assigns a series number and confirms one draft atomically through the repository.
   * @param command - Authenticated scope, draft, selected series policy, and confirmation choices.
   * @returns The confirmed invoice allocation, including an idempotent replay indication.
   * @throws {SalesFailure} When input is malformed or the durable transaction rejects it.
   */
  issue(
    command: IssueSalesInvoiceWithDocumentSeriesCommand,
  ): Promise<IssuedSalesInvoiceWithDocumentSeries> {
    const normalized = normalize(command);
    let fact: TaxReportingFact;
    try {
      fact = fiscalDocumentTaxFactForSalesSeriesIssue(
        normalized.fiscalDocumentDraft,
        normalized.taxScope,
        normalized.factMetadata,
        normalized.fiscalIssueDate,
      );
    } catch (cause) {
      if (!(cause instanceof TaxReportingFailure)) throw cause;
      throw new SalesFailure("SALES_FISCAL_PREPARATION_INVALID", "Sales VAT evidence could not be prepared for atomic issuance.", { cause });
    }
    return this.repository.issue(normalized, fact);
  }
}

function normalize(
  command: IssueSalesInvoiceWithDocumentSeriesCommand,
): IssueSalesInvoiceWithDocumentSeriesCommand {
  identifier(command.actorUserId);
  identifier(command.organizationId);
  identifier(command.companyId);
  identifier(command.invoiceId);
  identifier(command.sourceUpdatedAt);
  if (typeof command.allowNegativeStock !== "boolean") throw invalid();
  if (!isUuid(command.actorUserId)) throw invalid();
  const taxScope = command.taxScope as unknown;
  if (!taxScope || typeof taxScope !== "object" || !("tenantId" in taxScope) || !("organizationId" in taxScope) || !("companyId" in taxScope)
    || !isUuid(taxScope.tenantId) || taxScope.organizationId !== command.organizationId || taxScope.companyId !== command.companyId) throw invalid();
  if (command.fiscalDocumentDraft.companyId !== command.companyId || command.fiscalDocumentDraft.status !== "draft"
    || command.fiscalDocumentDraft.direction !== "issued" || command.fiscalDocumentDraft.type !== "invoice"
    || command.fiscalDocumentDraft.number !== null || command.fiscalDocumentDraft.issuedAt !== null) throw invalid();
  try {
    fiscalInstant(command.sourceUpdatedAt);
    fiscalDate(command.fiscalIssueDate);
    fiscalInstant(command.issuedAt);
  } catch (cause) {
    throw new SalesFailure("SALES_DOCUMENT_SERIES_INVALID", "Fiscal invoice source version or issue time is invalid.", { cause });
  }
  if (command.factMetadata.recordedAt !== command.issuedAt) throw invalid();
  const idempotencyKey = issuanceKey(command.idempotencyKey);
  if (command.priceListId != null) identifier(command.priceListId);
  if (command.branchId != null) identifier(command.branchId);
  if (command.deviceId != null) identifier(command.deviceId);
  if (command.salesRegisterId != null) identifier(command.salesRegisterId);
  if (command.companyBranchId != null && !isUuid(command.companyBranchId)) throw invalid();
  if (command.salesRegisterId != null && command.companyBranchId != null) throw invalid();

  const scope = command.documentSeriesScope as unknown;
  if (
    !scope ||
    typeof scope !== "object" ||
    !("organizationId" in scope) ||
    !("companyId" in scope) ||
    !("kind" in scope) ||
    scope.organizationId !== command.organizationId ||
    scope.companyId !== command.companyId ||
    (scope.kind !== "company" && scope.kind !== "branch")
  ) {
    throw documentSeriesInvalid();
  }
  if (scope.kind === "branch") {
    if (!("branchId" in scope) || !isUuid(scope.branchId) || command.companyBranchId !== scope.branchId) {
      throw documentSeriesInvalid();
    }
  } else if ("branchId" in scope) {
    throw documentSeriesInvalid();
  }

  const selection = command.documentSeriesSelection as unknown;
  if (!selection || typeof selection !== "object" || !("kind" in selection)) {
    throw documentSeriesInvalid();
  }
  let normalizedSelection: CompanyDocumentSeriesSelection;
  if (selection.kind === "explicit") {
    if (!("seriesId" in selection) || !isUuid(selection.seriesId)) throw documentSeriesInvalid();
    normalizedSelection = Object.freeze({ kind: "explicit", seriesId: selection.seriesId.trim() });
  } else if (selection.kind === "policy") {
    normalizedSelection = Object.freeze({ kind: "policy" });
  } else {
    throw documentSeriesInvalid();
  }

  return Object.freeze({
    ...command,
    invoiceId: command.invoiceId.trim(),
    idempotencyKey,
    priceListId: command.priceListId?.trim() || null,
    branchId: command.branchId?.trim() || null,
    deviceId: command.deviceId?.trim() || null,
    companyBranchId: command.companyBranchId?.trim() || null,
    salesRegisterId: command.salesRegisterId?.trim() || null,
    taxScope: Object.freeze({ ...taxScope }) as TaxReportingScope,
    fiscalIssueDate: command.fiscalIssueDate.trim(),
    issuedAt: command.issuedAt.trim(),
    factMetadata: Object.freeze({ ...command.factMetadata }),
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
  if (typeof value !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

function invalid(): SalesFailure {
  return new SalesFailure("SALES_DOCUMENT_SERIES_INVALID", "Sales invoice issuance command is invalid.");
}

function documentSeriesInvalid(): SalesFailure {
  return new SalesFailure("SALES_DOCUMENT_SERIES_SELECTION_INVALID", "Sales document-series selection is invalid.");
}
