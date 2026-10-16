import type { OrganizationId, UserId } from "@kontave/organizations/domain";
import type { CompanyId } from "./index";
import { CompanyFailure } from "./index";

/** Immutable administrative identity of a branch belonging to one company. */
export interface CompanyBranch {
  readonly id: string;
  readonly tenantId: string;
  readonly organizationId: OrganizationId;
  readonly companyId: CompanyId;
  readonly code: string;
  readonly name: string;
  readonly createdBy: UserId;
  readonly createdAt: string;
}

/** User's current branch choice in one organization and company workspace. */
export interface CompanyBranchSelection {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly companyId: CompanyId;
  readonly branchId: string | null;
  readonly version: number;
  readonly updatedAt: string | null;
}

/** Effective or revoked access for one organization member at one branch. */
export interface CompanyBranchMembership {
  readonly organizationId: OrganizationId;
  readonly companyId: CompanyId;
  readonly branchId: string;
  readonly userId: UserId;
  readonly status: "active" | "revoked";
  readonly version: number;
  readonly changedBy: UserId;
  readonly updatedAt: string;
}

/**
 * Validates and freezes an authoritative branch membership snapshot.
 * @param value - Snapshot returned by an authorized repository operation.
 * @returns An immutable membership with validated branch and user identities.
 * @throws {CompanyFailure} When identity, state, revision, or timestamp data is malformed.
 */
export function companyBranchMembership(value: CompanyBranchMembership): CompanyBranchMembership {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(value.organizationId) || !uuid.test(value.branchId) || !uuid.test(value.userId) || !uuid.test(value.changedBy)
    || !value.organizationId || !value.companyId || !["active", "revoked"].includes(value.status)
    || !Number.isSafeInteger(value.version) || value.version < 1 || Number.isNaN(Date.parse(value.updatedAt))) {
    throw new CompanyFailure("COMPANY_BRANCH_MEMBERSHIP_INVALID", "Branch membership data is invalid.");
  }
  return Object.freeze({ ...value });
}

/**
 * Validates an immutable user branch choice and its concurrency metadata.
 * @param value - Candidate selection returned by an adapter.
 * @returns A frozen selection snapshot.
 * @throws {CompanyFailure} When scope, branch identity, revision or timestamp is invalid.
 */
export function companyBranchSelection(value: CompanyBranchSelection): CompanyBranchSelection {
  if (!value.actorUserId || !value.organizationId || !value.companyId || !Number.isSafeInteger(value.version) || value.version < 0) {
    throw new CompanyFailure("COMPANY_BRANCH_SELECTION_INVALID", "Branch selection data is invalid.");
  }
  if (value.branchId !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.branchId)) {
    throw new CompanyFailure("COMPANY_BRANCH_SELECTION_INVALID", "Selected branch identifier is invalid.");
  }
  if ((value.version === 0) !== (value.updatedAt === null) || (value.updatedAt !== null && Number.isNaN(Date.parse(value.updatedAt)))) {
    throw new CompanyFailure("COMPANY_BRANCH_SELECTION_INVALID", "Branch selection revision metadata is invalid.");
  }
  return Object.freeze({ ...value });
}

/**
 * Normalizes the stable code used to identify a branch within its company.
 * @param value - Code supplied by an administrative caller.
 * @returns An uppercase code containing only supported identifier characters.
 * @throws {CompanyFailure} When the code is empty, too long, or malformed.
 */
export function branchCode(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._-]{0,31}$/.test(normalized)) {
    throw new CompanyFailure("COMPANY_BRANCH_INVALID", "The branch code must contain 1–32 letters, digits, dots, underscores, or hyphens.");
  }
  return normalized;
}

/**
 * Validates the human-readable name displayed for a branch.
 * @param value - Name supplied by an administrative caller.
 * @returns A trimmed name with repeated whitespace collapsed.
 * @throws {CompanyFailure} When the name is empty or longer than 120 characters.
 */
export function branchName(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > 120) {
    throw new CompanyFailure("COMPANY_BRANCH_INVALID", "The branch name must contain 1–120 characters.");
  }
  return normalized;
}
