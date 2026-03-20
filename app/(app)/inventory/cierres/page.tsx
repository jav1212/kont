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
    const [saving, setSaving]               = useState(false);
    const [confirm, setConfirm]             = useState(false);

    useEffect(() => {
        if (companyId) loadCierres(companyId);
    }, [companyId, loadCierres]);

    const isClosed = cierres.some((c) => c.periodo === closingPeriod);

    async function handleClose() {
        if (!companyId) return;
        setSaving(true);
        const ok = await saveCierre(companyId, closingPeriod, closingNotas);
        setSaving(false);
        setConfirm(false);
        if (ok) {
            setClosingNotas("");
            setClosingPeriod(currentPeriod());
        }
    }

    const fieldCls = [
        "w-full h-9 px-3 rounded-lg border border-border-light bg-surface-1 outline-none",
        "font-mono text-[13px] text-foreground",
        "focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150",
    ].join(" ");

    const labelCls = "font-mono text-[9px] uppercase tracking-[0.18em] text-foreground/40 mb-1.5 block";

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            {/* Header */}
            <div className="px-8 py-6 border-b border-border-light bg-surface-1">
                <h1 className="text-[13px] font-bold uppercase tracking-[0.18em] text-foreground">
                    Cierres de período
                </h1>
                <p className="text-[10px] text-foreground/40 uppercase tracking-[0.16em] mt-0.5">
                    Gestión de períodos cerrados
                </p>
            </div>

            <div className="px-8 py-6 grid grid-cols-3 gap-6">
                {/* Left: close period form */}
                <div className="col-span-1">
                    <div className="rounded-xl border border-border-light bg-surface-1 p-5">
                        <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground mb-4">
                            Cerrar período
                        </h2>

                        {error && (
                            <div className="mb-4 px-3 py-2.5 rounded-lg border border-red-500/20 bg-red-500/[0.05] text-red-500 text-[11px]">
                                {error}
                            </div>
                        )}

                        {/* Warning */}
                        <div className="mb-4 px-3 py-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.05] text-amber-600 text-[10px] leading-relaxed">
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
                                <div className="text-[11px] text-amber-600 text-center py-2">
                                    Este período ya está cerrado.
                                </div>
                            </div>
                        ) : confirm ? (
                            <div className="mt-4 pt-4 border-t border-border-light space-y-2">
                                <p className="text-[10px] text-foreground/60 text-center">
                                    ¿Confirmar cierre de <span className="font-bold text-foreground">{closingPeriod}</span>?
                                </p>
                                <button
                                    onClick={handleClose} disabled={saving}
                                    className="w-full h-9 rounded-lg bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-[11px] uppercase tracking-[0.14em] transition-colors"
                                >
                                    {saving ? "Cerrando…" : "Sí, cerrar período"}
                                </button>
                                <button
                                    onClick={() => setConfirm(false)}
                                    className="w-full h-8 rounded-lg border border-border-medium bg-surface-1 hover:bg-surface-2 text-foreground text-[11px] uppercase tracking-[0.14em] transition-colors"
                                >
                                    Cancelar
                                </button>
                            </div>
                        ) : (
                            <div className="mt-4 pt-4 border-t border-border-light">
                                <button
                                    onClick={() => setConfirm(true)}
                                    className="w-full h-9 rounded-lg border border-red-500/30 bg-red-500/[0.05] hover:bg-red-500/[0.10] text-red-500 text-[11px] uppercase tracking-[0.14em] transition-colors"
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
                            <p className="text-[10px] uppercase tracking-[0.18em] text-foreground/40">
                                Períodos cerrados
                            </p>
                        </div>

                        {loadingCierres ? (
                            <div className="px-5 py-8 text-center text-[11px] text-foreground/40">Cargando…</div>
                        ) : cierres.length === 0 ? (
                            <div className="px-5 py-8 text-center text-[11px] text-foreground/40">
                                No hay períodos cerrados.
                            </div>
                        ) : (
                            <table className="w-full text-[11px]">
                                <thead>
                                    <tr className="border-b border-border-light">
                                        {["Período","Cerrado el","Notas"].map((h) => (
                                            <th key={h} className="px-4 py-2.5 text-left text-[9px] uppercase tracking-[0.16em] text-foreground/40 font-normal">
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {cierres.map((c) => (
                                        <tr key={c.id ?? c.periodo} className="border-b border-border-light/50 hover:bg-surface-2 transition-colors">
                                            <td className="px-4 py-2.5">
                                                <span className="inline-flex px-2 py-0.5 rounded bg-surface-2 border border-border-light text-foreground font-medium text-[10px]">
                                                    {c.periodo}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2.5 text-foreground/60 whitespace-nowrap">
                                                {c.cerradoAt ? fmtDate(c.cerradoAt) : "—"}
                                            </td>
                                            <td className="px-4 py-2.5 text-foreground/50">{c.notas || "—"}</td>
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
