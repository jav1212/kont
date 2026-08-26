import type {
  AccessibleOrganizationDto,
  ClientPortFeature,
  OrganizationsPort,
} from "@kontave/client-contracts";
import {
  DelegatedAccessScope,
  OrganizationAccessPathKind,
  delegatedAccessGrantId,
} from "@kontave/delegated-access-domain";
import { organizationId, userId } from "@kontave/organizations-domain";
import type {
  WorkspacePortfolioEntry,
  WorkspacePortfolioSource,
} from "@kontave/workspace-context-application";
import { requireClientValue } from "../client/client-operation";

export class DesktopWorkspacePortfolioSource
  implements WorkspacePortfolioSource
{
  constructor(
    private readonly organizations: ClientPortFeature<OrganizationsPort>,
  ) {}

  async list(): Promise<readonly WorkspacePortfolioEntry[]> {
    return requireClientValue(await this.organizations.accessible()).map(
      toAccessibleOrganization,
    );
  }
}

function toAccessibleOrganization(
  dto: AccessibleOrganizationDto,
): WorkspacePortfolioEntry {
  const kind =
    dto.accessPath.kind === OrganizationAccessPathKind.DirectMembership
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
      delegationId: dto.accessPath.delegationId
        ? delegatedAccessGrantId(dto.accessPath.delegationId)
        : null,
      scopes: dto.accessPath.scopes.map(readScope),
    },
  };
}

function readScope(value: string): DelegatedAccessScope {
  const scope = Object.values(DelegatedAccessScope).find(
    (candidate) => candidate === value,
  );
  if (!scope) throw new Error("El alcance delegado recibido no es válido.");
  return scope;
}

function invalidAccessPath(): never {
  throw new Error("La ruta de acceso recibida no es compatible.");
}
