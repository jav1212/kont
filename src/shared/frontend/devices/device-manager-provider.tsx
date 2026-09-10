"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createIncidentCode } from "@/src/core/errors/incident-code";
import { reportClientError } from "@/src/shared/frontend/utils/report-client-error";
import { ACCESS_CAPTURE_CAPABILITY, DEVICE_PROTOCOL_VERSION, parseDeviceManagerEvent, type BarcodeScannedEvent, type DeviceInfo, type DeviceStatus } from "../../devices/device-contracts";
import { KeyboardWedgeScanner, KEYBOARD_WEDGE_MAXIMUM_INTER_KEY_DELAY_MS } from "./keyboard-wedge-scanner";
import { isBadgeBarcode, mayDeliverRawBridgeScan } from "./barcode-access-policy";

/** Consumer domains for scanner data. Access is an exclusive credential flow. */
export type DeviceContextName = "purchase" | "sale" | "product-capture" | "access";
type Listener = (event: BarcodeScannedEvent) => void;
interface DeviceManagerContextValue {
    enabled: boolean; setEnabled: (value: boolean) => void; available: boolean; paired: boolean; pairing: boolean;
    status: DeviceStatus; managerVersion: string | null; device: DeviceInfo | null; keyboardDetected: boolean; lastError: string | null; lastScan: BarcodeScannedEvent | null;
    requestPairing: () => void; forgetPairing: () => void; reconnect: () => void;
    subscribe: (context: DeviceContextName, listener: Listener) => () => void;
}
const DeviceManagerContext = createContext<DeviceManagerContextValue | null>(null);
const ENABLED_KEY = "kontave.devices.enabled"; const TOKEN_KEY = "kontave.devices.token";
type EditableSnapshot = { element: HTMLInputElement | HTMLTextAreaElement; value: string; selectionStart: number | null; selectionEnd: number | null };

function captureEditableTarget(target: EventTarget | null): EditableSnapshot | null {
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) return null;
    return { element: target, value: target.value, selectionStart: target.selectionStart, selectionEnd: target.selectionEnd };
}

function restoreEditableTarget(snapshot: EditableSnapshot | null): void {
    if (!snapshot || snapshot.element.value === snapshot.value) return;
    const prototype = snapshot.element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(snapshot.element, snapshot.value);
    snapshot.element.dispatchEvent(new Event("input", { bubbles: true }));
    if (snapshot.selectionStart !== null && snapshot.selectionEnd !== null) snapshot.element.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
}

