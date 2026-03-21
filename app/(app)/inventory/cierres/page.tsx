"use client";

import { useEffect, useState } from "react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";

// ── helpers ──────────────────────────────────────────────────────────────────

function currentPeriod() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmtDate(iso: string) {
    try { return new Date(iso).toLocaleString("es-VE"); } catch { return iso; }
}

// ── component ─────────────────────────────────────────────────────────────────

export default function CierresPage() {
    const { companyId } = useCompany();
    const {
        cierres, loadingCierres, error, setError,
        loadCierres, saveCierre,
    } = useInventory();

    const [closingPeriod, setClosingPeriod] = useState(currentPeriod());
    const [closingNotas, setClosingNotas]   = useState("");
    const [closingTasa, setClosingTasa]     = useState<string>("");
    const [saving, setSaving]               = useState(false);
    const [confirm, setConfirm]             = useState(false);

    const [tasaBcvLoading, setTasaBcvLoading] = useState(false);
    const [tasaBcvFecha, setTasaBcvFecha]     = useState<string | null>(null);
    const [tasaBcvError, setTasaBcvError]     = useState<string | null>(null);

    useEffect(() => {
        if (companyId) loadCierres(companyId);
    }, [companyId, loadCierres]);

    useEffect(() => {
        // last day of closing period
        const [y, m] = closingPeriod.split('-').map(Number);
        const lastDay = new Date(y, m, 0); // day 0 = last day of prev month
        const dateStr = lastDay.toISOString().split('T')[0];
        let cancelled = false;
        setTasaBcvLoading(true);
        setTasaBcvFecha(null);
        setTasaBcvError(null);
        fetch(`/api/bcv/rate?date=${dateStr}&code=USD`)
            .then(r => r.json())
            .then(json => {
                if (cancelled) return;
                if (json.rate) {
                    setClosingTasa(String(json.rate));
                    setTasaBcvFecha(json.date);
                } else {
                    setTasaBcvError(json.error ?? 'Sin datos BCV');
                }
            })
            .catch(() => { if (!cancelled) setTasaBcvError('Error al consultar BCV'); })
            .finally(() => { if (!cancelled) setTasaBcvLoading(false); });
        return () => { cancelled = true; };
    }, [closingPeriod]);

    const isClosed = cierres.some((c) => c.periodo === closingPeriod);

    async function handleClose() {
        if (!companyId) return;
        setSaving(true);
        const tasa = closingTasa ? parseFloat(closingTasa.replace(',', '.')) : null;
        const ok = await saveCierre(companyId, closingPeriod, closingNotas, isNaN(tasa as number) ? null : tasa);
        setSaving(false);
        setConfirm(false);
        if (ok) {
            setClosingNotas("");
            setClosingTasa("");
            setClosingPeriod(currentPeriod());
        }
    }

    const fieldCls = [
        "w-full h-10 px-3 rounded-lg border border-border-light bg-surface-1 outline-none",
        "font-mono text-[14px] text-foreground",
        "focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150",
    ].join(" ");

    const labelCls = "font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] mb-1.5 block";

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            {/* Header */}
            <div className="px-8 py-6 border-b border-border-light bg-surface-1">
                <h1 className="text-[16px] font-bold uppercase tracking-[0.14em] text-foreground">
                    Cierres de período
                </h1>
                <p className="text-[12px] text-[var(--text-tertiary)] uppercase tracking-[0.12em] mt-0.5">
                    Gestión de períodos cerrados
                </p>
            </div>

            <div className="px-8 py-6 grid grid-cols-3 gap-6">
                {/* Left: close period form */}
                <div className="col-span-1">
                    <div className="rounded-xl border border-border-light bg-surface-1 p-5">
                        <h2 className="text-[14px] font-bold uppercase tracking-[0.12em] text-foreground mb-4">
                            Cerrar período
                        </h2>

                        {error && (
                            <div className="mb-4 px-3 py-2.5 rounded-lg border border-red-500/20 bg-red-500/[0.05] text-red-500 text-[13px]">
                                {error}
                            </div>
                        )}

                        {/* Warning */}
                        <div className="mb-4 px-3 py-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.05] text-amber-600 text-[12px] leading-relaxed">
                            Una vez cerrado un período, no podrán registrarse movimientos en ese período.
                            Esta acción no se puede deshacer.
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className={labelCls}>Período a cerrar</label>
                                <input
                                    type="month"
                                    className={fieldCls}
                                    value={closingPeriod}
                                    onChange={(e) => { setClosingPeriod(e.target.value); setConfirm(false); }}
                                />
                            </div>

                            <div>
                                <label className={labelCls}>Tasa BCV (Bs/USD)</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.0001"
                                    className={fieldCls}
                                    value={closingTasa}
                                    onChange={(e) => setClosingTasa(e.target.value)}
                                    placeholder="Ej. 46.50"
                                    disabled={tasaBcvLoading}
                                />
                                {tasaBcvLoading && (
                                    <p className="mt-1 text-[11px] text-[var(--text-tertiary)] animate-pulse">Consultando BCV…</p>
                                )}
                                {tasaBcvFecha && !tasaBcvLoading && (
                                    <p className="mt-1 text-[11px] text-green-500 uppercase tracking-[0.12em]">BCV {tasaBcvFecha}</p>
                                )}
                                {tasaBcvError && !tasaBcvLoading && (
                                    <p className="mt-1 text-[11px] text-amber-500 uppercase tracking-[0.10em]">{tasaBcvError} — ingresa manualmente</p>
                                )}
                            </div>

                            <div>
                                <label className={labelCls}>Notas</label>
                                <input
                                    className={fieldCls}
                                    value={closingNotas}
                                    onChange={(e) => setClosingNotas(e.target.value)}
                                    placeholder="Opcional…"
                                />
                            </div>
                        </div>

                        {isClosed ? (
                            <div className="mt-4 pt-4 border-t border-border-light">
                                <div className="text-[13px] text-amber-600 text-center py-2">
                                    Este período ya está cerrado.
                                </div>
                            </div>
                        ) : confirm ? (
                            <div className="mt-4 pt-4 border-t border-border-light space-y-2">
                                <p className="text-[12px] text-[var(--text-secondary)] text-center">
                                    ¿Confirmar cierre de <span className="font-bold text-foreground">{closingPeriod}</span>?
                                </p>
                                <button
                                    onClick={handleClose} disabled={saving}
                                    className="w-full h-9 rounded-lg bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-[12px] uppercase tracking-[0.12em] transition-colors"
                                >
                                    {saving ? "Cerrando…" : "Sí, cerrar período"}
                                </button>
                                <button
                                    onClick={() => setConfirm(false)}
                                    className="w-full h-9 rounded-lg border border-border-medium bg-surface-1 hover:bg-surface-2 text-foreground text-[12px] uppercase tracking-[0.12em] transition-colors"
                                >
                                    Cancelar
                                </button>
                            </div>
                        ) : (
                            <div className="mt-4 pt-4 border-t border-border-light">
                                <button
                                    onClick={() => setConfirm(true)}
                                    className="w-full h-9 rounded-lg border border-red-500/30 bg-red-500/[0.05] hover:bg-red-500/[0.10] text-red-500 text-[12px] uppercase tracking-[0.12em] transition-colors"
                                >
                                    Cerrar período {closingPeriod}
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: closed periods table */}
                <div className="col-span-2">
                    <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden">
                        <div className="px-5 py-3 border-b border-border-light">
                            <p className="text-[12px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                                Períodos cerrados
                            </p>
                        </div>

                        {loadingCierres ? (
                            <div className="px-5 py-8 text-center text-[13px] text-[var(--text-tertiary)]">Cargando…</div>
                        ) : cierres.length === 0 ? (
                            <div className="px-5 py-8 text-center text-[13px] text-[var(--text-tertiary)]">
                                No hay períodos cerrados.
                            </div>
                        ) : (
                            <table className="w-full text-[13px]">
                                <thead>
                                    <tr className="border-b border-border-light">
                                        {["Período","Cerrado el","Tasa BCV","Notas"].map((h) => (
                                            <th key={h} className="px-4 py-2.5 text-left text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] font-normal">
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {cierres.map((c) => (
                                        <tr key={c.id ?? c.periodo} className="border-b border-border-light/50 hover:bg-surface-2 transition-colors">
                                            <td className="px-4 py-2.5">
                                                <span className="inline-flex px-2 py-0.5 rounded bg-surface-2 border border-border-light text-foreground font-medium text-[12px]">
                                                    {c.periodo}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2.5 text-[var(--text-secondary)] whitespace-nowrap">
                                                {c.cerradoAt ? fmtDate(c.cerradoAt) : "—"}
                                            </td>
                                            <td className="px-4 py-2.5 tabular-nums text-[var(--text-secondary)]">
                                                {c.tasaDolar != null
                                                    ? c.tasaDolar.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 })
                                                    : "—"}
                                            </td>
                                            <td className="px-4 py-2.5 text-[var(--text-secondary)]">{c.notas || "—"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
