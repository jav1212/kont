import type { ConnectivityProbe } from "@kontave/client-connectivity-application";
import type { ConnectivityProbeResult } from "@kontave/client-connectivity-contracts";

export class FetchConnectivityProbe implements ConnectivityProbe {
  constructor(
    private readonly healthUrl: string,
    private readonly timeoutMs = 5_000,
  ) {}

  async check(): Promise<ConnectivityProbeResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.healthUrl, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });
      if (response.ok || response.status === 401 || response.status === 403) return { reachable: true };
      return { reachable: false, reason: "service_unreachable" };
    } catch (cause: unknown) {
      if (cause instanceof Error && cause.name === "AbortError") {
        return { reachable: false, reason: "probe_timeout" };
      }
      return { reachable: false, reason: "network_unreachable" };
    } finally {
      clearTimeout(timeout);
    }
  }
}
