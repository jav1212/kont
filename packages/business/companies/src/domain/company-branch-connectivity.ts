import type { OrganizationId, UserId } from "@kontave/organizations/domain";
import type { CompanyId } from "./index";
import { CompanyFailure } from "./index";

/** Operational presence of one registered branch as observed by the server. */
export interface CompanyBranchConnectivity {
  readonly branchId: string;
  readonly online: boolean;
  readonly connectedClientCount: number;
  readonly lastSeenAt: string | null;
}

/**
 * Validates and freezes an aggregate branch presence snapshot.
 * @param value - Status returned by authorized persistence.
 * @returns Immutable, internally consistent branch connectivity.
 * @throws {CompanyFailure} When branch identity, count, state, or timestamp is malformed.
 */
export function companyBranchConnectivity(value: CompanyBranchConnectivity): CompanyBranchConnectivity {
  if (!isUuid(value.branchId) || typeof value.online !== "boolean"
    || !Number.isSafeInteger(value.connectedClientCount) || value.connectedClientCount < 0
    || (value.lastSeenAt !== null && Number.isNaN(Date.parse(value.lastSeenAt)))
    || value.online !== (value.connectedClientCount > 0)
    || (value.connectedClientCount > 0 && value.lastSeenAt === null)) {
    throw new CompanyFailure("COMPANY_BRANCH_CONNECTIVITY_INVALID", "Branch connectivity data is invalid.");
  }
  return Object.freeze({ ...value });
}

/**
 * Validates the stable identity used to replace one client instance's heartbeat.
 * @param value - Client installation UUID.
 * @returns Canonical lowercase UUID.
 * @throws {CompanyFailure} When the supplied value is not a UUID.
 */
export function companyBranchClientInstanceId(value: string): string {
  if (!isUuid(value)) throw new CompanyFailure("COMPANY_BRANCH_CONNECTIVITY_INVALID", "Client instance identifier must be a UUID.");
  return value.toLowerCase();
}

/** Authenticated scope for reading branch connectivity. */
export interface CompanyBranchConnectivityScope {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly companyId: CompanyId;
}

/** Single-client heartbeat acknowledgement returned by trusted persistence. */
export interface CompanyBranchHeartbeat {
  readonly branchId: string;
  readonly clientInstanceId: string;
  readonly lastSeenAt: string;
}

/**
 * Validates a server-timestamped heartbeat acknowledgement.
 * @param value - Acknowledgement returned by trusted persistence.
 * @returns Immutable acknowledgement with validated identifiers and time.
 * @throws {CompanyFailure} When any returned field is malformed.
 */
export function companyBranchHeartbeat(value: CompanyBranchHeartbeat): CompanyBranchHeartbeat {
  if (!isUuid(value.branchId) || !isUuid(value.clientInstanceId) || Number.isNaN(Date.parse(value.lastSeenAt))) {
    throw new CompanyFailure("COMPANY_BRANCH_CONNECTIVITY_INVALID", "Branch heartbeat data is invalid.");
  }
  return Object.freeze({ ...value });
}

/** Input required to refresh one authorized client's branch presence. */
export interface RecordCompanyBranchHeartbeatCommand extends CompanyBranchConnectivityScope {
  readonly branchId: string;
  readonly clientInstanceId: string;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
