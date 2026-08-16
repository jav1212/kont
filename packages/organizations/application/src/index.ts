import {
  OrganizationFailure,
  hasActiveOrganizationAccess,
  isOrganizationOwner,
  type CompanyId,
  type OrganizationAccess,
  type OrganizationCompany,
  type OrganizationId,
  type UserId,
} from "@kontave/organizations-domain";
import { dynamicNavigationTarget, type NavigationTarget } from "@kontave/navigation-domain";

export interface OrganizationDirectory {
  listAccessForUser(userId: UserId): Promise<readonly OrganizationAccess[]>;
  findAccess(userId: UserId, organizationId: OrganizationId): Promise<OrganizationAccess | null>;
  listCompanies(organizationId: OrganizationId): Promise<readonly OrganizationCompany[]>;
  findCompany(organizationId: OrganizationId, companyId: CompanyId): Promise<OrganizationCompany | null>;
}

export interface OrganizationRepository extends OrganizationDirectory {
  update(organizationId: OrganizationId, changes: { readonly name?: string; readonly logoUrl?: string | null }, expectedVersion: number): Promise<OrganizationAccess["organization"]>;
}

export interface OrganizationLogoStorage {
  upload(organizationId: OrganizationId, logo: { readonly bytes: Uint8Array; readonly contentType: string }): Promise<string>;
  deleteByPublicUrl(organizationId: OrganizationId, publicUrl: string): Promise<void>;
}
export interface OrganizationMembersRepository {
  list(organizationId:OrganizationId):Promise<readonly import("@kontave/organizations-domain").OrganizationMemberProjection[]>;
  invite(input:{organizationId:OrganizationId;actorUserId:UserId;email:string;roleId:string;rawToken:string;tokenHash:string;idempotencyKey:string;expiresAt:string}):Promise<{readonly member:import("@kontave/organizations-domain").OrganizationMemberProjection;readonly created:boolean}>;
  resend(input:{organizationId:OrganizationId;actorUserId:UserId;invitationId:string;rawToken:string;tokenHash:string;expiresAt:string;expectedVersion:number}):Promise<import("@kontave/organizations-domain").OrganizationMemberProjection>;
  revokeInvitation(input:{organizationId:OrganizationId;actorUserId:UserId;invitationId:string;expectedVersion:number}):Promise<void>;
  update(input:{organizationId:OrganizationId;actorUserId:UserId;membershipId:string;roleId?:string;status?:"active"|"suspended";expectedVersion:number}):Promise<import("@kontave/organizations-domain").OrganizationMemberProjection>;
  revoke(input:{organizationId:OrganizationId;actorUserId:UserId;membershipId:string;expectedVersion:number}):Promise<void>;
}
export interface OrganizationInvitationNotifier {
  sendInvitation(input:{readonly email:string;readonly organizationName:string;readonly inviterDisplayName:string;readonly roleName:string;readonly destination:Extract<NavigationTarget,{id:"organization.invitation.accept"}>;readonly expiresAt:string}):Promise<void>;
}
export class ListOrganizationMembers{constructor(private readonly repository:OrganizationMembersRepository){}execute(id:OrganizationId){return this.repository.list(id)}}
export class InviteOrganizationMember{constructor(private readonly repository:OrganizationMembersRepository,private readonly notifier:OrganizationInvitationNotifier){}async execute(input:{organizationId:OrganizationId;actorUserId:UserId;email:string;roleId:string;idempotencyKey:string;expiresAt:string;organizationName:string;inviterDisplayName:string}){const email=input.email.trim().toLowerCase();if(!/^\S+@\S+\.\S+$/.test(email)||!input.idempotencyKey.trim())throw new OrganizationFailure("INVITATION_INVALID","La invitación no es válida.");const rawToken=crypto.randomUUID(),tokenHash=await sha256(rawToken);const result=await this.repository.invite({...input,email,rawToken,tokenHash});if(result.created)await this.notifier.sendInvitation({email,organizationName:input.organizationName,inviterDisplayName:input.inviterDisplayName,roleName:result.member.roleName,destination:dynamicNavigationTarget("organization.invitation.accept",{token:rawToken}),expiresAt:input.expiresAt});return result.member}}
export class ResendOrganizationInvitation{constructor(private readonly repository:OrganizationMembersRepository,private readonly notifier:OrganizationInvitationNotifier){}async execute(input:{organizationId:OrganizationId;actorUserId:UserId;invitationId:string;expiresAt:string;expectedVersion:number;organizationName:string;inviterDisplayName:string}){const rawToken=crypto.randomUUID();const member=await this.repository.resend({...input,rawToken,tokenHash:await sha256(rawToken)});await this.notifier.sendInvitation({email:member.email,organizationName:input.organizationName,inviterDisplayName:input.inviterDisplayName,roleName:member.roleName,destination:dynamicNavigationTarget("organization.invitation.accept",{token:rawToken}),expiresAt:input.expiresAt});return member}}
export class RevokeOrganizationInvitation{constructor(private readonly repository:OrganizationMembersRepository){}execute(input:{organizationId:OrganizationId;actorUserId:UserId;invitationId:string;expectedVersion:number}){return this.repository.revokeInvitation(input)}}
export class UpdateOrganizationMembership{constructor(private readonly repository:OrganizationMembersRepository){}execute(input:{organizationId:OrganizationId;actorUserId:UserId;membershipId:string;roleId?:string;status?:"active"|"suspended";expectedVersion:number}){return this.repository.update(input)}}
export class RevokeOrganizationMembership{constructor(private readonly repository:OrganizationMembersRepository){}execute(input:{organizationId:OrganizationId;actorUserId:UserId;membershipId:string;expectedVersion:number}){return this.repository.revoke(input)}}
async function sha256(value:string):Promise<string>{const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,"0")).join("")}

