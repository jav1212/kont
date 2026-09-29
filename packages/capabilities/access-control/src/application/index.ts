import { AccessControlFailure, ActiveAccessPolicy, AuthorizationDenied, AuthorizationReason, permissionCode, RequiredPermissionPolicy, requiredBusinessOperationPermission, requiredScopedTargetKind, ScopedAccessTargetKind, type BusinessAuthorizationOperation, type PermissionCode, type ScopedAccessTarget, SameOrganizationPolicy, type AuthorizationDecision, type AuthorizationRequest, type AuthorizationSnapshot, type PermissionDefinition, type Policy, type Role, type RoleId } from "../domain";

export interface AccessControlRepository {
  /** @param userId Actor whose memberships are read. @param organizationId Organization to inspect. @returns The current authorization snapshot, if one exists. */
  findSnapshot(userId: string, organizationId: string): Promise<AuthorizationSnapshot | null>;
  /** @param userId Actor whose memberships are read. @param organizationIds Organizations to inspect in one repository operation. @returns Snapshots keyed by organization identifier. */
  findSnapshots(userId: string, organizationIds: readonly string[]): Promise<ReadonlyMap<string, AuthorizationSnapshot>>;
}
export interface AuthorizationAudit { record(request: AuthorizationRequest, decision: AuthorizationDecision, snapshot: AuthorizationSnapshot | null): Promise<void> }
export class EvaluateAuthorization {
  private readonly policies: readonly Policy[];
  constructor(private readonly repository: AccessControlRepository, private readonly audit: AuthorizationAudit, policies?: readonly Policy[]) {
    this.policies = policies ?? [new SameOrganizationPolicy(), new ActiveAccessPolicy(), new RequiredPermissionPolicy()];
  }
  async execute(request: AuthorizationRequest): Promise<AuthorizationDecision> {
    const snapshot = await this.repository.findSnapshot(request.actor.userId, request.actor.organizationId);
    let decision: AuthorizationDecision;
    if (!snapshot) decision = { allowed: false, reason: AuthorizationReason.MembershipInactive };
    else {
      decision = { allowed: false, reason: AuthorizationReason.PolicyDenied };
      for (const policy of this.policies) {
        const result = policy.evaluate(request, snapshot);
        if (result) { decision = result; break; }
      }
    }
    await this.audit.record(request, decision, snapshot);
    return decision;
  }
}
export class RequireAuthorization {
  constructor(private readonly evaluate: EvaluateAuthorization) {}
  async execute(request: AuthorizationRequest): Promise<AuthorizationDecision> {
    const decision = await this.evaluate.execute(request);
    if (!decision.allowed) throw new AuthorizationDenied(decision);
    return decision;
  }
}

/** Per-membership allow-list boundary for a specific module, report, toolbar action, or price list. */
export interface ScopedAccessGrantReader {
  /**
   * Determines whether a membership has an explicit grant for exactly one target.
   * An absent grant denies access; adapters must not treat unrecognized targets as allowed.
   * @param input - Actor scope, required role permission, and requested target.
   * @returns Whether the target has an explicit allow-list entry.
   */
  hasGrant(input: { readonly actor: AuthorizationRequest["actor"]; readonly permission: PermissionCode; readonly target: ScopedAccessTarget; readonly resource: AuthorizationRequest["resource"] }): Promise<boolean>;
}

/** Administrative boundary for assigning and revoking exact per-membership target grants. */
export interface ScopedAccessGrantMutation {
  /** Authenticated administrator whose authority is checked against the requested grant. */
  readonly administrator: AuthorizationRequest["actor"];
  /** Membership receiving or losing the exact target grant. */
  readonly membershipId: string;
  /** Permission represented by the exact target grant. */
  readonly permission: PermissionCode;
  /** Target being allow-listed. */
  readonly target: ScopedAccessTarget;
  /** Organization and optional company scope. */
  readonly resource?: AuthorizationRequest["resource"];
}

/** Writes target grants while keeping the administrator distinct from the subject membership. */
export interface ScopedAccessGrantWriter extends ScopedAccessGrantReader {
  /** Assigns an exact target grant after the adapter verifies roles.manage and the administrator's own permission. */
  grant(input: ScopedAccessGrantMutation): Promise<void>;
  /** Removes an exact target grant after the adapter verifies roles.manage. */
  revoke(input: ScopedAccessGrantMutation): Promise<void>;
}

