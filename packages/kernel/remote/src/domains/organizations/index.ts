import type {
  AccessibleOrganizationDto,
  AvailableOrganizationModuleDto,
  CompanyDto,
  OrganizationCompanyDto,
  OrganizationDto,
  OrganizationMemberDto,
  OrganizationsPort,
  RoleDto,
  UpdateOrganizationDto,
} from "@kontave/client-contracts";
import type { RemoteTransport } from "../../transport";

/** Remote adapter for organization identity, access and workspace discovery. */
export class RemoteOrganizationsPort implements OrganizationsPort {
  /**
   * Creates the adapter.
   * @param transport - Authenticated Client API transport.
   */
  constructor(private readonly transport: RemoteTransport) {}

  /** @returns Organizations accessible through direct or delegated access paths. */
  accessible(): Promise<readonly AccessibleOrganizationDto[]> {
    return this.transport.get("/api/client/v1/organization-access");
  }

  /**
   * Loads one organization.
   * @param organizationId - Organization identifier.
   * @returns Organization settings and actor permissions.
   */
  get(organizationId: string): Promise<OrganizationDto> {
    return this.transport.get(root(organizationId));
  }

  /**
   * Updates one organization.
   * @param organizationId - Organization identifier.
   * @param command - Versioned organization changes.
   * @returns The updated organization.
   */
  update(
    organizationId: string,
    command: UpdateOrganizationDto,
  ): Promise<OrganizationDto> {
    return this.transport.request(root(organizationId), json(command));
  }

  /**
   * Lists operational companies owned by an organization.
   * @param organizationId - Organization identifier.
   * @returns Available companies.
   */
  companies(
    organizationId: string,
  ): Promise<readonly OrganizationCompanyDto[]> {
    return this.transport.get(`${root(organizationId)}/companies`);
  }

  /**
   * Lists organization companies using the client operational model.
   * @param organizationId - Organization identifier.
   * @returns Operational companies available to client applications.
   */
  operationalCompanies(organizationId: string): Promise<readonly CompanyDto[]> {
    return this.transport.get(`${root(organizationId)}/operational-companies`);
  }

  /**
   * Lists modules available on a platform.
   * @param organizationId - Organization identifier.
   * @param platform - Target client platform.
   * @returns Available organization modules.
   */
  modules(
    organizationId: string,
    platform: "desktop" | "mobile" | "web",
  ): Promise<readonly AvailableOrganizationModuleDto[]> {
    return this.transport.get(
      `${root(organizationId)}/modules/available?platform=${platform}`,
    );
  }

  /**
   * Lists organization members.
   * @param organizationId - Organization identifier.
   * @returns Current memberships.
   */
  members(organizationId: string): Promise<readonly OrganizationMemberDto[]> {
    return this.transport.get(`${root(organizationId)}/members`);
  }

  /**
   * Lists organization roles.
   * @param organizationId - Organization identifier.
   * @returns Roles available for membership assignment.
   */
  roles(organizationId: string): Promise<readonly RoleDto[]> {
    return this.transport.get(`${root(organizationId)}/roles`);
  }
}

function root(organizationId: string): string {
  if (!organizationId.trim()) throw new Error("La organización no es válida.");
  return `/api/client/v1/organizations/${encodeURIComponent(organizationId)}`;
}

function json(body: unknown): RequestInit {
  return {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}
