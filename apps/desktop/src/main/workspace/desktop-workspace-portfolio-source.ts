import type { AccessibleOrganizationDto } from "@kontave/client-contracts";
import {
  KontaveRemoteClient,
  RemoteOrganizationsPort,
} from "@kontave/client-remote";
import {
  DelegatedScope,
  OrganizationAccessPathKind,
  organizationDelegationId,
} from "@kontave/organization-delegations-domain";
import { organizationId, userId } from "@kontave/organizations-domain";
import type { WorkspacePortfolioEntry, WorkspacePortfolioSource } from "@kontave/workspace-context-application";
import type { DesktopAuthenticatedRequest } from "../auth/desktop-authenticated-request";

export class DesktopWorkspacePortfolioSource implements WorkspacePortfolioSource {
  private readonly organizations: RemoteOrganizationsPort;

  constructor(baseUrl: string, request: DesktopAuthenticatedRequest) {
    this.organizations = new RemoteOrganizationsPort(
      new KontaveRemoteClient({
        baseUrl,
        platform: "desktop",
        authenticatedRequest: (input, init) => request.fetch(input, init),
      }),
    );
  }

  async list(): Promise<readonly WorkspacePortfolioEntry[]> {
    return (await this.organizations.accessible()).map(toAccessibleOrganization);
  }
}

function toAccessibleOrganization(dto: AccessibleOrganizationDto): WorkspacePortfolioEntry {
  const kind = dto.accessPath.kind === OrganizationAccessPathKind.DirectMembership
    ? OrganizationAccessPathKind.DirectMembership
    : dto.accessPath.kind === OrganizationAccessPathKind.DelegatedOrganization
      ? OrganizationAccessPathKind.DelegatedOrganization
      : invalidAccessPath();
  return {
    organizationId: organizationId(dto.organizationId),
    name: dto.name,
    avatarUrl: dto.avatarUrl,
    relationship: dto.relationship,
    accessPath: {
      kind,
      actorUserId: userId(dto.accessPath.actorUserId),
      actingOrganizationId: organizationId(dto.accessPath.actingOrganizationId),
      targetOrganizationId: organizationId(dto.accessPath.targetOrganizationId),
      delegationId: dto.accessPath.delegationId ? organizationDelegationId(dto.accessPath.delegationId) : null,
      scopes: dto.accessPath.scopes.map(readScope),
    },
  };
}

function readScope(value: string): DelegatedScope {
  const scope = Object.values(DelegatedScope).find((candidate) => candidate === value);
  if (!scope) throw new Error("El alcance delegado recibido no es válido.");
  return scope;
}

function invalidAccessPath(): never {
  throw new Error("La ruta de acceso recibida no es compatible.");
}