/** Validates application commands before persisting per-membership target grants. */
export class ManageScopedAccessGrant {
  /**
   * @param grants - Trusted persistence adapter that also enforces administrator authority.
   */
  constructor(private readonly grants: ScopedAccessGrantWriter) {}

  /**
   * Grants or revokes one exact target under an optional company scope.
   * Database RPCs verify `roles.manage`, the administrator's permission, target membership,
   * and company ownership before changing state.
   * @param command - Administrator, membership, permission, target, company scope, and action.
   * @returns Nothing after the authoritative mutation succeeds.
   * @throws {AccessControlFailure} When the command is malformed or persistence is unavailable.
   * @throws {AuthorizationDenied} When the administrator lacks authority or scope.
   */
  async execute(command: {
    readonly administrator: AuthorizationRequest["actor"];
    readonly membershipId: string;
    readonly permission: string;
    readonly target: { readonly kind: string; readonly id: string };
    readonly resource?: AuthorizationRequest["resource"];
    readonly action: "grant" | "revoke";
  }): Promise<void> {
    const targetKinds = Object.values(ScopedAccessTargetKind) as string[];
    if (!command || !command.administrator || !command.target || typeof command.target.id !== "string" || typeof command.target.kind !== "string"
      || typeof command.membershipId !== "string" || typeof command.permission !== "string"
      || !command.administrator.userId || !command.administrator.organizationId) {
      throw new AccessControlFailure("SCOPED_GRANT_INVALID", "Scoped access grant is invalid.");
    }
    let permission: PermissionCode;
    try { permission = permissionCode(command.permission); }
    catch { throw new AccessControlFailure("SCOPED_GRANT_INVALID", "Scoped access grant is invalid."); }
    const targetId = command.target.id.trim();
    if (!command.membershipId.trim() || command.membershipId.length > 128
      || !targetKinds.includes(command.target.kind)
      || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(targetId)
      || (command.action !== "grant" && command.action !== "revoke")
      || (command.resource !== undefined && command.resource.organizationId !== command.administrator.organizationId)) {
      throw new AccessControlFailure("SCOPED_GRANT_INVALID", "Scoped access grant is invalid.");
    }
    const mutation = {
      administrator: command.administrator,
      membershipId: command.membershipId.trim(),
      permission,
      target: { kind: command.target.kind as ScopedAccessTarget["kind"], id: targetId },
      resource: command.resource,
    };
    try {
      if (command.action === "grant") await this.grants.grant(mutation);
      else await this.grants.revoke(mutation);
    } catch (cause: unknown) {
      if (cause instanceof AuthorizationDenied || cause instanceof AccessControlFailure) throw cause;
      throw new AccessControlFailure("ACCESS_CONTROL_REPOSITORY_UNAVAILABLE", "Scoped access grants are unavailable.");
    }
  }
}

/** Executes a framework-free delegate only after a named business operation is authorized. */
export class ExecuteAuthorizedOperation {
  /** @param authorization Authorization gate for role and optional exact-target grants. */
  constructor(private readonly authorization: RequireBusinessOperationAuthorization) {}
  /**
   * Executes a delegate after authorization succeeds.
   * @param input Authorization request and operation details.
   * @param delegate Side-effecting application command.
   * @returns The delegate result.
   * @throws AuthorizationDenied if the delegate is not permitted; in that case it is never called.
   */
  async execute<T>(input: Omit<AuthorizationRequest, "permission"> & { readonly operation: BusinessAuthorizationOperation; readonly target?: ScopedAccessTarget }, delegate: () => Promise<T>): Promise<T> {
    await this.authorization.execute(input);
    return delegate();
  }
}

/** Enforces a named cross-module commercial decision through the authorization engine. */
export class RequireBusinessOperationAuthorization {
  /** @param requireAuthorization - Decision evaluator backed by active membership and role grants. @param scopedGrants - Explicit individual-resource allow-list reader. */
  constructor(private readonly requireAuthorization: RequireAuthorization, private readonly scopedGrants: ScopedAccessGrantReader, private readonly audit: AuthorizationAudit) {}

