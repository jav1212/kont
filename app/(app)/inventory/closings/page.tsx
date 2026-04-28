"use client";

// Period close management page.
// Allows closing accounting periods and lists all closed periods.

import { useEffect, useState } from "react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
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
        periodCloses, loadingPeriodCloses,
        loadPeriodCloses, savePeriodClose,
    } = useInventory();

    const [closingPeriod, setClosingPeriod] = useState(currentPeriod());
    const [closingNotas, setClosingNotas]   = useState("");
    const [closingTasa, setClosingTasa]     = useState<string>("");
    const [saving, setSaving]               = useState(false);
    const [confirm, setConfirm]             = useState(false);

    // BCV fetch state — combined into one object so a single setState call
    // resets all fields, avoiding multiple synchronous setState in effect.
    type BcvState = { loading: boolean; fecha: string | null; error: string | null };
    const [bcvState, setBcvState] = useState<BcvState>({ loading: false, fecha: null, error: null });
    const tasaBcvLoading = bcvState.loading;
    const tasaBcvFecha   = bcvState.fecha;
    const tasaBcvError   = bcvState.error;

    useEffect(() => {
        if (companyId) loadPeriodCloses(companyId);
    }, [companyId, loadPeriodCloses]);

    useEffect(() => {
        // last day of closing period
        const [y, m] = closingPeriod.split('-').map(Number);
        const lastDay = new Date(y, m, 0); // day 0 = last day of prev month
        const dateStr = lastDay.toISOString().split('T')[0];
        let cancelled = false;
        // Single setState call resets all three fields before the fetch.
        // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional pre-fetch reset
        setBcvState({ loading: true, fecha: null, error: null });
        fetch(`/api/bcv/rate?date=${dateStr}&code=USD`)
            .then(r => r.json())
            .then(json => {
                if (cancelled) return;
                if (json.rate) {
                    setClosingTasa(String(json.rate));
                    setBcvState(prev => ({ ...prev, fecha: json.date }));
                } else {
                    setBcvState(prev => ({ ...prev, error: json.error ?? 'Sin datos BCV' }));
                }
            })
            .catch(() => { if (!cancelled) setBcvState(prev => ({ ...prev, error: 'Error al consultar BCV' })); })
            .finally(() => { if (!cancelled) setBcvState(prev => ({ ...prev, loading: false })); });
        return () => { cancelled = true; };
    }, [closingPeriod]);

    const isClosed = periodCloses.some((c) => c.period === closingPeriod);

    async function handleClose() {
        if (!companyId) return;
        setSaving(true);
        const tasa = closingTasa ? parseFloat(closingTasa.replace(',', '.')) : null;
        const tasaFinal = (tasa !== null && !isNaN(tasa)) ? tasa : null;
        const ok = await savePeriodClose(companyId, closingPeriod, closingNotas, tasaFinal);
        setSaving(false);
        setConfirm(false);
        if (ok) {
            setClosingNotas("");
            setClosingTasa("");
            setClosingPeriod(currentPeriod());
        }
    }

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            <PageHeader title="Cierres de período" subtitle="Gestión de períodos cerrados" />

            <div className="px-8 py-6 grid grid-cols-3 gap-6">
                {/* Left: close period form */}
                <div className="col-span-1">
                    <div className="rounded-xl border border-border-light bg-surface-1 p-5">
                        <h2 className="text-[14px] font-bold uppercase tracking-[0.12em] text-foreground mb-4">
                            Cerrar período
                        </h2>


                        {/* Warning */}
                        <div className="mb-4 px-3 py-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.05] text-amber-600 text-[12px] leading-relaxed">
                            Una vez cerrado un período, no podrán registrarse movimientos en ese período.
                            Esta acción no se puede deshacer.
                        </div>

                        <div className="space-y-3">
                            <BaseInput.Field
                                label="Período a cerrar"
                                type="month"
                                value={closingPeriod}
                                onValueChange={(v) => { setClosingPeriod(v); setConfirm(false); }}
                            />

                            <div>
                                <BaseInput.Field
                                    label="Tasa BCV (Bs/USD)"
                                    type="number"
                                    min={0}
                                    step={0.0001}
                                    prefix="Bs."
                                    value={closingTasa}
                                    onValueChange={setClosingTasa}
                                    placeholder="Ej. 46.50"
                                    isDisabled={tasaBcvLoading}
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

                            <BaseInput.Field
                                label="Notas"
                                type="text"
                                value={closingNotas}
                                onValueChange={setClosingNotas}
                                placeholder="Opcional…"
                            />
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
                                <BaseButton.Root
                                    variant="danger"
                                    size="md"
                                    onClick={handleClose}
                                    disabled={saving}
                                    fullWidth
                                >
                                    {saving ? "Cerrando…" : "Sí, cerrar período"}
                                </BaseButton.Root>
                                <BaseButton.Root
                                    variant="secondary"
                                    size="md"
                                    onClick={() => setConfirm(false)}
                                    fullWidth
                                >
                                    Cancelar
                                </BaseButton.Root>
                            </div>
                        ) : (
                            <div className="mt-4 pt-4 border-t border-border-light">
                                <BaseButton.Root
                                    variant="dangerOutline"
                                    size="md"
                                    onClick={() => setConfirm(true)}
                                    fullWidth
                                >
                                    Cerrar período {closingPeriod}
                                </BaseButton.Root>
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

                        {loadingPeriodCloses ? (
                            <div className="px-5 py-8 text-center text-[13px] text-[var(--text-tertiary)]">Cargando…</div>
                        ) : periodCloses.length === 0 ? (
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
                                    {periodCloses.map((c) => (
                                        <tr key={c.id ?? c.period} className="border-b border-border-light/50 hover:bg-surface-2 transition-colors">
                                            <td className="px-4 py-2.5">
                                                <span className="inline-flex px-2 py-0.5 rounded bg-surface-2 border border-border-light text-foreground font-medium text-[12px]">
                                                    {c.period}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2.5 text-[var(--text-secondary)] whitespace-nowrap">
                                                {c.closedAt ? fmtDate(c.closedAt) : "—"}
                                            </td>
                                            <td className="px-4 py-2.5 tabular-nums text-[var(--text-secondary)]">
                                                {c.dollarRate != null
                                                    ? c.dollarRate.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 })
                                                    : "—"}
                                            </td>
                                            <td className="px-4 py-2.5 text-[var(--text-secondary)]">{c.notes || "—"}</td>
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
