/** Aggregate platform availability shown by Desktop. */
export type DesktopPlatformStatusState =
  | { readonly status: "loading" }
  | { readonly status: "unavailable" }
  | {
      readonly status: "ready";
      readonly availability: "operational" | "degraded" | "down" | "unknown";
      readonly observedAt: string | null;
    };
export interface DesktopPlatformStatusApi {
  getCurrent(): Promise<DesktopPlatformStatusState>;
  subscribe(listener: (state: DesktopPlatformStatusState) => void): () => void;
}
