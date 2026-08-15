import type { NativeOrganizationCompanyDto } from "@kontave/native-api-contracts";
import { companyId, organizationId, type OrganizationCompany, type OrganizationId } from "@kontave/organizations-domain";
import type { WorkspaceCompanySource } from "@kontave/workspace-context-application";

export class DesktopWorkspaceCompanySource implements WorkspaceCompanySource {
  constructor(private readonly baseUrl: string, private readonly getAccessToken: () => Promise<string | null>) {}

  async listByOrganization(targetOrganizationId: OrganizationId): Promise<readonly OrganizationCompany[]> {
    const accessToken = await this.getAccessToken();
    if (!accessToken) return [];
    const response = await fetch(new URL(
      `/api/native/v1/organizations/${encodeURIComponent(targetOrganizationId)}/companies`,
      this.baseUrl,
    ), { headers: { authorization: `Bearer ${accessToken}`, "x-kontave-client": "desktop" } });
    const payload: unknown = await response.json();
    if (!response.ok) throw new Error(readApiError(payload));
    return readCompanies(payload);
  }
}

function readCompanies(payload: unknown): readonly OrganizationCompany[] {
  const envelope = readRecord(payload, "La respuesta de empresas no es válida.");
  if (!Array.isArray(envelope.data)) throw new Error("La respuesta no contiene empresas válidas.");
  return envelope.data.map((value) => mapCompany(readCompanyDto(value)));
}

function readCompanyDto(value: unknown): NativeOrganizationCompanyDto {
  const item = readRecord(value, "La empresa recibida no es válida.");
  return {
    id: readText(item.id),
    organizationId: readText(item.organizationId),
    name: readText(item.name),
    rif: item.rif === null ? null : readText(item.rif),
    logoUrl: item.logoUrl === undefined || item.logoUrl === null ? null : readUrl(item.logoUrl),
  };
}

function mapCompany(value: NativeOrganizationCompanyDto): OrganizationCompany {
  return { id: companyId(value.id), organizationId: organizationId(value.organizationId), name: value.name, rif: value.rif, logoUrl: value.logoUrl };
}

function readApiError(payload: unknown): string {
  const envelope = readRecord(payload, "No se pudieron obtener las empresas.");
  const error = envelope.error && typeof envelope.error === "object" ? envelope.error as Record<string, unknown> : null;
  return error && typeof error.message === "string" ? error.message : "No se pudieron obtener las empresas.";
}

function readRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function readText(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("La respuesta contiene texto inválido.");
  return value.trim();
}

function readUrl(value: unknown): string {
  const url = readText(value);
  try { return new URL(url).toString(); }
  catch { throw new Error("La empresa contiene una URL de logo inválida."); }
}
