import type { NativeAccessibleOrganizationDto } from "@kontave/native-api-contracts";
import {
  DelegatedScope,
  OrganizationAccessPathKind,
  organizationDelegationId,
} from "@kontave/organization-delegations-domain";
import { organizationId, userId } from "@kontave/organizations-domain";
import type { WorkspacePortfolioEntry, WorkspacePortfolioSource } from "@kontave/workspace-context-application";

export class DesktopWorkspacePortfolioSource implements WorkspacePortfolioSource {
  constructor(
    private readonly baseUrl: string,
    private readonly getAccessToken: () => Promise<string | null>,
  ) {}

  async list(): Promise<readonly WorkspacePortfolioEntry[]> {
    const accessToken = await this.getAccessToken();
    if (!accessToken) return [];

    const response = await fetch(new URL("/api/native/v1/organization-access", this.baseUrl), {
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-kontave-client": "desktop",
      },
    });
    const payload: unknown = await response.json();
    if (!response.ok) throw new Error(readApiError(payload));
    return readPortfolio(payload).map(toAccessibleOrganization);
  }
}

function readPortfolio(payload: unknown): readonly NativeAccessibleOrganizationDto[] {
  const record = readRecord(payload, "La respuesta del portafolio no es válida.");
  if (!Array.isArray(record.data)) throw new Error("La respuesta del portafolio no contiene datos válidos.");
  return record.data.map(readWorkspaceDto);
}

function readWorkspaceDto(value: unknown): NativeAccessibleOrganizationDto {
  const record = readRecord(value, "El espacio de trabajo recibido no es válido.");
  const accessPath = readRecord(record.accessPath, "La ruta de acceso recibida no es válida.");
  return {
    organizationId: readText(record.organizationId),
    name: readText(record.name),
    // Older v1 deployments omitted this additive field; treat omission as the
    // same no-logo state while newer servers return an explicit null.
    avatarUrl: record.avatarUrl === undefined || record.avatarUrl === null ? null : readUrl(record.avatarUrl),
    accessPath: {
      kind: readText(accessPath.kind),
      actorUserId: readText(accessPath.actorUserId),
      actingOrganizationId: readText(accessPath.actingOrganizationId),
      targetOrganizationId: readText(accessPath.targetOrganizationId),
      delegationId: accessPath.delegationId === null ? null : readText(accessPath.delegationId),
      scopes: readTextArray(accessPath.scopes),
    },
  };
}

function toAccessibleOrganization(dto: NativeAccessibleOrganizationDto): WorkspacePortfolioEntry {
  const kind = dto.accessPath.kind === OrganizationAccessPathKind.DirectMembership
    ? OrganizationAccessPathKind.DirectMembership
    : dto.accessPath.kind === OrganizationAccessPathKind.DelegatedOrganization
      ? OrganizationAccessPathKind.DelegatedOrganization
      : invalidAccessPath();
  return {
    organizationId: organizationId(dto.organizationId),
    name: dto.name,
    avatarUrl: dto.avatarUrl,
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

function readApiError(payload: unknown): string {
  const record = readRecord(payload, "No se pudo obtener el portafolio organizacional.");
  const error = record.error && typeof record.error === "object" ? record.error as Record<string, unknown> : null;
  return error && typeof error.message === "string" ? error.message : "No se pudo obtener el portafolio organizacional.";
}

function readRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function readText(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("La respuesta contiene texto inválido.");
  return value.trim();
}

function readTextArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) throw new Error("La respuesta contiene una lista inválida.");
  return value.map(readText);
}

function readUrl(value: unknown): string {
  const url = new URL(readText(value));
  if (url.protocol !== "https:") throw new Error("La imagen del espacio de trabajo no es válida.");
  return url.toString();
}
