import type { ConnectivitySnapshot } from "@kontave/client-connectivity-contracts";

const INITIAL_SNAPSHOT: ConnectivitySnapshot = Object.freeze({
  availability: "unknown",
  checking: false,
  reason: null,
  observedAt: null,
  consecutiveFailures: 0,
});

let snapshot = INITIAL_SNAPSHOT;
let initialized = false;
let initialization: Promise<ConnectivitySnapshot> | null = null;
const listeners = new Set<() => void>();

function publish(next: ConnectivitySnapshot): ConnectivitySnapshot {
  snapshot = next;
  for (const listener of listeners) listener();
  return snapshot;
}

export const desktopConnectivityStore = {
  getSnapshot: (): ConnectivitySnapshot => snapshot,

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  initialize(): Promise<ConnectivitySnapshot> {
    initialization ??= window.kontave.connectivity.getSnapshot().then((next) => {
      if (!initialized) {
        window.kontave.connectivity.subscribe(publish);
        window.addEventListener("online", () => void desktopConnectivityStore.refresh());
        window.addEventListener("offline", () => void desktopConnectivityStore.refresh());
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") void desktopConnectivityStore.refresh();
        });
        initialized = true;
      }
      return publish(next);
    });
    return initialization;
  },

  refresh(): Promise<ConnectivitySnapshot> {
    return window.kontave.connectivity.refresh().then(publish);
  },
};
