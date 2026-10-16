import type { OrganizationId, UserId } from "@kontave/organizations/domain";
import { branchCode, branchName, type CompanyBranch, type CompanyBranchMembership, type CompanyBranchSelection } from "../domain/company-branch";
import type { CompanyId } from "../domain";
import { CompanyFailure } from "../domain";

/** Actor scope required for company-branch operations. */
export interface CompanyBranchScope { readonly actorUserId: UserId; readonly organizationId: OrganizationId; readonly companyId: CompanyId; }
/** Idempotent request to register a company branch. */
export interface CreateCompanyBranchCommand extends CompanyBranchScope { readonly idempotencyKey: string; readonly code: string; readonly name: string; }
/** Read boundary for branches belonging to one company. */
export type ListCompanyBranchesQuery = CompanyBranchScope;
/** Read query for a user's selected branch in one company. */
export type GetCompanyBranchSelectionQuery = CompanyBranchScope;
/** Optimistic command to select a branch or clear the current selection. */
export interface SelectCompanyBranchCommand extends CompanyBranchScope { readonly branchId: string | null; readonly expectedVersion: number; }
/** Scope for reading branch-member assignments in one company. */
export type ListCompanyBranchMembershipsQuery = CompanyBranchScope;
/** Optimistic state transition that associates or revokes one user's branch access. */
export interface SetCompanyBranchMembershipCommand extends CompanyBranchScope { readonly branchId: string; readonly userId: UserId; readonly status: "active" | "revoked"; readonly expectedVersion: number; }

/** Persistence boundary for branch registration and scoped reads. */
export interface CompanyBranchRepository {
  /** Creates or replays a branch registration. @param command - Authorized branch creation intent. @returns Persisted branch. @throws {CompanyFailure} On invalid, duplicate, forbidden, or unavailable operations. */
  createBranch(command: CreateCompanyBranchCommand): Promise<CompanyBranch>;
  /** Lists the branches of one company. @param query - Actor and company scope. @returns Branches ordered by code. @throws {CompanyFailure} When access or persistence fails. */
  listBranches(query: ListCompanyBranchesQuery): Promise<readonly CompanyBranch[]>;
  /** Reads the selected branch for one actor and company. @param query - Actor and company scope. @returns Versioned selection or the empty version-zero state. @throws {CompanyFailure} When access or persistence fails. */
  getSelection(query: GetCompanyBranchSelectionQuery): Promise<CompanyBranchSelection>;
  /** Selects a branch belonging to the scoped company or clears its selection. @param command - Actor, company, branch and expected revision. @returns Authoritative selection. @throws {CompanyFailure} On cross-company selection, denied access, stale revision, or persistence failure. */
  select(command: SelectCompanyBranchCommand): Promise<CompanyBranchSelection>;
  /** Lists current and revoked assignments for the scoped company. @param query - Actor and company scope. @returns Membership history ordered by branch and user. @throws {CompanyFailure} When the actor cannot manage assignments or persistence fails. */
  listMemberships(query: ListCompanyBranchMembershipsQuery): Promise<readonly CompanyBranchMembership[]>;
  /** Associates or revokes one active organization member at one branch. @param command - Scoped subject, branch, requested state and expected revision. @returns Authoritative membership snapshot. @throws {CompanyFailure} When scope, access, subject membership or expected revision is invalid. */
  setMembership(command: SetCompanyBranchMembershipCommand): Promise<CompanyBranchMembership>;
}

/** Registers one company branch through a trusted server composition. */
export class CreateCompanyBranch {
  /** @param repository - Authorized persistence port. @returns Use case. */
  constructor(private readonly repository: CompanyBranchRepository) {}
  /** @param command - Branch details and authenticated scope. @returns The persisted branch. @throws {CompanyFailure} If validation, authorization, or persistence fails. */
  execute(command: CreateCompanyBranchCommand): Promise<CompanyBranch> {
    const idempotencyKey = command.idempotencyKey.trim();
    if (!idempotencyKey || idempotencyKey.length > 128) throw new CompanyFailure("COMPANY_BRANCH_INVALID", "The idempotency key must contain 1–128 characters.");
    return this.repository.createBranch({ ...command, idempotencyKey, code: branchCode(command.code), name: branchName(command.name) });
  }
}