  /**
   * Authorizes a commercial exception or UI action before its owning use case executes.
   * @param input - Actor, business operation, resource scope, and request correlation context.
   * @returns The allow decision recorded by the authorization audit.
   * @throws {AuthorizationDenied} When the role lacks the operation's required permission.
   */
  async execute(input: Omit<AuthorizationRequest, "permission"> & { readonly operation: BusinessAuthorizationOperation; readonly target?: ScopedAccessTarget }): Promise<AuthorizationDecision> {
    const { operation, target, ...request } = input;
    const permission = requiredBusinessOperationPermission(operation);
    const decision = await this.requireAuthorization.execute({ ...request, permission });
    const targetKind = requiredScopedTargetKind(operation);
    if (targetKind === null) return decision;
    if (!target || target.kind !== targetKind || !target.id.trim()) {
      return this.denyScoped(request, permission);
    }
    if (!await this.scopedGrants.hasGrant({ actor: request.actor, permission, target, resource: request.resource })) {
      return this.denyScoped(request, permission);
    }
    return decision;
  }

  private async denyScoped(request: Omit<AuthorizationRequest, "permission">, permission: PermissionCode): Promise<never> {
    const decision: AuthorizationDecision = { allowed: false, reason: AuthorizationReason.PolicyDenied, matchedPolicy: "scoped-access-grant", policyVersion: "1" };
    await this.audit.record({ ...request, permission }, decision, null);
    throw new AuthorizationDenied(decision);
  }
}

/** Administrative writes stay behind a port so domain rules do not depend on SQL. */
export interface AccessControlAdministration {
  listPermissions(): Promise<readonly PermissionDefinition[]>;
  listRoles(organizationId: string): Promise<readonly Role[]>;
  findRole(roleId: RoleId): Promise<Role | null>;
  countActiveMemberships(roleId: RoleId): Promise<number>;
  /** Counts every membership associated with a role, including suspended memberships. */
  countAssociatedMemberships(roleId: RoleId): Promise<number>;
  assignRole(membershipId: string, roleId: RoleId): Promise<void>;
  replacePermissions(roleId: RoleId, permissions: readonly PermissionCode[]): Promise<void>;
  archiveRole(roleId: RoleId): Promise<void>;
  createRole(input: { readonly organizationId: string; readonly name: string; readonly description: string; readonly permissions: readonly PermissionCode[]; readonly idempotencyKey: string }): Promise<Role>;
  updateRole(input: { readonly roleId: RoleId; readonly name?: string; readonly description?: string; readonly permissions?: readonly PermissionCode[]; readonly expectedVersion: number }): Promise<Role>;
  archiveRoleVersioned(roleId: RoleId, expectedVersion: number): Promise<Role>;
}
export class ListPermissions { constructor(private readonly administration: AccessControlAdministration) {} execute() { return this.administration.listPermissions(); } }
export class ListOrganizationRoles { constructor(private readonly administration: AccessControlAdministration) {} execute(organizationId: string) { return this.administration.listRoles(organizationId); } }
export class CreateOrganizationRole {
  constructor(private readonly administration: AccessControlAdministration) {}
  async execute(input: { actor: AuthorizationSnapshot; organizationId: string; name: string; description?: string; permissions: readonly PermissionCode[]; idempotencyKey: string }) {
    const name=input.name.trim(), description=input.description?.trim()??"";
    if(name.length<1||name.length>80||description.length>300||!input.idempotencyKey.trim()) throw new AccessControlFailure("ROLE_INVALID","Role data is invalid.");
    if(input.permissions.some(permission=>!input.actor.role.hasPermission(permission))) throw new AccessControlFailure("CANNOT_GRANT_UNOWNED_PERMISSION","An actor cannot grant a permission they do not possess.");
    return this.administration.createRole({organizationId:input.organizationId,name,description,permissions:[...new Set(input.permissions)],idempotencyKey:input.idempotencyKey});
  }
}
/** Updates role permissions while preserving system-role identity metadata. */
export class UpdateOrganizationRole {
  /**
   * Connects role-policy validation to versioned persistence.
   * @param administration - Organization role repository used for reads and atomic writes.
   * @returns A role-update use case.
   */
  constructor(private readonly administration: AccessControlAdministration) {}

