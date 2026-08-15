import type { AvailableOrganizationModule } from "@kontave/modules-application";
import type { ModuleCode, ModuleId } from "@kontave/modules-domain";
import type { OrganizationId } from "@kontave/organizations-domain";
import type { WorkspaceModuleSource } from "@kontave/workspace-context-application";

export class DesktopWorkspaceModuleSource implements WorkspaceModuleSource {
  constructor(private readonly baseUrl: string, private readonly getAccessToken: () => Promise<string | null>) {}

  async listAvailable(organizationId: OrganizationId): Promise<readonly AvailableOrganizationModule[]> {
    const accessToken = await this.getAccessToken();
    if (!accessToken) return [];
    const response = await fetch(new URL(
      `/api/native/v1/organizations/${encodeURIComponent(organizationId)}/modules/available?platform=desktop`,
      this.baseUrl,
    ), { headers: { authorization: `Bearer ${accessToken}`, "x-kontave-client": "desktop" } });
    const payload: unknown = await response.json();
    if (!response.ok) throw new Error(readApiError(payload));
    return readModules(payload);
  }
}

function readModules(payload: unknown): readonly AvailableOrganizationModule[] {
  const envelope = readRecord(payload, "La respuesta de módulos no es válida.");
  if (!Array.isArray(envelope.data)) throw new Error("La respuesta no contiene módulos válidos.");
  return envelope.data.map((value) => {
    const item = readRecord(value, "El módulo recibido no es válido.");
    return { id: readText(item.id) as ModuleId, code: readModuleCode(item.code), name: readText(item.name) };
  });
}

function readModuleCode(value: unknown): ModuleCode {
  if (isModuleCode(value)) return value as ModuleCode;
  throw new Error("El código del módulo no es compatible.");
}

function isModuleCode(value: unknown): value is string {
  return value === "payroll" || value === "purchases" || value === "sales"
    || value === "inventory" || value === "accounting" || value === "tools"
    || value === "companies" || value === "documents";
}

function readApiError(payload: unknown): string {
  const envelope = readRecord(payload, "No se pudieron obtener los módulos.");
  const error = envelope.error && typeof envelope.error === "object" ? envelope.error as Record<string, unknown> : null;
  return error && typeof error.message === "string" ? error.message : "No se pudieron obtener los módulos.";
}

function readRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function readText(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("La respuesta contiene texto inválido.");
  return value.trim();
}
