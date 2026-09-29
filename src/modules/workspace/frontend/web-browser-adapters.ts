import type { KontaveRequest } from "@kontave/client-remote";
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

/** Browser capabilities used to establish whether the Web application can reach its API. */
export interface BrowserConnectivityEnvironment {
  /** Current document location used to resolve the Client API endpoint. */
  readonly location: Pick<Location, "origin">;
  /** Browser-provided network hint, read anew for each probe. */
  readonly navigator: Pick<Navigator, "onLine">;
  /** Fetch implementation supplied by the browser. */
  readonly fetch: KontaveRequest;
}

/** Creates the Web reachability probe with a receiver-bound browser fetch implementation.
 * @param environment - Browser network primitives for the active document.
 * @param timeoutMs - Maximum time allowed for the reachability request.
 * @returns A connectivity probe that distinguishes offline browser state from API reachability.
 */
export function createBrowserConnectivityProbe(
  environment: BrowserConnectivityEnvironment,
  timeoutMs?: number,
): {
  readonly check: () => Promise<
    | { readonly reachable: true }
    | {
        readonly reachable: false;
        readonly reason:
          | "probe_timeout"
          | "network_unreachable"
          | "service_unreachable";
      }
  >;
} {
  return {
    check: async () => {
      if (!environment.navigator.onLine)
        return {
          reachable: false as const,
          reason: "network_unreachable" as const,
        };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs ?? 5_000);
      try {
        // Connectivity must not be inferred from an authenticated resource: an
        // expired session is distinct from an unavailable service.
        const response = await environment.fetch.call(
          environment,
          new URL("/api/client/v1/health", environment.location.origin),
          { method: "GET", cache: "no-store", signal: controller.signal },
        );
        return response.ok
          ? { reachable: true as const }
          : { reachable: false as const, reason: "service_unreachable" as const };
      } catch (cause: unknown) {
        return cause instanceof Error && cause.name === "AbortError"
          ? { reachable: false as const, reason: "probe_timeout" as const }
          : { reachable: false as const, reason: "network_unreachable" as const };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

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
    probe: createBrowserConnectivityProbe(window),
    createOperationContext: createWebOperationContext,
  });
}
