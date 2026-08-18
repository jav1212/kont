import type { ConnectivityProbe } from "@kontave/client-connectivity-application";
import type { ConnectivityProbeResult } from "@kontave/client-connectivity-contracts";
import { RemoteConnectivityProbe } from "@kontave/client-remote";

/** Desktop composition adapter for the portable remote reachability probe. */
export class FetchConnectivityProbe implements ConnectivityProbe {
  private readonly remote: RemoteConnectivityProbe;

  /**
   * Creates the Desktop connectivity probe.
   * @param baseUrl - Kontave API origin.
   * @param timeoutMs - Maximum probe duration in milliseconds.
   */
  constructor(baseUrl: string, timeoutMs = 5_000) {
    this.remote = new RemoteConnectivityProbe(baseUrl, globalThis.fetch, timeoutMs);
  }

  /** @returns Current Kontave service reachability. */
  check(): Promise<ConnectivityProbeResult> {
    return this.remote.check();
  }
}