export interface OrganizationPresentation {
  readonly organizationId: OrganizationId;
  readonly avatarUrl: string | null;
}

export interface OrganizationPresentationDirectory {
  listByOrganizationIds(
    organizationIds: readonly OrganizationId[],
  ): Promise<readonly OrganizationPresentation[]>;
}

export class ListOrganizations {
  constructor(private readonly directory: OrganizationDirectory) {}

  async execute(userId: UserId): Promise<readonly OrganizationAccess[]> {
    const access = await this.directory.listAccessForUser(userId);
    return access
      .filter(hasActiveOrganizationAccess)
      .sort((left, right) => {
        if (isOrganizationOwner(left.membership) && !isOrganizationOwner(right.membership)) return -1;
        if (!isOrganizationOwner(left.membership) && isOrganizationOwner(right.membership)) return 1;
        return left.organization.name.localeCompare(right.organization.name);
      });
  }
}

export class ListOrganizationCompanies {
  constructor(private readonly directory: OrganizationDirectory) {}

  async execute(userId: UserId, organizationId: OrganizationId): Promise<readonly OrganizationCompany[]> {
    await requireOrganizationAccess(this.directory, userId, organizationId);
    const companies = await this.directory.listCompanies(organizationId);
    if (companies.some((company) => company.organizationId !== organizationId)) {
      throw new OrganizationFailure("COMPANY_ACCESS_DENIED", "Una empresa no pertenece a la organización.");
    }
    return companies;
  }
}

export class GetOrganization {
  constructor(private readonly directory: OrganizationDirectory) {}

  execute(userId: UserId, organizationId: OrganizationId): Promise<OrganizationAccess> {
    return requireOrganizationAccess(this.directory, userId, organizationId);
  }
}

