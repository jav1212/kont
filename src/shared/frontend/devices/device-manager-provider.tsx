"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createIncidentCode } from "@/src/core/errors/incident-code";
import { reportClientError } from "@/src/shared/frontend/utils/report-client-error";
import { DEVICE_PROTOCOL_VERSION, parseDeviceManagerEvent, type BarcodeScannedEvent, type DeviceInfo, type DeviceStatus } from "../../devices/device-contracts";

export type DeviceContextName = "purchase" | "sale" | "product-capture";
type Listener = (event: BarcodeScannedEvent) => void;
interface DeviceManagerContextValue {
    enabled: boolean; setEnabled: (value: boolean) => void; available: boolean; paired: boolean; pairing: boolean;
    status: DeviceStatus; managerVersion: string | null; device: DeviceInfo | null; lastError: string | null; lastScan: BarcodeScannedEvent | null;
    requestPairing: () => void; forgetPairing: () => void; reconnect: () => void;
    subscribe: (context: DeviceContextName, listener: Listener) => () => void;
}
const DeviceManagerContext = createContext<DeviceManagerContextValue | null>(null);
const ENABLED_KEY = "kontave.devices.enabled"; const TOKEN_KEY = "kontave.devices.token";

export function DeviceManagerProvider({ children }: { children: React.ReactNode }) {
    const [enabled, setEnabledState] = useState(false); const [available, setAvailable] = useState(false); const [paired, setPaired] = useState(false); const [pairing, setPairing] = useState(false);
    const [status, setStatus] = useState<DeviceStatus>("disconnected"); const [managerVersion, setManagerVersion] = useState<string | null>(null); const [device, setDevice] = useState<DeviceInfo | null>(null); const [lastError, setLastError] = useState<string | null>(null); const [lastScan, setLastScan] = useState<BarcodeScannedEvent | null>(null); const [generation, setGeneration] = useState(0);
    const socketRef = useRef<WebSocket | null>(null); const listeners = useRef(new Map<DeviceContextName, Set<Listener>>()); const seen = useRef(new Set<string>()); const reportedErrors = useRef(new Set<string>());
    useEffect(() => setEnabledState(localStorage.getItem(ENABLED_KEY) === "true"), []);
    const setEnabled = useCallback((value: boolean) => { localStorage.setItem(ENABLED_KEY, String(value)); setEnabledState(value); if (!value) { setAvailable(false); setPaired(false); setStatus("disconnected"); } }, []);
    const reconnect = useCallback(() => setGeneration((value) => value + 1), []);
    const requestPairing = useCallback(() => { const socket = socketRef.current; if (!socket || socket.readyState !== WebSocket.OPEN) return setLastError("Kontave Device Manager no está disponible"); setPairing(true); setLastError(null); socket.send(JSON.stringify({ type: "pairing.request", clientName: "Kontave Web", protocolVersion: DEVICE_PROTOCOL_VERSION })); }, []);
    const forgetPairing = useCallback(() => { localStorage.removeItem(TOKEN_KEY); setPaired(false); setGeneration((value) => value + 1); }, []);
    const subscribe = useCallback((context: DeviceContextName, listener: Listener) => { const group = listeners.current.get(context) ?? new Set<Listener>(); group.add(listener); listeners.current.set(context, group); return () => { group.delete(listener); if (!group.size) listeners.current.delete(context); }; }, []);
    useEffect(() => {
        if (!enabled) return; let socket: WebSocket | null = null; let timer: ReturnType<typeof setTimeout> | undefined; let stopped = false; let retry = 0; const delays = [1000, 2000, 5000, 10000, 30000];
        const connect = () => { if (stopped) return; setStatus(retry ? "reconnecting" : "connecting"); const base = process.env.NEXT_PUBLIC_DEVICE_MANAGER_URL ?? "wss://localhost:47831"; const token = localStorage.getItem(TOKEN_KEY); const url = new URL(base); if (token) url.searchParams.set("token", token); socket = new WebSocket(url); socketRef.current = socket;
            socket.onopen = () => { retry = 0; setAvailable(true); setLastError(null); socket?.send(JSON.stringify({ type: "client.hello", protocolVersion: DEVICE_PROTOCOL_VERSION })); };
            socket.onmessage = ({ data }) => { try { const event = parseDeviceManagerEvent(JSON.parse(String(data)) as unknown); if (!event) throw new Error();
                if (event.type === "manager.hello") { setManagerVersion(event.managerVersion); setPaired(event.paired); if (!event.paired && token) localStorage.removeItem(TOKEN_KEY); if (event.protocolVersion !== DEVICE_PROTOCOL_VERSION) setLastError("La versión de Kontave Device Manager no es compatible"); }
                if (event.type === "pairing.result") { setPairing(false); setPaired(event.approved); if (event.approved && event.token) localStorage.setItem(TOKEN_KEY, event.token); if (!event.approved) setLastError(event.message ?? "Emparejamiento rechazado"); }
                if (event.type === "device.status") { setStatus(event.status); setDevice(event.device); if (event.message) setLastError(event.message); }
                if (event.type === "manager.error") {
                    setLastError(event.message);
                    const deduplicationKey = event.eventId ?? `${event.code}:${event.message}:${event.occurredAt ?? ""}`;
                    if (!reportedErrors.current.has(deduplicationKey)) {
                        reportedErrors.current.add(deduplicationKey);
                        if (reportedErrors.current.size > 200) reportedErrors.current.delete(reportedErrors.current.values().next().value!);
                        reportClientError({
                            code: createIncidentCode(),
                            message: "Error en Kontave Device Manager",
                            technicalMessage: event.message,
                            source: "network",
                            route: "/device-manager",
                            metadata: { managerErrorCode: event.code, managerVersion: event.managerVersion, installId: event.installId, occurredAt: event.occurredAt },
                        });
                    }
                }
                if (event.type !== "barcode.scanned") return; setLastScan(event); if (document.visibilityState !== "visible" || !document.hasFocus() || seen.current.has(event.eventId)) return; seen.current.add(event.eventId); if (seen.current.size > 200) seen.current.delete(seen.current.values().next().value!); const capture = listeners.current.get("product-capture"); const targets = capture?.size ? capture : new Set([...(listeners.current.get("purchase") ?? []), ...(listeners.current.get("sale") ?? [])]); targets.forEach((listener) => listener(event));
            } catch { setLastError("El administrador de dispositivos envió un mensaje inválido"); } };
            socket.onerror = () => setLastError("No se pudo conectar con Kontave Device Manager"); socket.onclose = () => { if (stopped) return; setAvailable(false); setStatus("reconnecting"); timer = setTimeout(connect, delays[Math.min(retry++, delays.length - 1)]); };
        }; connect(); return () => { stopped = true; if (timer) clearTimeout(timer); socketRef.current = null; socket?.close(); };
    }, [enabled, generation]);
    const value = useMemo(() => ({ enabled, setEnabled, available, paired, pairing, status, managerVersion, device, lastError, lastScan, requestPairing, forgetPairing, reconnect, subscribe }), [enabled, setEnabled, available, paired, pairing, status, managerVersion, device, lastError, lastScan, requestPairing, forgetPairing, reconnect, subscribe]);
    return <DeviceManagerContext.Provider value={value}>{children}</DeviceManagerContext.Provider>;
}
export function useDeviceManager() { const value = useContext(DeviceManagerContext); if (!value) throw new Error("useDeviceManager must be used inside DeviceManagerProvider"); return value; }
export function useDeviceSubscription(context: DeviceContextName, listener: Listener, active = true): void { const { subscribe } = useDeviceManager(); const reference = useRef(listener); useEffect(() => { reference.current = listener; }, [listener]); useEffect(() => active ? subscribe(context, (event) => reference.current(event)) : undefined, [active, context, subscribe]); }
