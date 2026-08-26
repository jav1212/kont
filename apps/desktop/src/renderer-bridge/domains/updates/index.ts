import type { ClientUpdateSnapshot } from "@kontave/client-updates/contracts";
/** Native application-update capability exposed by preload. */
export interface DesktopUpdatesApi {
  getState(): Promise<ClientUpdateSnapshot>;
  check(): Promise<ClientUpdateSnapshot>;
  download(): Promise<ClientUpdateSnapshot>;
  apply(): Promise<ClientUpdateSnapshot>;
  subscribe(listener: (state: ClientUpdateSnapshot) => void): () => void;
}
