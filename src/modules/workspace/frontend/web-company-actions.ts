import { useMemo } from "react";
import type {
  UseCompanyResult,
  CompanyUpdateData,
  BusinessSector,
  InventoryConfig,
} from "../../companies/frontend/hooks/use-companies";
import type { WebApplicationController } from "./web-application-controller";

type CompanyActions = Pick<
  UseCompanyResult,
  | "reload"
  | "selectCompany"
  | "save"
  | "update"
  | "remove"
  | "applySector"
  | "getInventoryConfig"
  | "saveInventoryConfig"
>;

/** Keeps legacy company commands scoped to the committed workspace.
 * @param controller - Session-owned global controller.
 * @param tenantId - Tenant captured when commands are rendered.
 * @param actorId - Authenticated actor used by the compatible create contract.
 * @returns Stable legacy actions; obsolete completions cannot refresh another tenant.
 */
export function useWebCompanyActions(
  controller: WebApplicationController,
  tenantId: string | null,
  actorId: string,
): CompanyActions {
  return useMemo(() => {
    const current = (): boolean =>
      controller.getSnapshot().status === "ready" &&
      controller.getSnapshot().tenantId === tenantId;
    const request = async (
      path: string,
      init?: RequestInit,
    ): Promise<{ data?: unknown; error?: string }> => {
      if (!tenantId || !current())
        return { error: "El espacio de trabajo cambió. Vuelve a intentarlo." };
      const headers = new Headers(init?.headers);
      headers.set("X-Tenant-Id", tenantId);
      try {
        const response = await fetch(path, {
          ...init,
          headers,
          cache: "no-store",
        });
        const payload = (await response.json()) as {
          data?: unknown;
          error?: string;
        };
        return response.ok
          ? payload
          : {
              error:
                typeof payload.error === "string"
                  ? payload.error
                  : "No se pudo completar la operación.",
            };
      } catch {
        return { error: "No se pudo conectar. Vuelve a intentarlo." };
      }
    };
    const mutate = async (
      path: string,
      method: string,
      body?: unknown,
    ): Promise<string | null> => {
      const result = await request(path, {
        method,
        ...(body === undefined
          ? {}
          : {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }),
      });
      if (result.error) return result.error;
      if (current()) await controller.refresh();
      return null;
    };
    return {
      reload: () => (current() ? controller.refresh() : Promise.resolve()),
      selectCompany: (id: string) => {
        void controller.selectCompany(id);
      },
      save: (data: Parameters<UseCompanyResult["save"]>[0]) =>
        mutate("/api/companies/save", "POST", { ...data, ownerId: actorId }),
      update: (id: string, data: CompanyUpdateData) =>
        mutate("/api/companies/update", "PATCH", { id, ...data }),
      remove: (id: string) =>
        mutate(`/api/companies/delete?id=${encodeURIComponent(id)}`, "DELETE"),
      applySector: (id: string, sector: BusinessSector) =>
        mutate("/api/companies/apply-sector", "POST", {
          companyId: id,
          sector,
        }),
      getInventoryConfig: async (id: string) => {
        const result = await request(
          `/api/companies/inventory-config?companyId=${encodeURIComponent(id)}`,
        );
        return result.error
          ? null
          : ((result.data as InventoryConfig | undefined) ?? null);
      },
      saveInventoryConfig: (id: string, config: InventoryConfig) =>
        mutate("/api/companies/inventory-config", "PATCH", {
          companyId: id,
          config,
        }),
    };
  }, [actorId, controller, tenantId]);
}
