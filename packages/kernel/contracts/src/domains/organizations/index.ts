export interface OrganizationDto {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly role: "owner" | "admin" | "accountant" | "seller" | "cashier";
  readonly permissions: readonly string[];
  readonly logoUrl: string | null;
  readonly version: number;
}
export interface UpdateOrganizationDto {
  readonly name?: string;
  readonly expectedVersion: number;
}
export interface PermissionDto {
  readonly code: string;
  readonly resource: string;
  readonly action: string;
  readonly description: string;
}
export interface RoleDto {
  readonly id: string;
  readonly organizationId: string;
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly kind: "system" | "custom";
  readonly permissions: readonly string[];
  readonly status: "active" | "archived";
  readonly version: number;
}
export interface CreateRoleDto {
  readonly name: string;
  readonly description?: string;
  readonly permissions: readonly string[];
}
export interface UpdateRoleDto {
  readonly name?: string;
  readonly description?: string;
  readonly permissions?: readonly string[];
  readonly expectedVersion: number;
}
export interface OrganizationMemberDto {
  readonly id: string;
  readonly kind: "membership" | "invitation";
  readonly organizationId: string;
  readonly userId: string | null;
  readonly email: string;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
  readonly roleId: string;
  readonly roleName: string;
  readonly status: "active" | "invited" | "suspended";
  readonly version: number;
  readonly joinedAt: string | null;
  readonly invitedAt: string | null;
  readonly expiresAt: string | null;
}
export interface CreateMemberInvitationDto {
  readonly email: string;
  readonly roleId: string;
  readonly expiresInDays?: number;
}
export interface ResendMemberInvitationDto {
  readonly expectedVersion: number;
  readonly expiresInDays?: number;
}
export interface UpdateMembershipDto {
  readonly roleId?: string;
  readonly status?: "active" | "suspended";
  readonly expectedVersion: number;
}

export interface OrganizationCompanyDto {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly rif: string | null;
  readonly logoUrl: string | null;
}
export interface AvailableOrganizationModuleDto {
  readonly id: string;
  readonly code:
    | "payroll"
    | "purchases"
    | "sales"
    | "inventory"
    | "accounting"
    | "tools"
    | "companies"
    | "documents";
  readonly name: string;
}

export interface CompanyDto {
  readonly id: string;
  readonly organizationId: string;
  readonly legacyCompanyId: string | null;
  readonly legalName: string;
  readonly tradeName: string | null;
  readonly taxId: string | null;
  readonly country: string;
  readonly status: string;
}
export interface EmployeeDto {
  readonly id: string;
  readonly companyId: string;
  readonly legacyEmployeeId: string | null;
  readonly nationalId: string;
  readonly fullName: string;
  readonly position: string;
  readonly hiredOn: string | null;
  readonly employmentType: string;
  readonly status: string;
  readonly monthlySalaryMinor: string;
  readonly currency: string;
  readonly compensationEffectiveFrom: string;
  readonly version: number;
}

export interface OrganizationAccessPathDto {
  readonly kind: string;
  readonly actorUserId: string;
  readonly actingOrganizationId: string;
  readonly targetOrganizationId: string;
  readonly delegationId: string | null;
  readonly scopes: readonly string[];
}

export interface AccessibleOrganizationDto {
  readonly organizationId: string;
  readonly name: string;
  readonly avatarUrl: string | null;
  readonly relationship: WorkspaceRelationshipDto;
  readonly accessPath: OrganizationAccessPathDto;
}

export type WorkspaceRelationshipDto = "personal" | "member" | "delegated";

/** Application-facing port for organization and workspace discovery. */
export interface OrganizationsPort {
  /** @returns Accessible organizations. */
  accessible(): Promise<readonly AccessibleOrganizationDto[]>;
  /** @param organizationId - Organization identifier. @returns Organization details. */
  get(organizationId: string): Promise<OrganizationDto>;
  /** @param organizationId - Organization identifier. @param command - Versioned changes. @returns Updated organization. */
  update(
    organizationId: string,
    command: UpdateOrganizationDto,
  ): Promise<OrganizationDto>;
  /** @param organizationId - Organization identifier. @returns Presentation companies. */
  companies(organizationId: string): Promise<readonly OrganizationCompanyDto[]>;
  /** @param organizationId - Organization identifier. @returns Operational companies. */
  operationalCompanies(organizationId: string): Promise<readonly CompanyDto[]>;
  /** @param organizationId - Organization identifier. @param platform - Target platform. @returns Available modules. */
  modules(
    organizationId: string,
    platform: "desktop" | "mobile" | "web",
  ): Promise<readonly AvailableOrganizationModuleDto[]>;
  /** @param organizationId - Organization identifier. @returns Organization members. */
  members(organizationId: string): Promise<readonly OrganizationMemberDto[]>;
  /** @param organizationId - Organization identifier. @returns Organization roles. */
  roles(organizationId: string): Promise<readonly RoleDto[]>;
}
