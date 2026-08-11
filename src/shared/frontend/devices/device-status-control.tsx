"use client";
import { Barcode, Circle } from "lucide-react";
import { useDeviceManager } from "./device-manager-provider";
const labels = { disconnected: "Dispositivos desactivados", detecting: "Buscando lector", connecting: "Conectando", connected: "Lector conectado", reconnecting: "Reconectando", error: "Lector no encontrado" } as const;
export function DeviceStatusControl() {
    const { enabled, setEnabled, status, lastError, paired } = useDeviceManager(); const state = enabled ? status : "disconnected";
    return <button type="button" onClick={() => setEnabled(!enabled)} title={lastError ?? (!paired && enabled ? "Pendiente de emparejamiento" : labels[state])} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border-light bg-surface-1 px-3 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-secondary)] transition hover:bg-surface-2"><Barcode size={14} /><Circle size={7} fill="currentColor" className={state === "connected" && paired ? "text-success" : state === "error" ? "text-error" : "text-[var(--text-tertiary)]"} />{!paired && enabled ? "Emparejar dispositivo" : labels[state]}</button>;
}
