"use client";
import { Barcode, CheckCircle2, Download, Link2, RefreshCw, ShieldCheck, Unplug } from "lucide-react";
import { SettingsSection } from "@/src/shared/frontend/components/settings-section";
import { useDeviceManager } from "@/src/shared/frontend/devices/device-manager-provider";

const statusLabels = { disconnected: "Desconectado", detecting: "Buscando dispositivos", connecting: "Conectando", connected: "Conectado", reconnecting: "Reconectando", error: "Dispositivo no encontrado" } as const;

export function DevicesSettingsClient({ downloadUrl }: { downloadUrl: string | null }) {
    const manager = useDeviceManager();
    return <div className="space-y-6">
        <SettingsSection title="Kontave Device Manager" subtitle="Conecta de forma segura los dispositivos físicos de este equipo con Kontave.">
            <div className="grid gap-3 sm:grid-cols-3"><Status label="Aplicación local" value={manager.available ? "Detectada" : "No detectada"} ok={manager.available} /><Status label="Emparejamiento" value={manager.paired ? "Autorizado" : "Pendiente"} ok={manager.paired} /><Status label="Dispositivo" value={statusLabels[manager.status]} ok={manager.status === "connected"} /></div>
            {manager.lastError && <p role="alert" className="mt-4 rounded-lg border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">{manager.lastError}</p>}
            <div className="mt-5 flex flex-wrap gap-2">
                {!manager.enabled && <Action icon={<Link2 size={15} />} onClick={() => manager.setEnabled(true)}>Buscar aplicación</Action>}
                {manager.enabled && !manager.available && <Action icon={<RefreshCw size={15} />} onClick={manager.reconnect}>Reintentar</Action>}
                {manager.available && !manager.paired && <Action icon={<ShieldCheck size={15} />} onClick={manager.requestPairing} disabled={manager.pairing}>{manager.pairing ? "Esperando autorización…" : "Emparejar este navegador"}</Action>}
                {manager.paired && <Action icon={<Unplug size={15} />} onClick={manager.forgetPairing} secondary>Olvidar emparejamiento</Action>}
            </div>
        </SettingsSection>
        <SettingsSection title="Dispositivo activo" subtitle="Información reportada por el administrador local.">
            {manager.device ? <dl className="grid gap-4 sm:grid-cols-2"><Detail label="Equipo" value={`${manager.device.manufacturer} ${manager.device.model}`} /><Detail label="Tipo" value={manager.device.category} /><Detail label="Conexión" value={manager.device.connection} /><Detail label="Versión" value={manager.managerVersion ?? "—"} /></dl> : <div className="flex items-center gap-3 text-sm text-[var(--text-secondary)]"><Barcode size={20} /><span>No hay un dispositivo conectado. Para el QW2100 selecciona el modo USB-COM-STD.</span></div>}
        </SettingsSection>
        <SettingsSection title="Instalación" subtitle="Cada computadora que utilizará dispositivos físicos debe tener instalada esta aplicación.">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><Download className="mt-0.5 shrink-0 text-primary-500" size={20} /><div><p className="text-sm font-semibold text-foreground">Kontave Device Manager para Windows</p><p className="mt-1 text-xs text-[var(--text-tertiary)]">Se inicia con Windows y recibe actualizaciones automáticas desde GitHub Releases.</p></div></div>{downloadUrl ? <a href={downloadUrl} className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary-500 px-4 text-xs font-semibold text-white transition hover:bg-primary-600"><Download size={15} />Descargar para Windows</a> : <span className="shrink-0 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-xs font-semibold text-warning-700">Descarga pendiente de publicación</span>}</div>
        </SettingsSection>
    </div>;
}
function Status({ label, value, ok }: { label: string; value: string; ok: boolean }) { return <div className="rounded-xl border border-border-light bg-surface-2 p-4"><div className="flex items-center gap-2">{ok ? <CheckCircle2 size={16} className="text-success" /> : <span className="h-2.5 w-2.5 rounded-full bg-[var(--text-tertiary)]" />}<span className="text-sm font-semibold text-foreground">{value}</span></div><p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">{label}</p></div>; }
function Detail({ label, value }: { label: string; value: string }) { return <div><dt className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">{label}</dt><dd className="mt-1 text-sm font-semibold text-foreground">{value}</dd></div>; }
function Action({ children, icon, onClick, disabled, secondary }: { children: React.ReactNode; icon: React.ReactNode; onClick: () => void; disabled?: boolean; secondary?: boolean }) { return <button type="button" disabled={disabled} onClick={onClick} className={`inline-flex h-9 items-center gap-2 rounded-lg px-4 text-xs font-semibold transition disabled:opacity-50 ${secondary ? "border border-border-light bg-surface-1 text-foreground hover:bg-surface-2" : "bg-primary-500 text-white hover:bg-primary-600"}`}>{icon}{children}</button>; }
