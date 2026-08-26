import type { KontaveRequest } from "../../transport";

export type RemoteConnectivityProbeResult =
  | { readonly reachable: true }
  | {
      readonly reachable: false;
      readonly reason:
        | "probe_timeout"
        | "network_unreachable"
        | "service_unreachable";
    };

/** Remote reachability probe for the Kontave Client API. */
export class RemoteConnectivityProbe {
  /**
   * Creates the probe.
   * @param baseUrl - Kontave API origin.
   * @param request - Platform request mechanism.
   * @param timeoutMs - Maximum probe duration in milliseconds.
   */
  constructor(
    private readonly baseUrl: string,
    private readonly request: KontaveRequest = globalThis.fetch,
    private readonly timeoutMs = 5_000,
  ) {}

  /**
   * Probes a stable Client API resource without requiring a valid session.
   * Authentication failures prove that the service is reachable.
   * @returns Reachability and a stable failure reason.
   */
  async check(): Promise<RemoteConnectivityProbeResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.request(
        new URL("/api/client/v1/organization-access", this.baseUrl),
        { method: "GET", cache: "no-store", signal: controller.signal },
      );
      return response.ok || response.status === 401 || response.status === 403
        ? { reachable: true }
        : { reachable: false, reason: "service_unreachable" };
    } catch (cause: unknown) {
      return cause instanceof Error && cause.name === "AbortError"
        ? { reachable: false, reason: "probe_timeout" }
        : { reachable: false, reason: "network_unreachable" };
    } finally {
      clearTimeout(timeout);
    }
  }
}
