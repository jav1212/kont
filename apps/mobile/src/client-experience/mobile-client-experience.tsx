import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import Constants from "expo-constants";
import * as Clipboard from "expo-clipboard";
import * as Updates from "expo-updates";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from "react-native";
import { ConnectivityMonitor, type ConnectivityProbe } from "@kontave/client-connectivity-application";
import type { ConnectivityProbeResult, ConnectivitySnapshot } from "@kontave/client-connectivity-contracts";
import { PresentFeedback, codedErrorFeedback, type ClientFeedback, type FeedbackHandle, type FeedbackPresenter } from "@kontave/client-feedback-application";
import { GlobalInteractionGate, type InteractionBlock, type InteractionBlockLease } from "@kontave/client-interaction-application";
import { ClientUpdateCoordinator, ClientUpdateFailure, type ClientUpdateCheckResult, type ClientUpdateProvider } from "@kontave/client-updates-application";
import type { ClientUpdateCapabilities, ClientUpdateRelease, ClientUpdateSnapshot, InstalledClientRelease } from "@kontave/client-updates-contracts";
import { Button, Text, nativeTheme } from "@kontave/ui-native";

interface ClientExperienceValue {
  readonly connectivity: ConnectivitySnapshot;
  readonly feedback: PresentFeedback;
  readonly interaction: GlobalInteractionGate;
  readonly refreshConnectivity: () => Promise<ConnectivitySnapshot>;
  readonly updates: ClientUpdateCoordinator;
}

const ClientExperienceContext = createContext<ClientExperienceValue | null>(null);

export function MobileClientExperienceProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const apiBaseUrl = readApiBaseUrl();
  const monitor = useMemo(() => new ConnectivityMonitor({ probe: new MobileConnectivityProbe(new URL("/", apiBaseUrl).toString()), failureThreshold: 3 }), [apiBaseUrl]);
  const interaction = useMemo(() => new GlobalInteractionGate(), []);
  const [notices, setNotices] = useState<readonly PresentedFeedback[]>([]);
  const feedback = useMemo(() => new PresentFeedback(new MobileFeedbackPresenter(setNotices)), []);
  const updates = useMemo(() => new ClientUpdateCoordinator(new ExpoClientUpdateProvider()), []);
  const connectivity = useSyncExternalStore(monitor.subscribe, monitor.getSnapshot, monitor.getSnapshot);
  const interactionState = useSyncExternalStore(interaction.subscribe, interaction.getSnapshot, interaction.getSnapshot);
  const updateState = useSyncExternalStore(updates.subscribe, updates.getSnapshot, updates.getSnapshot);

  useEffect(() => {
    void monitor.refresh();
    const timer = setInterval(() => { void monitor.refresh(); }, 30_000);
    return () => clearInterval(timer);
  }, [monitor]);

  useEffect(() => synchronizeConnectivity(interaction, connectivity), [connectivity, interaction]);
  useEffect(() => { if (nativeUpdatesEnabled()) void updates.check(); }, [updates]);
  useEffect(() => {
    if (updateState.status !== "failed") return;
    feedback.execute(codedErrorFeedback({ code: updateState.failure.code, message: "No se pudo actualizar", deduplicationKey: "mobile-update-failed" }));
  }, [feedback, updateState]);

  const value = useMemo(() => ({ connectivity, feedback, interaction, refreshConnectivity: () => monitor.refresh(), updates }), [connectivity, feedback, interaction, monitor, updates]);
  return <ClientExperienceContext.Provider value={value}><View style={styles.root}>{children}<FeedbackViewport notices={notices} dismiss={(handle) => setNotices((current) => current.filter((item) => item.handle !== handle))} /><UpdateNotice state={updateState} coordinator={updates} />{interactionState.status === "blocked" ? <InteractionBoundary block={interactionState.activeBlock} retry={() => { void monitor.refresh(); }} /> : null}</View></ClientExperienceContext.Provider>;
}

export function useClientExperience(): ClientExperienceValue {
  const value = useContext(ClientExperienceContext);
  if (!value) throw new Error("useClientExperience requiere MobileClientExperienceProvider.");
  return value;
}

class MobileConnectivityProbe implements ConnectivityProbe {
  constructor(private readonly endpoint: string) {}
  async check(): Promise<ConnectivityProbeResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(this.endpoint, {
        method: "HEAD",
        signal: controller.signal,
        ...(Platform.OS === "web" ? { mode: "no-cors" as const } : {}),
      });
      // An opaque Web response proves that the origin is reachable even though
      // CORS intentionally prevents inspecting its status and headers.
      return response.type === "opaque" || response.status < 500
        ? { reachable: true }
        : { reachable: false, reason: "service_unreachable" };
    } catch (cause) {
      return { reachable: false, reason: cause instanceof Error && cause.name === "AbortError" ? "probe_timeout" : "network_unreachable" };
    } finally { clearTimeout(timeout); }
  }
}

