import {
  GlobalInteractionGate,
  type InteractionBlockLease,
  type InteractionBlockActionKind,
} from "@kontave/client-interaction-application";
import type { DesktopAuthState } from "../../shared/desktop-api.js";
import { desktopConnectivityStore } from "./connectivity-store.js";

export const interactionGate = new GlobalInteractionGate();

const startupLease: InteractionBlockLease = interactionGate.acquire({
  kind: "startup",
  state: "working",
  priority: 700,
  message: "Preparando Kontave",
  description: "Estamos restaurando tu espacio de trabajo.",
});

let sessionRestoration: Promise<DesktopAuthState> | null = null;
let connectivityLease: InteractionBlockLease | null = null;

desktopConnectivityStore.subscribe(synchronizeConnectivityBlock);

export function restoreDesktopSession(): Promise<DesktopAuthState> {
  sessionRestoration ??= Promise.all([
    window.kontave.auth.getState(),
    desktopConnectivityStore.initialize(),
  ])
    .then(([state]) => {
      synchronizeConnectivityBlock();
      startupLease.release();
      return state;
    })
    .catch((cause: unknown) => {
      startupLease.update({
        state: "failed",
        message: "No pudimos iniciar Kontave",
        description: "No fue posible restaurar tu espacio de trabajo.",
        actions: [
          { kind: "retry", label: "Reintentar" },
          { kind: "exit", label: "Salir" },
        ],
      });
      throw cause;
    });

  return sessionRestoration;
}

export function handleGlobalInteractionAction(token: string, action: InteractionBlockActionKind): void {
  const snapshot = interactionGate.getSnapshot();
  if (snapshot.status !== "blocked" || snapshot.activeBlock.token !== token) return;

  if (action === "retry") {
    if (snapshot.activeBlock.kind === "connectivity") {
      void desktopConnectivityStore.refresh();
      return;
    }
    window.location.reload();
    return;
  }

  if (action === "exit") window.close();
}

export function clientInteractionAvailable(): boolean {
  return interactionGate.getSnapshot().status === "available";
}

function synchronizeConnectivityBlock(): void {
  const connectivity = desktopConnectivityStore.getSnapshot();
  const unavailable = connectivity.availability === "unavailable"
    || (connectivity.availability === "unknown" && connectivity.reason !== null);

  if (unavailable) {
    connectivityLease ??= interactionGate.acquire({
      kind: "connectivity",
      state: "waiting",
      priority: 800,
      message: "Sin conexión",
      description: "Intentando reconectar automáticamente.",
      actions: [{ kind: "retry", label: "Reintentar" }],
    });
    return;
  }

  if (connectivity.availability === "available" || connectivity.availability === "degraded") {
    connectivityLease?.release();
    connectivityLease = null;
  }
}