export class UpdateOrganization {
  constructor(private readonly repository: OrganizationRepository) {}
  async execute(command: { readonly actorUserId: UserId; readonly organizationId: OrganizationId; readonly name?: string; readonly expectedVersion: number }) {
    const access = await requireOrganizationAccess(this.repository, command.actorUserId, command.organizationId);
    requireUpdatePermission(access);
    const name = command.name?.trim();
    if (name !== undefined && (name.length < 1 || name.length > 160)) throw new OrganizationFailure("ORGANIZATION_DATA_INVALID", "El nombre debe contener entre 1 y 160 caracteres.");
    return this.repository.update(command.organizationId, name === undefined ? {} : { name }, command.expectedVersion);
  }
}

export class UploadOrganizationLogo {
  constructor(private readonly repository: OrganizationRepository, private readonly storage: OrganizationLogoStorage) {}
  async execute(command: { readonly actorUserId: UserId; readonly organizationId: OrganizationId; readonly logo: { readonly bytes: Uint8Array; readonly contentType: string }; readonly expectedVersion: number }) {
    const access = await requireOrganizationAccess(this.repository, command.actorUserId, command.organizationId);
    requireUpdatePermission(access);
    if (!LOGO_TYPES.has(command.logo.contentType) || command.logo.bytes.byteLength === 0 || command.logo.bytes.byteLength > 5_000_000) throw new OrganizationFailure("ORGANIZATION_LOGO_INVALID", "El logo debe ser PNG, JPEG o WebP y pesar hasta 5 MB.");
    const logoUrl = await this.storage.upload(command.organizationId, command.logo);
    try {
      const updated = await this.repository.update(command.organizationId, { logoUrl }, command.expectedVersion);
      if (access.organization.logoUrl) await this.storage.deleteByPublicUrl(command.organizationId, access.organization.logoUrl).catch(() => undefined);
      return updated;
    } catch (cause) { await this.storage.deleteByPublicUrl(command.organizationId, logoUrl).catch(() => undefined); throw cause; }
  }
}

export class DeleteOrganizationLogo {
  constructor(private readonly repository: OrganizationRepository, private readonly storage: OrganizationLogoStorage) {}
  async execute(command: { readonly actorUserId: UserId; readonly organizationId: OrganizationId; readonly expectedVersion: number }) {
    const access = await requireOrganizationAccess(this.repository, command.actorUserId, command.organizationId);
    requireUpdatePermission(access);
    const updated = await this.repository.update(command.organizationId, { logoUrl: null }, command.expectedVersion);
    if (access.organization.logoUrl) await this.storage.deleteByPublicUrl(command.organizationId, access.organization.logoUrl).catch(() => undefined);
    return updated;
  }
}

function requireUpdatePermission(access: OrganizationAccess): void {
  if (!access.membership.permissions.includes("*") && !access.membership.permissions.includes("organizations.update")) throw new OrganizationFailure("ORGANIZATION_ACCESS_DENIED", "No tienes permiso para actualizar la organización.");
}
const LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export class GetOrganizationCompany {
  constructor(private readonly directory: OrganizationDirectory) {}

  async execute(userId: UserId, organizationId: OrganizationId, companyId: CompanyId): Promise<OrganizationCompany> {
    await requireOrganizationAccess(this.directory, userId, organizationId);
    const company = await this.directory.findCompany(organizationId, companyId);
    if (!company) throw new OrganizationFailure("COMPANY_NOT_FOUND", "La empresa no existe.");
    if (company.organizationId !== organizationId) {
      throw new OrganizationFailure("COMPANY_ACCESS_DENIED", "La empresa no pertenece a la organización.");
    }
    return company;
  }
}

export async function requireOrganizationAccess(
  directory: OrganizationDirectory,
  userId: UserId,
  organizationId: OrganizationId,
): Promise<OrganizationAccess> {
  const access = await directory.findAccess(userId, organizationId);
  if (!access || !hasActiveOrganizationAccess(access)) {
    throw new OrganizationFailure("ORGANIZATION_ACCESS_DENIED", "No tienes acceso a esta organización.");
  }
  return access;
}
