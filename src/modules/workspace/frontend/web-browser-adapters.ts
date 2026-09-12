import { RemoteConnectivityProbe } from "@kontave/client-remote";
import type { ModuleCode } from "@kontave/modules/domain";
import {
  WebApplicationController,
  type WebWorkspaceSelection,
} from "./web-application-controller";
import { createWebWorkspaceSource } from "./web-workspace-source";
import { createWebOperationContext } from "./web-operation-context";

const STORAGE_KEYS = [
  "kont-active-tenant-id",
  "kont-company-id",
  "kont-active-module",
  "sidebar-module",
  "kont-session-user-id",
] as const;

/** Creates browser-specific adapters for one authenticated actor.
 * @param actorId - Session identity, never read from remembered browser selection.
 * @returns A controller without side effects until its runtime starts.
 */
export function createBrowserApplication(
  actorId: string,
): WebApplicationController {
  const readSelection = (): WebWorkspaceSelection => {
    const params = new URL(window.location.href).searchParams;
    const previousActor = localStorage.getItem("kont-session-user-id");
    if (previousActor !== actorId)
      STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    return {
      tenantId:
        params.get("tid") ?? localStorage.getItem("kont-active-tenant-id"),
      companyId: params.get("cid") ?? localStorage.getItem("kont-company-id"),
      moduleCode: (localStorage.getItem("kont-active-module") ??
        localStorage.getItem("sidebar-module")) as ModuleCode | null,
    };
  };
  return new WebApplicationController({
    actorId,
    source: createWebWorkspaceSource(),
    readSelection,
    commitSelection(selection) {
      const previousTenant = localStorage.getItem("kont-active-tenant-id");
      for (const [key, value] of [
        ["kont-active-tenant-id", selection.tenantId],
        ["kont-company-id", selection.companyId],
        ["kont-active-module", selection.moduleCode],
        ["kont-session-user-id", actorId],
      ] as const) {
        if (value) localStorage.setItem(key, value);
        else localStorage.removeItem(key);
      }
      // Next's native history integration updates search params without losing page filters.
      const url = new URL(window.location.href);
      for (const [key, value] of [
        ["tid", selection.tenantId],
        ["cid", selection.companyId],
      ] as const) {
        if (value) url.searchParams.set(key, value);
        else url.searchParams.delete(key);
      }
      if (url.href !== window.location.href)
        window.history.replaceState(
          null,
          "",
          `${url.pathname}${url.search}${url.hash}`,
        );
      if (previousTenant !== selection.tenantId)
        window.dispatchEvent(new Event("kont-active-tenant-changed"));
    },
    clearSelection: () =>
      STORAGE_KEYS.forEach((key) => localStorage.removeItem(key)),
    probe: {
      check: () =>
        navigator.onLine
          ? new RemoteConnectivityProbe(window.location.origin).check()
          : Promise.resolve({
              reachable: false,
              reason: "network_unreachable",
            }),
    },
    createOperationContext: createWebOperationContext,
  });
}
