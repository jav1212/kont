/** Aggregate platform availability shown by Desktop. */
export type DesktopPortalMonitoringState =
  | { readonly status: "loading" }
  | { readonly status: "unavailable" }
  | {
      readonly status: "ready";
      readonly availability: "operational" | "degraded" | "down" | "unknown";
      readonly observedAt: string | null;
    };
export interface DesktopPortalMonitoringApi {
  getCurrent(): Promise<DesktopPortalMonitoringState>;
  subscribe(listener: (state: DesktopPortalMonitoringState) => void): () => void;
}