/** Reads a company's registered branches after authorization. */
export class ListCompanyBranches {
  /** @param repository - Authorized persistence port. @returns Use case. */
  constructor(private readonly repository: CompanyBranchRepository) {}
  /** @param query - Authenticated actor and company scope. @returns Branches ordered by code. @throws {CompanyFailure} If access or persistence fails. */
  execute(query: ListCompanyBranchesQuery): Promise<readonly CompanyBranch[]> { return this.repository.listBranches(query); }
}

/** Reads the persisted branch selection for one user and company. */
export class GetCompanyBranchSelection {
  /** @param repository - Authorized branch selection port. @returns Use case. @throws {CompanyFailure} When repository construction is invalid. */
  constructor(private readonly repository: CompanyBranchRepository) {}
  /** @param query - Authenticated actor and company scope. @returns Current selection, including an empty version-zero state. @throws {CompanyFailure} When the actor lacks branch read access. */
  execute(query: GetCompanyBranchSelectionQuery): Promise<CompanyBranchSelection> { return this.repository.getSelection(query); }
}

/** Persists an explicit branch choice or clears it with optimistic concurrency. */
export class SelectCompanyBranch {
  /** @param repository - Authorized branch selection port. @returns Use case. @throws {CompanyFailure} When repository construction is invalid. */
  constructor(private readonly repository: CompanyBranchRepository) {}
  /** @param command - Actor, company scope, target branch and expected revision. @returns Authoritative persisted selection. @throws {CompanyFailure} When branch identity or expected revision is invalid, selection crosses company scope, access is denied, or persistence fails. */
  execute(command: SelectCompanyBranchCommand): Promise<CompanyBranchSelection> {
    if (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion < 0) {
      throw new CompanyFailure("COMPANY_BRANCH_SELECTION_INVALID", "The expected branch selection version is invalid.");
    }
    const branchId = command.branchId?.trim() || null;
    if (branchId !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(branchId)) {
      throw new CompanyFailure("COMPANY_BRANCH_SELECTION_INVALID", "Selected branch identifier is invalid.");
    }
    return this.repository.select({ ...command, branchId });
  }
}

/** Lists user-to-branch assignments under the dedicated administration permission. */
export class ListCompanyBranchMemberships {
  /** @param repository - Authorized branch membership port. @returns Use case. @throws {CompanyFailure} When repository construction is invalid. */
  constructor(private readonly repository: CompanyBranchRepository) {}
  /** @param query - Authenticated actor and company scope. @returns Branch membership snapshots. @throws {CompanyFailure} When the actor lacks assignment administration access. */
  execute(query: ListCompanyBranchMembershipsQuery): Promise<readonly CompanyBranchMembership[]> { return this.repository.listMemberships(query); }
}

/** Adds or revokes a user's access to one company branch. */
export class SetCompanyBranchMembership {
  /** @param repository - Authorized branch membership port. @returns Use case. @throws {CompanyFailure} When repository construction is invalid. */
  constructor(private readonly repository: CompanyBranchRepository) {}
  /** @param command - Actor, target user, branch, desired status and expected membership revision. @returns Persisted membership. @throws {CompanyFailure} When the subject is outside the organization, access is denied, or the expected revision is stale. */
  execute(command: SetCompanyBranchMembershipCommand): Promise<CompanyBranchMembership> {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(command.branchId) || !uuid.test(command.userId)
      || !Number.isSafeInteger(command.expectedVersion) || command.expectedVersion < 0
      || !["active", "revoked"].includes(command.status)) {
      throw new CompanyFailure("COMPANY_BRANCH_MEMBERSHIP_INVALID", "Branch membership input is invalid.");
    }
    return this.repository.setMembership(command);
  }
}

/** Creates all company branch use cases around one trusted persistence port. @param repository - Authorized branch repository. @returns Create/list/read/select operations. @throws {CompanyFailure} When a required dependency is unavailable. */
export function companyBranchActions(repository: CompanyBranchRepository): { readonly create: CreateCompanyBranch; readonly list: ListCompanyBranches; readonly getSelection: GetCompanyBranchSelection; readonly select: SelectCompanyBranch; readonly listMemberships: ListCompanyBranchMemberships; readonly setMembership: SetCompanyBranchMembership } {
  return Object.freeze({ create: new CreateCompanyBranch(repository), list: new ListCompanyBranches(repository), getSelection: new GetCompanyBranchSelection(repository), select: new SelectCompanyBranch(repository), listMemberships: new ListCompanyBranchMemberships(repository), setMembership: new SetCompanyBranchMembership(repository) });
}
