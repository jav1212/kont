import type { ConnectivitySnapshot } from "@kontave/client-connectivity-contracts";
/** Service-connectivity capability exposed by preload. */
export interface DesktopConnectivityApi {
  getSnapshot(): Promise<ConnectivitySnapshot>;
  refresh(): Promise<ConnectivitySnapshot>;
  subscribe(listener: (snapshot: ConnectivitySnapshot) => void): () => void;
}