let connectivityLease: InteractionBlockLease | null = null;
function synchronizeConnectivity(gate: GlobalInteractionGate, snapshot: ConnectivitySnapshot): void {
  const unavailable = snapshot.availability === "unavailable" || (snapshot.availability === "unknown" && snapshot.reason !== null);
  if (unavailable && !connectivityLease) connectivityLease = gate.acquire({ kind: "connectivity", state: "waiting", priority: 800, message: "Sin conexión", description: "Intentando reconectar automáticamente.", actions: [{ kind: "retry", label: "Reintentar" }] });
  if (!unavailable && connectivityLease) { connectivityLease.release(); connectivityLease = null; }
}

interface PresentedFeedback { readonly handle: string; readonly feedback: ClientFeedback }
class MobileFeedbackPresenter implements FeedbackPresenter {
  private sequence = 0;
  constructor(private readonly setNotices: React.Dispatch<React.SetStateAction<readonly PresentedFeedback[]>>) {}
  present(feedback: ClientFeedback): FeedbackHandle {
    const handle = `mobile-feedback-${++this.sequence}`;
    this.setNotices((current) => [...current.filter((item) => !feedback.deduplicationKey || item.feedback.deduplicationKey !== feedback.deduplicationKey), { handle, feedback }].slice(-3));
    setTimeout(() => this.dismiss(handle), 4_500);
    return handle;
  }
  dismiss(handle: FeedbackHandle): void { this.setNotices((current) => current.filter((item) => item.handle !== handle)); }
}

function FeedbackViewport({ notices, dismiss }: { readonly notices: readonly PresentedFeedback[]; readonly dismiss: (handle: string) => void }): React.JSX.Element | null {
  if (!notices.length) return null;
  return <View pointerEvents="box-none" style={styles.feedbackViewport}>{notices.map(({ handle, feedback }) => {
    const visual = feedbackVisual(feedback.intent);
    return <View key={handle} style={styles.feedback}>
      <View style={[styles.feedbackIcon, { backgroundColor: visual.background }]}><Ionicons name={visual.icon} size={23} color={visual.color} /></View>
      <View style={styles.feedbackContent}><Text style={styles.feedbackMessage}>{feedback.message}</Text>{feedback.description ? <Text style={styles.feedbackDescription}>{feedback.description}</Text> : null}{feedback.referenceCode ? <Pressable accessibilityLabel="Copiar código de error" onPress={() => { void Clipboard.setStringAsync(feedback.referenceCode!); }} style={styles.feedbackAction}><Ionicons name="copy-outline" size={14} color={nativeTheme.color.primary} /><Text style={styles.feedbackActionText}>Copiar código</Text></Pressable> : null}</View>
      <Pressable accessibilityLabel="Cerrar notificación" onPress={() => dismiss(handle)} style={({ pressed }) => [styles.feedbackClose, pressed && styles.feedbackClosePressed]}><Ionicons name="close" size={22} color="#8B91A0" /></Pressable>
    </View>;
  })}</View>;
}

function feedbackVisual(intent: ClientFeedback["intent"]): { readonly icon: keyof typeof Ionicons.glyphMap; readonly color: string; readonly background: string } {
  if (intent === "success") return { icon: "checkmark-circle-outline", color: "#168A68", background: "#DDF6EC" };
  if (intent === "warning") return { icon: "warning-outline", color: "#B36A00", background: "#FFF0D6" };
  if (intent === "error") return { icon: "alert-circle-outline", color: "#C53C32", background: "#FDE5E2" };
  return { icon: "information-circle-outline", color: "#526071", background: "#E9EDF2" };
}

function InteractionBoundary({ block, retry }: { readonly block: InteractionBlock; readonly retry: () => void }): React.JSX.Element {
  const canRetry = block.actions.some((action) => action.kind === "retry");
  return <View style={styles.blockingBackdrop}><View style={styles.blockingCard}>{block.state === "working" ? <ActivityIndicator size="large" color={nativeTheme.color.primary} /> : null}<Text style={styles.blockingTitle}>{block.message}</Text>{block.description ? <Text style={styles.blockingDescription}>{block.description}</Text> : null}{canRetry ? <Button label="Reintentar" onPress={retry} /> : null}</View></View>;
}

function UpdateNotice({ state, coordinator }: { readonly state: ClientUpdateSnapshot; readonly coordinator: ClientUpdateCoordinator }): React.JSX.Element | null {
  if (state.status !== "available" && state.status !== "ready") return null;
  const action = state.status === "available" ? () => { void coordinator.download(); } : () => { void coordinator.apply(); };
  return <View style={styles.updateNotice}><Text style={styles.updateText}>{state.status === "available" ? "Hay una actualización disponible" : "Actualización lista"}</Text><Pressable onPress={action}><Text style={styles.updateAction}>{state.status === "available" ? "Descargar" : "Reiniciar"}</Text></Pressable></View>;
}

