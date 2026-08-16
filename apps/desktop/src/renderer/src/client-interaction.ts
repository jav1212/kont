import {
  GlobalInteractionGate,
  type InteractionBlockLease,
  type InteractionBlockActionKind,
} from "@kontave/client-interaction-application";
import type { DesktopAuthState, DesktopWorkspaceState } from "../../shared/desktop-api";
import { desktopConnectivityStore } from "./connectivity-store";

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
let workspaceLease: InteractionBlockLease | null = null;
let settingsLease: InteractionBlockLease | null = null;
let settingsOperations = 0;
let authenticated = false;
let latestWorkspaceState: DesktopWorkspaceState = { status: "loading" };

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
    if (workspaceLease?.token === token) {
      workspaceLease.update({
        state: "working",
        message: "Restaurando tu espacio de trabajo",
        description: "Estamos obteniendo nuevamente el contexto de tu cuenta.",
        referenceCode: null,
        actions: [],
      });
      void window.kontave.workspace.refresh()
        .then((result) => {
          if (result.ok) {
            synchronizeWorkspaceBlock(result.value);
            return;
          }
          presentWorkspaceFailure(result.error.code, result.error.message);
        })
        .catch(() => presentWorkspaceFailure(
          "DESKTOP_WORKSPACE_REFRESH_FAILED",
          "No fue posible comunicar el reintento con el proceso principal.",
        ));
      return;
    }
    window.location.reload();
    return;
  }

  if (action === "exit") window.close();
}

function presentWorkspaceFailure(code: string, message: string): void {
  if (!authenticated) return;
  const input = {
    state: "failed" as const,
    message: "No pudimos cargar tu espacio de trabajo",
    description: message,
    referenceCode: code,
    actions: [
      { kind: "retry" as const, label: "Reintentar" },
      { kind: "exit" as const, label: "Salir" },
    ],
  };
  if (workspaceLease) workspaceLease.update(input);
  else workspaceLease = interactionGate.acquire({
    kind: "unexpected_failure",
    priority: 650,
    ...input,
  });
}

export function clientInteractionAvailable(): boolean {
  return interactionGate.getSnapshot().status === "available";
}

export async function runExclusiveMutation<T>(message: string, operation: () => Promise<T>): Promise<T> {
  settingsOperations += 1;
  settingsLease ??= interactionGate.acquire({
    kind: "exclusive_operation",
    state: "working",
    priority: 300,
    message,
    description: "Espera mientras Kontave confirma la operación.",
  });
  try {
    return await operation();
  } finally {
    settingsOperations -= 1;
    if (settingsOperations === 0) {
      settingsLease.release();
      settingsLease = null;
    }
  }
}

export const runSettingsMutation = runExclusiveMutation;

export function synchronizeWorkspaceBlock(workspace: DesktopWorkspaceState): void {
  latestWorkspaceState = workspace;
  if (!authenticated) {
    workspaceLease?.release();
    workspaceLease = null;
    return;
  }

  if (workspace.status === "ready") {
    workspaceLease?.release();
    workspaceLease = null;
    return;
  }

  const input = workspace.status === "loading"
    ? {
      state: "working" as const,
      message: "Restaurando tu espacio de trabajo",
      description: "Estamos obteniendo el contexto de tu cuenta.",
      referenceCode: null,
      actions: [],
    }
    : {
      state: "failed" as const,
      message: "No pudimos cargar tu espacio de trabajo",
      description: "Revisa tu sesión o vuelve a intentarlo.",
      referenceCode: "DESKTOP_WORKSPACE_REFRESH_FAILED",
      actions: [
        { kind: "retry" as const, label: "Reintentar" },
        { kind: "exit" as const, label: "Salir" },
      ],
    };

  if (workspaceLease) workspaceLease.update(input);
  else workspaceLease = interactionGate.acquire({
    kind: workspace.status === "loading" ? "startup" : "unexpected_failure",
    priority: 650,
    ...input,
  });
}

export function synchronizeAuthenticationInteraction(state: DesktopAuthState): void {
  authenticated = state.status === "authenticated";
  if (authenticated) synchronizeWorkspaceBlock(latestWorkspaceState);
  else {
    workspaceLease?.release();
    workspaceLease = null;
  }
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
