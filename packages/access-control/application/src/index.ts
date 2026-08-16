import { AccessControlFailure, ActiveAccessPolicy, AuthorizationDenied, AuthorizationReason, RequiredPermissionPolicy, type PermissionCode, SameOrganizationPolicy, type AuthorizationDecision, type AuthorizationRequest, type AuthorizationSnapshot, type PermissionDefinition, type Policy, type Role, type RoleId } from "@kontave/access-control-domain";

export interface AccessControlRepository { findSnapshot(userId: string, organizationId: string): Promise<AuthorizationSnapshot | null> }
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

/** Administrative writes stay behind a port so domain rules do not depend on SQL. */
export interface AccessControlAdministration {
  listPermissions(): Promise<readonly PermissionDefinition[]>;
  listRoles(organizationId: string): Promise<readonly Role[]>;
  findRole(roleId: RoleId): Promise<Role | null>;
  countActiveMemberships(roleId: RoleId): Promise<number>;
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
export class UpdateOrganizationRole {
  constructor(private readonly administration: AccessControlAdministration) {}
  async execute(input:{actor:AuthorizationSnapshot;organizationId:string;roleId:RoleId;name?:string;description?:string;permissions?:readonly PermissionCode[];expectedVersion:number}){
    const target=await this.administration.findRole(input.roleId); if(!target)throw new AccessControlFailure("ROLE_NOT_FOUND","Role not found."); target.assertBelongsTo(input.organizationId);target.assertMutable();
    if(input.permissions?.some(permission=>!input.actor.role.hasPermission(permission)))throw new AccessControlFailure("CANNOT_GRANT_UNOWNED_PERMISSION","An actor cannot grant a permission they do not possess.");
    return this.administration.updateRole({roleId:input.roleId,expectedVersion:input.expectedVersion,...(input.name===undefined?{}:{name:input.name.trim()}),...(input.description===undefined?{}:{description:input.description.trim()}),...(input.permissions===undefined?{}:{permissions:[...new Set(input.permissions)]})});
  }
}
export class ArchiveOrganizationRole { constructor(private readonly administration:AccessControlAdministration){} async execute(input:{organizationId:string;roleId:RoleId;expectedVersion:number}){const target=await this.administration.findRole(input.roleId);if(!target)throw new AccessControlFailure("ROLE_NOT_FOUND","Role not found.");target.assertBelongsTo(input.organizationId);target.assertMutable();if(await this.administration.countActiveMemberships(input.roleId))throw new AccessControlFailure("ROLE_IN_USE","A role in use cannot be archived.");return this.administration.archiveRoleVersioned(input.roleId,input.expectedVersion);} }
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
export class ReplaceRolePermissions {
  constructor(private readonly administration: AccessControlAdministration) {}
  async execute(input: { actor: AuthorizationSnapshot; organizationId: string; roleId: RoleId; permissions: readonly PermissionCode[] }) {
    const target = await this.administration.findRole(input.roleId);
    if (!target) throw new AccessControlFailure("ROLE_OUTSIDE_ORGANIZATION", "The role belongs to another organization.");
    target.assertBelongsTo(input.organizationId);
    target.assertMutable();
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
    if (await this.administration.countActiveMemberships(input.roleId)) throw new AccessControlFailure("ROLE_IN_USE", "A role in use cannot be archived.");
    await this.administration.archiveRole(input.roleId);
  }
}