class ExpoClientUpdateProvider implements ClientUpdateProvider {
  readonly installed: InstalledClientRelease = Object.freeze({ product: "Kontave", platform: Platform.OS, architecture: Platform.OS === "web" ? "web" : "native", channel: readUpdateChannel(), productVersion: Constants.expoConfig?.version?.trim() || "0.1.0", buildNumber: Constants.expoConfig?.ios?.buildNumber ?? (Constants.expoConfig?.android?.versionCode ? String(Constants.expoConfig.android.versionCode) : null), runtimeVersion: Updates.runtimeVersion?.trim() || null, apiVersion: null });
  readonly capabilities: ClientUpdateCapabilities = Object.freeze({ supportsBackgroundDownload: false, supportsProgress: false, applyMode: "reload" });
  async check(): Promise<ClientUpdateCheckResult> {
    if (!nativeUpdatesEnabled()) return { status: "up-to-date", checkedAt: new Date().toISOString() };
    const result = await Updates.checkForUpdateAsync();
    if (!result.isAvailable) return { status: "up-to-date", checkedAt: new Date().toISOString() };
    return { status: "available", release: { ...this.installed, productVersion: result.manifest?.id ?? this.installed.productVersion, kind: "runtime", requirement: "optional", minimumApiVersion: null, publishedAt: null, releaseNotes: null } };
  }
  async download(_release: ClientUpdateRelease, onProgress: (progress: number) => void): Promise<void> { if (!nativeUpdatesEnabled()) throw new ClientUpdateFailure("UPDATE_UNSUPPORTED", "Las actualizaciones OTA no están habilitadas.", false); onProgress(0); await Updates.fetchUpdateAsync(); onProgress(1); }
  async apply(_release: ClientUpdateRelease): Promise<void> { if (!nativeUpdatesEnabled()) throw new ClientUpdateFailure("UPDATE_UNSUPPORTED", "Las actualizaciones OTA no están habilitadas.", false); await Updates.reloadAsync(); }
}

function readApiBaseUrl(): string { const value = Constants.expoConfig?.extra?.apiBaseUrl; return typeof value === "string" && value.trim() ? value : "https://kontave.com"; }
function readUpdateChannel(): string { const channel = Updates.channel?.trim(); return channel || (__DEV__ ? "development" : "default"); }
function nativeUpdatesEnabled(): boolean { return Platform.OS !== "web" && !__DEV__ && Updates.isEnabled; }

const styles = StyleSheet.create({ root: { flex: 1 }, feedbackViewport: { bottom: 96, gap: 10, left: 14, position: "absolute", right: 14, zIndex: 30 }, feedback: { alignItems: "flex-start", backgroundColor: "#FFFFFF", borderColor: "#ECEEF2", borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, elevation: 10, flexDirection: "row", gap: 12, minHeight: 76, padding: 14, shadowColor: "#111522", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.14, shadowRadius: 22 }, feedbackIcon: { alignItems: "center", borderRadius: 13, height: 44, justifyContent: "center", width: 44 }, feedbackContent: { flex: 1, minHeight: 44, justifyContent: "center" }, feedbackMessage: { color: nativeTheme.color.text, fontSize: 14, fontWeight: "800", lineHeight: 19 }, feedbackDescription: { color: nativeTheme.color.muted, fontSize: 11, lineHeight: 16, marginTop: 2 }, feedbackAction: { alignItems: "center", alignSelf: "flex-start", flexDirection: "row", gap: 5, marginTop: 7, minHeight: 24 }, feedbackActionText: { color: nativeTheme.color.primary, fontSize: 11, fontWeight: "800" }, feedbackClose: { alignItems: "center", borderRadius: 10, height: 34, justifyContent: "center", marginRight: -6, marginTop: -5, width: 34 }, feedbackClosePressed: { backgroundColor: "#F1F2F5" }, blockingBackdrop: { alignItems: "center", backgroundColor: "rgba(17,21,34,.45)", bottom: 0, justifyContent: "center", left: 0, padding: 24, position: "absolute", right: 0, top: 0, zIndex: 40 }, blockingCard: { backgroundColor: "#FFFFFF", borderRadius: 22, gap: 12, maxWidth: 360, padding: 24, width: "100%" }, blockingTitle: { color: nativeTheme.color.text, fontSize: 21, fontWeight: "800", textAlign: "center" }, blockingDescription: { color: nativeTheme.color.muted, fontSize: 13, lineHeight: 19, textAlign: "center" }, updateNotice: { alignItems: "center", backgroundColor: "#172033", bottom: 82, flexDirection: "row", justifyContent: "space-between", left: 16, padding: 12, position: "absolute", right: 16, borderRadius: 14, zIndex: 20 }, updateText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" }, updateAction: { color: "#FF7857", fontSize: 12, fontWeight: "800" } });
