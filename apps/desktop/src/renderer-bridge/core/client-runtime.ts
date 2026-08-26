import type { ClientLifecycleSnapshot } from "@kontave/client-contracts";

/** Lifecycle surface of the portable client transported to the renderer. */
export interface DesktopClientRuntimeBridge {
  getLifecycleSnapshot(): Promise<ClientLifecycleSnapshot>;
  subscribeLifecycle(
    listener: (snapshot: ClientLifecycleSnapshot) => void,
  ): () => void;
}