  /**
   * Changes an organization's role after its request boundary authorizes roles.manage.
   * System roles retain their metadata; owner and global templates remain protected.
   * The repository atomically checks the version and invalidates affected authorization snapshots.
   * @param input - Authorized actor, organization, target role, expected version, and requested changes.
   * @returns The persisted role with its current permissions and new version.
   * @throws {AccessControlFailure} If the role is missing, outside the organization, protected,
   * the actor does not own a requested grant, or the persisted version has changed.
   */
  async execute(input: {
    actor: AuthorizationSnapshot;
    organizationId: string;
    roleId: RoleId;
    name?: string;
    description?: string;
    permissions?: readonly PermissionCode[];
    expectedVersion: number;
  }): Promise<Role> {
    const target = await this.administration.findRole(input.roleId);
    if (!target) throw new AccessControlFailure("ROLE_NOT_FOUND", "Role not found.");
    target.assertBelongsTo(input.organizationId);
    target.assertPermissionsMutable();
    if (input.name !== undefined || input.description !== undefined) target.assertMutable();
    if (input.permissions?.some((permission) => !input.actor.role.hasPermission(permission))) {
      throw new AccessControlFailure("CANNOT_GRANT_UNOWNED_PERMISSION", "An actor cannot grant a permission they do not possess.");
    }
    return this.administration.updateRole({
      roleId: input.roleId,
      expectedVersion: input.expectedVersion,
      ...(input.name === undefined ? {} : { name: input.name.trim() }),
      ...(input.description === undefined ? {} : { description: input.description.trim() }),
      ...(input.permissions === undefined ? {} : { permissions: [...new Set(input.permissions)] }),
    });
  }
}
export class ArchiveOrganizationRole { constructor(private readonly administration:AccessControlAdministration){} async execute(input:{organizationId:string;roleId:RoleId;expectedVersion:number}){const target=await this.administration.findRole(input.roleId);if(!target)throw new AccessControlFailure("ROLE_NOT_FOUND","Role not found.");target.assertBelongsTo(input.organizationId);target.assertMutable();if(await this.administration.countAssociatedMemberships(input.roleId))throw new AccessControlFailure("ROLE_IN_USE","A role associated with a user cannot be archived.");return this.administration.archiveRoleVersioned(input.roleId,input.expectedVersion);} }
export class AssignMembershipRole {
  constructor(private readonly administration: AccessControlAdministration) {}
  async execute(input: { actor: AuthorizationSnapshot; membershipId: string; organizationId: string; roleId: RoleId }) {
    const target = await this.administration.findRole(input.roleId);
    if (!target) throw new AccessControlFailure("ROLE_OUTSIDE_ORGANIZATION", "The role belongs to another organization.");
    target.assertBelongsTo(input.organizationId);
    target.assertAssignableBy(input.actor.role);
    await this.administration.assignRole(input.membershipId, input.roleId);
  }
}
/** Replaces grants through the legacy administration port while enforcing role policy. */
export class ReplaceRolePermissions {
  /**
   * Connects the legacy replacement command to organization role persistence.
   * @param administration - Repository that reads roles and atomically replaces permission grants.
   * @returns A permission-replacement use case.
   */
  constructor(private readonly administration: AccessControlAdministration) {}

  /**
   * Replaces grants after the caller authorizes role management for this organization.
   * This legacy command does not compare versions; interactive editors should use UpdateOrganizationRole.
   * @param input - Authorized actor, target organization and role, and complete desired grant set.
   * @returns Nothing after the replacement and authorization-version invalidation complete.
   * @throws {AccessControlFailure} If the target is outside the organization, protected,
   * or the actor does not possess every requested permission.
   */
  async execute(input: { actor: AuthorizationSnapshot; organizationId: string; roleId: RoleId; permissions: readonly PermissionCode[] }): Promise<void> {
    const target = await this.administration.findRole(input.roleId);
    if (!target) throw new AccessControlFailure("ROLE_OUTSIDE_ORGANIZATION", "The role belongs to another organization.");
    target.assertBelongsTo(input.organizationId);
    target.assertPermissionsMutable();
    if (input.permissions.some((permission) => !input.actor.role.hasPermission(permission))) throw new AccessControlFailure("CANNOT_GRANT_UNOWNED_PERMISSION", "An actor cannot grant a permission they do not possess.");
    await this.administration.replacePermissions(input.roleId, [...new Set(input.permissions)]);
  }
}
export class ArchiveRole {
  constructor(private readonly administration: AccessControlAdministration) {}
  async execute(input: { organizationId: string; roleId: RoleId }) {
    const target = await this.administration.findRole(input.roleId);
    if (!target) throw new AccessControlFailure("ROLE_OUTSIDE_ORGANIZATION", "The role belongs to another organization.");
    target.assertBelongsTo(input.organizationId);
    target.assertMutable();
    if (await this.administration.countAssociatedMemberships(input.roleId)) throw new AccessControlFailure("ROLE_IN_USE", "A role associated with a user cannot be archived.");
    await this.administration.archiveRole(input.roleId);
  }
}