export function DeviceManagerProvider({ children }: { children: React.ReactNode }) {
    const [enabled, setEnabledState] = useState(false); const [available, setAvailable] = useState(false); const [paired, setPaired] = useState(false); const [pairing, setPairing] = useState(false);
    const [status, setStatus] = useState<DeviceStatus>("disconnected"); const [managerVersion, setManagerVersion] = useState<string | null>(null); const [device, setDevice] = useState<DeviceInfo | null>(null); const [keyboardDetected, setKeyboardDetected] = useState(false); const [lastError, setLastError] = useState<string | null>(null); const [lastScan, setLastScan] = useState<BarcodeScannedEvent | null>(null); const [generation, setGeneration] = useState(0);
    const socketRef = useRef<WebSocket | null>(null); const listeners = useRef(new Map<DeviceContextName, Set<Listener>>()); const seen = useRef(new Set<string>()); const recentBarcodes = useRef(new Map<string, { connection: string; receivedAt: number }>()); const reportedErrors = useRef(new Set<string>()); const accessLeaseId = useRef<string | null>(null); const accessHeartbeat = useRef<ReturnType<typeof setInterval> | null>(null); const bridgeSupportsAccessCapture = useRef(false);
    const [accessListenerCount, setAccessListenerCount] = useState(0);
    useEffect(() => setEnabledState(localStorage.getItem(ENABLED_KEY) === "true"), []);
    const setEnabled = useCallback((value: boolean) => { localStorage.setItem(ENABLED_KEY, String(value)); setEnabledState(value); if (!value) { setAvailable(false); setPaired(false); setKeyboardDetected(false); setStatus("disconnected"); } }, []);
    const reconnect = useCallback(() => setGeneration((value) => value + 1), []);
    const requestPairing = useCallback(() => { const socket = socketRef.current; if (!socket || socket.readyState !== WebSocket.OPEN) return setLastError("Kontave Device Manager no está disponible"); setPairing(true); setLastError(null); socket.send(JSON.stringify({ type: "pairing.request", clientName: "Kontave Web", protocolVersion: DEVICE_PROTOCOL_VERSION })); }, []);
    const forgetPairing = useCallback(() => { localStorage.removeItem(TOKEN_KEY); setPaired(false); setGeneration((value) => value + 1); }, []);
    const releaseAccessCapture = useCallback(() => {
        const socket = socketRef.current;
        if (!accessLeaseId.current || !socket || socket.readyState !== WebSocket.OPEN) return;
        socket.send(JSON.stringify({ type: "barcode.access-capture.release", protocolVersion: DEVICE_PROTOCOL_VERSION, leaseId: accessLeaseId.current }));
        accessLeaseId.current = null;
        if (accessHeartbeat.current) clearInterval(accessHeartbeat.current);
        accessHeartbeat.current = null;
    }, []);
    const requestAccessCapture = useCallback(() => {
        const socket = socketRef.current;
        if (accessLeaseId.current || !bridgeSupportsAccessCapture.current || accessListenerCount === 0 || document.visibilityState !== "visible" || !document.hasFocus() || !socket || socket.readyState !== WebSocket.OPEN) return;
        socket.send(JSON.stringify({ type: "barcode.access-capture.request", protocolVersion: DEVICE_PROTOCOL_VERSION }));
    }, [accessListenerCount]);
    const subscribe = useCallback((context: DeviceContextName, listener: Listener) => {
        const group = listeners.current.get(context) ?? new Set<Listener>();
        group.add(listener);
        listeners.current.set(context, group);
        if (context === "access") setAccessListenerCount(group.size);
        if (context === "access") requestAccessCapture();
        return () => {
            group.delete(listener);
            if (!group.size) listeners.current.delete(context);
            if (context === "access") {
                setAccessListenerCount(group.size);
                if (!group.size) releaseAccessCapture();
            }
        };
    }, [releaseAccessCapture, requestAccessCapture]);
    const deliverScan = useCallback((event: BarcodeScannedEvent) => {
        if (document.visibilityState !== "visible" || !document.hasFocus() || seen.current.has(event.eventId)) return;
        seen.current.add(event.eventId);
        if (seen.current.size > 200) seen.current.delete(seen.current.values().next().value!);

        // A badge is a credential. While the access screen owns capture, it
        // cannot reach product subscribers, lastScan, or scanner deduplication.
        const access = listeners.current.get("access");
        if (access?.size) {
            access.forEach((listener) => listener(event));
            return;
        }
        // Never retain or route a badge once no exclusive access owner exists.
        if (isBadgeBarcode(event.barcode)) return;
        setLastScan(event);

        // Drop only cross-transport duplicates. Repeated scans through the same
        // reader must still increment the product quantity.
        const receivedAt = Date.now();
        const previous = recentBarcodes.current.get(event.barcode);
        recentBarcodes.current.set(event.barcode, { connection: event.device.connection, receivedAt });
        if (recentBarcodes.current.size > 200) recentBarcodes.current.delete(recentBarcodes.current.keys().next().value!);
        if (previous && previous.connection !== event.device.connection && receivedAt - previous.receivedAt < 500) return;

        const capture = listeners.current.get("product-capture");
        const targets = capture?.size ? capture : new Set([...(listeners.current.get("purchase") ?? []), ...(listeners.current.get("sale") ?? [])]);
        targets.forEach((listener) => listener(event));
    }, []);
    useEffect(() => {
        if (accessListenerCount === 0) return;
        const resume = () => requestAccessCapture();
        const suspend = () => releaseAccessCapture();
        const onVisibility = () => document.visibilityState === "visible" && document.hasFocus() ? resume() : suspend();
        window.addEventListener("focus", resume);
        window.addEventListener("blur", suspend);
        document.addEventListener("visibilitychange", onVisibility);
        return () => {
            window.removeEventListener("focus", resume);
            window.removeEventListener("blur", suspend);
            document.removeEventListener("visibilitychange", onVisibility);
        };
    }, [accessListenerCount, releaseAccessCapture, requestAccessCapture]);
    useEffect(() => {
        if (!enabled && accessListenerCount === 0) return;
        const scanner = new KeyboardWedgeScanner();
        let lastCharacterAt = 0;
        let editableSnapshot: EditableSnapshot | null = null;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.repeat || event.isComposing || event.ctrlKey || event.altKey || event.metaKey) { scanner.reset(); return; }
            if (document.visibilityState !== "visible" || !document.hasFocus() || listeners.current.size === 0) { scanner.reset(); return; }
            const occurredAt = performance.now();
            if (event.key.length === 1) {
                if (occurredAt - lastCharacterAt > KEYBOARD_WEDGE_MAXIMUM_INTER_KEY_DELAY_MS) editableSnapshot = captureEditableTarget(event.target);
                lastCharacterAt = occurredAt;
            }
            const barcode = scanner.push(event.key, occurredAt);
            if (!barcode) return;
            event.preventDefault();
            event.stopPropagation();
            restoreEditableTarget(editableSnapshot);
            editableSnapshot = null;
            setKeyboardDetected(true);
            deliverScan({
                type: "barcode.scanned",
                eventId: crypto.randomUUID(),
                device: { id: "keyboard-wedge", category: "barcode-scanner", manufacturer: "USB", model: "Lector tipo teclado", connection: "USB-KBD/HID" },
                barcode,
                occurredAt: new Date().toISOString(),
            });
        };
        window.addEventListener("keydown", onKeyDown, true);
        return () => window.removeEventListener("keydown", onKeyDown, true);
    }, [deliverScan, enabled, accessListenerCount]);
    useEffect(() => {
        if (!enabled && accessListenerCount === 0) return; let socket: WebSocket | null = null; let timer: ReturnType<typeof setTimeout> | undefined; let stopped = false; let retry = 0; const delays = [1000, 2000, 5000, 10000, 30000];
        const connect = () => { if (stopped) return; setStatus(retry ? "reconnecting" : "connecting"); const base = process.env.NEXT_PUBLIC_DEVICE_MANAGER_URL ?? "wss://localhost:47831"; const token = localStorage.getItem(TOKEN_KEY); const url = new URL(base); if (token) url.searchParams.set("token", token); socket = new WebSocket(url); socketRef.current = socket;
            socket.onopen = () => { retry = 0; setAvailable(true); setLastError(null); socket?.send(JSON.stringify({ type: "client.hello", protocolVersion: DEVICE_PROTOCOL_VERSION })); };
            socket.onmessage = ({ data }) => { try { const event = parseDeviceManagerEvent(JSON.parse(String(data)) as unknown); if (!event) throw new Error();
                if (event.type === "manager.hello") { setManagerVersion(event.managerVersion); setPaired(event.paired); bridgeSupportsAccessCapture.current = event.paired && event.capabilities?.includes(ACCESS_CAPTURE_CAPABILITY) === true; if (!event.paired && token) localStorage.removeItem(TOKEN_KEY); if (event.protocolVersion !== DEVICE_PROTOCOL_VERSION) setLastError("La versión de Kontave Device Manager no es compatible"); else if (accessListenerCount > 0 && !bridgeSupportsAccessCapture.current) setLastError("Actualiza Kontave Device Manager para usar carnets con este lector"); if (accessListenerCount > 0 && bridgeSupportsAccessCapture.current) requestAccessCapture(); }
                if (event.type === "pairing.result") { setPairing(false); setPaired(event.approved); if (event.approved && event.token) { localStorage.setItem(TOKEN_KEY, event.token); setGeneration((value) => value + 1); } if (!event.approved) setLastError(event.message ?? "Emparejamiento rechazado"); }
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
                if (event.type === "barcode.access-capture.granted") {
                    accessLeaseId.current = event.leaseId;
                    if (accessHeartbeat.current) clearInterval(accessHeartbeat.current);
                    accessHeartbeat.current = setInterval(() => {
                        if (accessLeaseId.current && document.visibilityState === "visible" && document.hasFocus() && socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "barcode.access-capture.heartbeat", protocolVersion: DEVICE_PROTOCOL_VERSION, leaseId: accessLeaseId.current }));
                    }, 15_000);
                }
                if (event.type === "barcode.access-capture.scanned" && event.leaseId === accessLeaseId.current) deliverScan({ ...event, type: "barcode.scanned" });
                if (event.type === "barcode.scanned" && mayDeliverRawBridgeScan(accessListenerCount > 0, event.barcode)) deliverScan(event);
            } catch { setLastError("El administrador de dispositivos envió un mensaje inválido"); } };
            socket.onerror = () => setLastError("No se pudo conectar con Kontave Device Manager"); socket.onclose = () => { if (stopped) return; setAvailable(false); setStatus("reconnecting"); timer = setTimeout(connect, delays[Math.min(retry++, delays.length - 1)]); };
        }; connect(); return () => { stopped = true; if (timer) clearTimeout(timer); if (accessHeartbeat.current) clearInterval(accessHeartbeat.current); accessHeartbeat.current = null; accessLeaseId.current = null; bridgeSupportsAccessCapture.current = false; socketRef.current = null; socket?.close(); };
    }, [accessListenerCount, deliverScan, enabled, generation, requestAccessCapture]);
    const value = useMemo(() => ({ enabled, setEnabled, available, paired, pairing, status, managerVersion, device, keyboardDetected, lastError, lastScan, requestPairing, forgetPairing, reconnect, subscribe }), [enabled, setEnabled, available, paired, pairing, status, managerVersion, device, keyboardDetected, lastError, lastScan, requestPairing, forgetPairing, reconnect, subscribe]);
    return <DeviceManagerContext.Provider value={value}>{children}</DeviceManagerContext.Provider>;
}
export function useDeviceManager() { const value = useContext(DeviceManagerContext); if (!value) throw new Error("useDeviceManager must be used inside DeviceManagerProvider"); return value; }
export function useDeviceSubscription(context: DeviceContextName, listener: Listener, active = true): void { const { subscribe } = useDeviceManager(); const reference = useRef(listener); useEffect(() => { reference.current = listener; }, [listener]); useEffect(() => active ? subscribe(context, (event) => reference.current(event)) : undefined, [active, context, subscribe]); }
