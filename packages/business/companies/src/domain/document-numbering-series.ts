import type { OrganizationId } from "@kontave/organizations/domain";
import type { CompanyId } from "./index";
import { CompanyFailure } from "./index";

/** Commercial document families understood by the portable numbering capability. */
export type CompanyDocumentType =
  | "sales_invoice"
  | "sales_delivery_note"
  | "sales_credit_note"
  | "sales_debit_note"
  | "purchase_invoice"
  | "purchase_credit_note"
  | "purchase_debit_note";

/** Scope shared by every branch of a company. */
export interface CompanyWideDocumentSeriesScope {
  readonly kind: "company";
  readonly organizationId: OrganizationId;
  readonly companyId: CompanyId;
}
/** Scope restricted to one company branch. */
export interface BranchDocumentSeriesScope {
  readonly kind: "branch";
  readonly organizationId: OrganizationId;
  readonly companyId: CompanyId;
  readonly branchId: string;
}
/** Explicit operational boundary that isolates a document-numbering series. */
export type CompanyDocumentSeriesScope = CompanyWideDocumentSeriesScope | BranchDocumentSeriesScope;
/** Stable behavior for choosing a series when issuing a document. */
export type CompanyDocumentSeriesSelectionPolicy =
  | "company_default"
  | "branch_default"
  | "explicit_series_required";

/** Immutable configuration snapshot for a selectable document-numbering series. */
export interface CompanyDocumentNumberingSeries {
  readonly id: string;
  readonly scope: CompanyDocumentSeriesScope;
  readonly documentType: CompanyDocumentType;
  readonly code: string;
  readonly prefix: string | null;
  readonly nextNumber: number;
  readonly maximumNumber: number;
  readonly active: boolean;
  readonly version: number;
}
/** Versioned selection rule for one document type within one scope. */
export interface CompanyDocumentSeriesSelectionRule {
  readonly scope: CompanyDocumentSeriesScope;
  readonly documentType: CompanyDocumentType;
  readonly policy: CompanyDocumentSeriesSelectionPolicy;
  readonly defaultSeriesId: string | null;
  readonly version: number;
}

/** @param value - Untrusted document type. @returns Validated type. @throws {CompanyFailure} When unsupported. */
export function companyDocumentType(value: unknown): CompanyDocumentType {
  if (value === "sales_invoice" || value === "sales_delivery_note" || value === "sales_credit_note" || value === "sales_debit_note" || value === "purchase_invoice" || value === "purchase_credit_note" || value === "purchase_debit_note") return value;
  throw new CompanyFailure("COMPANY_DOCUMENT_SERIES_INVALID", "The document type is invalid.");
}
/** @param value - Requested company or branch scope. @returns Validated immutable scope. @throws {CompanyFailure} When scope data is malformed. */
export function companyDocumentSeriesScope(value: unknown): CompanyDocumentSeriesScope {
  if (!value || typeof value !== "object") {
    throw new CompanyFailure("COMPANY_DOCUMENT_SERIES_INVALID", "The document series scope is invalid.");
  }
  const candidate = value as Partial<CompanyDocumentSeriesScope>;
  if (candidate.kind === "company" && candidate.organizationId && candidate.companyId) {
    return Object.freeze({ kind: "company", organizationId: candidate.organizationId, companyId: candidate.companyId });
  }
  if (candidate.kind === "branch" && candidate.organizationId && candidate.companyId && typeof candidate.branchId === "string" && isUuid(candidate.branchId.trim())) {
    return Object.freeze({ kind: "branch", organizationId: candidate.organizationId, companyId: candidate.companyId, branchId: candidate.branchId.trim() });
  }
  throw new CompanyFailure("COMPANY_DOCUMENT_SERIES_INVALID", "The document series scope is invalid.");
}
/** @param value - User-managed series code. @returns Canonical uppercase code. @throws {CompanyFailure} When invalid. */
export function companyDocumentSeriesCode(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{0,31}$/.test(normalized)) throw new CompanyFailure("COMPANY_DOCUMENT_SERIES_INVALID", "The document series code is invalid.");
  return normalized;
}
/** @param value - Optional presentation prefix. @returns Validated prefix or null. @throws {CompanyFailure} When invalid. */
export function companyDocumentSeriesPrefix(value: string | null): string | null {
  if (value === null || !value.trim()) return null;
  const normalized = value.trim();
  if (normalized.length > 32 || /[\r\n]/.test(normalized)) throw new CompanyFailure("COMPANY_DOCUMENT_SERIES_INVALID", "The document series prefix is invalid.");
  return normalized;
}
/** @param value - Maximum allocatable sequence. @returns Validated maximum. @throws {CompanyFailure} When outside the portable eight-digit bound. */
export function companyDocumentSeriesMaximum(value: number): number { return documentSeriesNextNumber(value); }

/** Validates the eight-digit maximum supported by persisted company document numbering. @param value - Proposed last allocatable number. @returns Validated positive number. @throws {CompanyFailure} When outside the supported bound. */
export function documentSeriesNextNumber(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 99_999_999) {
    throw new CompanyFailure("COMPANY_DOCUMENT_NUMBER_INVALID", "The next document number is invalid.");
  }
  return value;
}
/** @param scope - Scope receiving the rule. @param policy - Requested selection policy. @param defaultSeriesId - Optional default series UUID. @returns Validated policy fields. @throws {CompanyFailure} When rule fields conflict. */
export function companyDocumentSeriesSelectionPolicy(scope: CompanyDocumentSeriesScope, policy: CompanyDocumentSeriesSelectionPolicy, defaultSeriesId: string | null): { readonly policy: CompanyDocumentSeriesSelectionPolicy; readonly defaultSeriesId: string | null } {
  const normalizedScope = companyDocumentSeriesScope(scope);
  const normalizedId = defaultSeriesId?.trim() || null;
  if (normalizedId !== null && !isUuid(normalizedId)) throw new CompanyFailure("COMPANY_DOCUMENT_SERIES_SELECTION_INVALID", "The default document series identifier is invalid.");
  if (policy === "explicit_series_required" && normalizedId !== null) throw new CompanyFailure("COMPANY_DOCUMENT_SERIES_SELECTION_INVALID", "An explicit-series policy cannot have a default series.");
  if ((policy === "company_default" || policy === "branch_default") && normalizedId === null) throw new CompanyFailure("COMPANY_DOCUMENT_SERIES_SELECTION_INVALID", "A default series policy requires a default series.");
  if (policy === "branch_default" && normalizedScope.kind !== "branch") throw new CompanyFailure("COMPANY_DOCUMENT_SERIES_SELECTION_INVALID", "A branch default requires a branch scope.");
  if (policy !== "company_default" && policy !== "branch_default" && policy !== "explicit_series_required") throw new CompanyFailure("COMPANY_DOCUMENT_SERIES_SELECTION_INVALID", "The document series selection policy is invalid.");
  return { policy, defaultSeriesId: normalizedId };
}
function isUuid(value: string): boolean { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value); }
