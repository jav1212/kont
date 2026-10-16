import { CompanyFailure, type CompanyBranchConnectivityScope, type CompanyBranchConnectivity, type CompanyBranchHeartbeat, type RecordCompanyBranchHeartbeatCommand } from "../domain";
import { companyBranchClientInstanceId, companyBranchConnectivity } from "../domain";

/** Read request for connectivity snapshots in one company. */
export type ListCompanyBranchConnectivityQuery = CompanyBranchConnectivityScope;

/** Persistence port for server-authorized branch heartbeat and status reads. */
export interface CompanyBranchConnectivityRepository {
  /** Records a server-timestamped heartbeat for one assigned client instance. @param command - Authenticated user, company, branch and stable client instance. @returns Server acknowledgement. @throws {CompanyFailure} If membership, permission, scope or persistence is invalid. */
  recordHeartbeat(command: RecordCompanyBranchHeartbeatCommand): Promise<CompanyBranchHeartbeat>;
  /** Lists branch-level online status without exposing individual users or devices. @param query - Authenticated company scope. @returns Every visible branch with aggregate fresh-client presence. @throws {CompanyFailure} If branch read access or persistence fails. */
  listStatuses(query: ListCompanyBranchConnectivityQuery): Promise<readonly CompanyBranchConnectivity[]>;
}

/** Records client presence only while its authenticated user may connect to that branch. */
export class RecordCompanyBranchHeartbeat {
  /** @param repository - Trusted branch connectivity persistence port. @returns Use case. */
  constructor(private readonly repository: CompanyBranchConnectivityRepository) {}

  /** @param command - Authenticated user, organization, company, branch and UUID client instance. @returns Server-timestamped acknowledgement. @throws {CompanyFailure} If scope or client identity is invalid, access is denied, or persistence fails. */
  execute(command: RecordCompanyBranchHeartbeatCommand): Promise<CompanyBranchHeartbeat> {
    const branchId = uuid(command.branchId);
    const clientInstanceId = companyBranchClientInstanceId(command.clientInstanceId);
    if (!command.actorUserId || !command.organizationId || !command.companyId) {
      throw new CompanyFailure("COMPANY_BRANCH_CONNECTIVITY_INVALID", "Branch heartbeat scope is invalid.");
    }
    return this.repository.recordHeartbeat({ ...command, branchId, clientInstanceId });
  }
}

/** Reads the authorized branch-level connectivity view. */
export class ListCompanyBranchConnectivity {
  /** @param repository - Trusted branch connectivity persistence port. @returns Use case. */
  constructor(private readonly repository: CompanyBranchConnectivityRepository) {}

  /** @param query - Authenticated actor and company scope. @returns Immutable status snapshots. @throws {CompanyFailure} When scope, permission or persistence is invalid. */
  async execute(query: ListCompanyBranchConnectivityQuery): Promise<readonly CompanyBranchConnectivity[]> {
    if (!query.actorUserId || !query.organizationId || !query.companyId) {
      throw new CompanyFailure("COMPANY_BRANCH_CONNECTIVITY_INVALID", "Branch connectivity scope is invalid.");
    }
    const rows = await this.repository.listStatuses(query);
    const ids = new Set<string>();
    const result = rows.map((row) => {
      const status = companyBranchConnectivity(row);
      if (ids.has(status.branchId)) throw new CompanyFailure("COMPANY_BRANCH_CONNECTIVITY_INVALID", "Branch connectivity response contains duplicates.");
      ids.add(status.branchId);
      return status;
    });
    return Object.freeze(result);
  }
}

/**
 * Creates branch online-presence operations over one repository.
 * @param repository - Authorized persistence port.
 * @returns Heartbeat and list use cases.
 * @throws {CompanyFailure} When a required dependency is unavailable.
 */
export function companyBranchConnectivityActions(repository: CompanyBranchConnectivityRepository): {
  readonly heartbeat: RecordCompanyBranchHeartbeat;
  readonly list: ListCompanyBranchConnectivity;
} {
  return Object.freeze({ heartbeat: new RecordCompanyBranchHeartbeat(repository), list: new ListCompanyBranchConnectivity(repository) });
}

function uuid(value: string): string {
  const normalized = value.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new CompanyFailure("COMPANY_BRANCH_CONNECTIVITY_INVALID", "Branch identifier must be a UUID.");
  }
  return normalized.toLowerCase();
}
