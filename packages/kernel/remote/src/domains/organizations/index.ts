import {
  accessibleOrganization,
  organization,
  company,
  operationalCompany,
  organizationModule,
  member,
  role,
} from "./decoding";
import { decodeRemote, array } from "../../decoding";
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

  /** @returns Organizations accessible through direct or delegated access paths.
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  accessible(): Promise<readonly AccessibleOrganizationDto[]> {
    return decodeRemote(
      this.transport,
      "/api/client/v1/organization-access",
      { method: "GET" },
      (value) => array(value, accessibleOrganization),
    );
  }

  /**
   * Loads one organization.
   * @param organizationId - Organization identifier.
   * @returns Organization settings and actor permissions.
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  get(organizationId: string): Promise<OrganizationDto> {
    return decodeRemote(
      this.transport,
      root(organizationId),
      { method: "GET" },
      organization,
    );
  }

  /**
   * Updates one organization.
   * @param organizationId - Organization identifier.
   * @param command - Versioned organization changes.
   * @returns The updated organization.
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  update(
    organizationId: string,
    command: UpdateOrganizationDto,
  ): Promise<OrganizationDto> {
    return decodeRemote(
      this.transport,
      root(organizationId),
      json(command),
      organization,
    );
  }

  /**
   * Lists operational companies owned by an organization.
   * @param organizationId - Organization identifier.
   * @returns Available companies.
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  companies(
    organizationId: string,
  ): Promise<readonly OrganizationCompanyDto[]> {
    return decodeRemote(
      this.transport,
      `${root(organizationId)}/companies`,
      { method: "GET" },
      (value) => array(value, company),
    );
  }

  /**
   * Lists organization companies using the client operational model.
   * @param organizationId - Organization identifier.
   * @returns Operational companies available to client applications.
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  operationalCompanies(organizationId: string): Promise<readonly CompanyDto[]> {
    return decodeRemote(
      this.transport,
      `${root(organizationId)}/operational-companies`,
      { method: "GET" },
      (value) => array(value, operationalCompany),
    );
  }

  /**
   * Lists modules available on a platform.
   * @param organizationId - Organization identifier.
   * @param platform - Target client platform.
   * @returns Available organization modules.
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  modules(
    organizationId: string,
    platform: "desktop" | "mobile" | "web",
  ): Promise<readonly AvailableOrganizationModuleDto[]> {
    return decodeRemote(
      this.transport,
      `${root(organizationId)}/modules/available?platform=${platform}`,
      { method: "GET" },
      (value) => array(value, organizationModule),
    );
  }

  /**
   * Lists organization members.
   * @param organizationId - Organization identifier.
   * @returns Current memberships.
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  members(organizationId: string): Promise<readonly OrganizationMemberDto[]> {
    return decodeRemote(
      this.transport,
      `${root(organizationId)}/members`,
      { method: "GET" },
      (value) => array(value, member),
    );
  }

  /**
   * Lists organization roles.
   * @param organizationId - Organization identifier.
   * @returns Roles available for membership assignment.
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  roles(organizationId: string): Promise<readonly RoleDto[]> {
    return decodeRemote(
      this.transport,
      `${root(organizationId)}/roles`,
      { method: "GET" },
      (value) => array(value, role),
    );
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
