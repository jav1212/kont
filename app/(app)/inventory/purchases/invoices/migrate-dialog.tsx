"use client";

// MigrateInvoicesDialog — UI for moving a batch of purchase invoices to a
// different company inside the same tenant. Surfaces:
//   - resumen (total · borradores · confirmadas)
//   - selector de empresa destino (excluye la empresa actual)
//   - aviso amarillo cuando hay confirmadas (la migración revierte y vuelve a
//     confirmar para recalcular costos en ambas empresas)
//   - botón Migrar con estado de carga
//   - resumen final con proveedores/productos auto-creados en destino
// Diseño: monoespaciado, surface-1, border-light, acento naranja (sin segundo color).

import { useMemo, useState } from "react";
import { ArrowRight, X, AlertTriangle, CheckCircle2 } from "lucide-react";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import type { Company } from "@/src/modules/companies/frontend/hooks/use-companies";
import type {
    PurchaseInvoice,
    MigratePurchaseInvoicesResult,
} from "@/src/modules/inventory/frontend/hooks/use-inventory";

interface Props {
    invoices:       PurchaseInvoice[];   // selected rows (full data, no need to refetch)
    companies:      Company[];
    sourceCompanyId: string;
    onClose:        () => void;
    onMigrate:      (
        targetCompanyId: string,
        targetPeriod:    string | null,
    ) => Promise<MigratePurchaseInvoicesResult | null>;
}

type PeriodMode = "keep" | "override";

// Note: this component is mounted/unmounted by the parent (`{open && <Dialog />}`),
// so all internal state resets naturally on each open — no useEffect needed.
export function MigrateInvoicesDialog({
    invoices, companies, sourceCompanyId, onClose, onMigrate,
}: Props) {
    const [targetId, setTargetId] = useState<string>("");
    const [periodMode, setPeriodMode] = useState<PeriodMode>("keep");
    const [overridePeriod, setOverridePeriod] = useState<string>("");
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState<MigratePurchaseInvoicesResult | null>(null);

    const targetOptions = useMemo(
        () => companies.filter((c) => c.id !== sourceCompanyId),
        [companies, sourceCompanyId],
    );

    const counts = useMemo(() => {
        const drafts    = invoices.filter((f) => f.status === "borrador").length;
        const confirmed = invoices.filter((f) => f.status === "confirmada").length;
        return { drafts, confirmed, total: invoices.length };
    }, [invoices]);

    // Períodos únicos presentes en la selección, ordenados desc.
    const sourcePeriods = useMemo(() => {
        const set = new Set<string>();
        invoices.forEach((f) => { if (f.period) set.add(f.period); });
        return Array.from(set).sort((a, b) => b.localeCompare(a));
    }, [invoices]);

    const overrideValid = /^[0-9]{4}-(0[1-9]|1[0-2])$/.test(overridePeriod);
    const periodReady = periodMode === "keep" || overrideValid;

    async function handleSubmit() {
        if (!targetId || submitting || !periodReady) return;
        setSubmitting(true);
        const period = periodMode === "override" ? overridePeriod : null;
        const res = await onMigrate(targetId, period);
        setSubmitting(false);
        if (res) setResult(res);
    }

    const targetCompany = targetOptions.find((c) => c.id === targetId);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="bg-surface-1 border border-border-light rounded-xl shadow-lg w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="px-6 py-4 border-b border-border-light flex items-center justify-between">
                    <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-foreground">
                        Migrar facturas a otra empresa
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="w-7 h-7 inline-flex items-center justify-center rounded text-[var(--text-tertiary)] hover:text-foreground hover:bg-surface-2 transition-colors disabled:opacity-40"
                        aria-label="Cerrar"
                    >
                        <X size={14} strokeWidth={2} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                    {result ? (
                        <ResultSummary result={result} />
                    ) : (
                        <PreflightSummary
                            counts={counts}
                            targetOptions={targetOptions}
                            targetId={targetId}
                            onTargetChange={setTargetId}
                            sourcePeriods={sourcePeriods}
                            periodMode={periodMode}
                            onPeriodModeChange={setPeriodMode}
                            overridePeriod={overridePeriod}
                            onOverridePeriodChange={setOverridePeriod}
                            overrideValid={overrideValid}
                        />
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-border-light flex items-center justify-end gap-3">
                    {result ? (
                        <BaseButton.Root
                            variant="primary"
                            size="md"
                            onClick={onClose}
                        >
                            Listo
                        </BaseButton.Root>
                    ) : (
                        <>
                            <BaseButton.Root
                                variant="secondary"
                                size="md"
                                onClick={onClose}
                                disabled={submitting}
                            >
                                Cancelar
                            </BaseButton.Root>
                            <BaseButton.Root
                                variant="primary"
                                size="md"
                                onClick={handleSubmit}
                                disabled={!targetId || !periodReady || submitting}
                                rightIcon={<ArrowRight size={14} strokeWidth={2} />}
                            >
                                {submitting
                                    ? "Migrando…"
                                    : `Migrar ${counts.total} ${counts.total === 1 ? "factura" : "facturas"}${
                                        targetCompany ? ` a ${targetCompany.name}` : ""
                                    }`}
                            </BaseButton.Root>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Pre-flight ──────────────────────────────────────────────────────────────

function PreflightSummary({
    counts, targetOptions, targetId, onTargetChange,
    sourcePeriods, periodMode, onPeriodModeChange,
    overridePeriod, onOverridePeriodChange, overrideValid,
}: {
    counts: { total: number; drafts: number; confirmed: number };
    targetOptions: Company[];
    targetId: string;
    onTargetChange: (id: string) => void;
    sourcePeriods: string[];
    periodMode: PeriodMode;
    onPeriodModeChange: (m: PeriodMode) => void;
    overridePeriod: string;
    onOverridePeriodChange: (p: string) => void;
    overrideValid: boolean;
}) {
    return (
        <>
            {/* Resumen */}
            <div className="rounded-lg border border-border-light bg-surface-2 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] mb-2">
                    Selección
                </div>
                <div className="flex items-baseline gap-6 tabular-nums">
                    <Stat label="Total"        value={counts.total} />
                    <Stat label="Borradores"   value={counts.drafts} />
                    <Stat label="Confirmadas"  value={counts.confirmed} />
                </div>
            </div>

            {/* Empresa destino */}
            <div className="space-y-2">
                <label className="block text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                    Empresa destino
                </label>
                {targetOptions.length === 0 ? (
                    <div className="rounded-lg border border-border-light bg-surface-2 px-4 py-3 font-sans text-[13px] text-[var(--text-tertiary)]">
                        No hay otras empresas en este tenant a las cuales migrar.
                    </div>
                ) : (
                    <select
                        value={targetId}
                        onChange={(e) => onTargetChange(e.target.value)}
                        className="w-full h-10 px-3 rounded-lg border border-border-light bg-surface-1 outline-none font-mono text-[13px] text-foreground focus:border-primary-500/60 hover:border-border-medium transition-colors"
                    >
                        <option value="">— Selecciona —</option>
                        {targetOptions.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.name} {c.rif ? `· ${c.rif}` : ""}
                            </option>
                        ))}
                    </select>
                )}
            </div>

            {/* Período destino */}
            <PeriodSection
                sourcePeriods={sourcePeriods}
                mode={periodMode}
                onModeChange={onPeriodModeChange}
                override={overridePeriod}
                onOverrideChange={onOverridePeriodChange}
                overrideValid={overrideValid}
            />

            {/* Aviso confirmadas */}
            {counts.confirmed > 0 && (
                <div className="rounded-lg border border-[var(--badge-warning-border)] bg-[var(--badge-warning-bg)] px-4 py-3 flex items-start gap-3">
                    <AlertTriangle size={16} strokeWidth={2} className="text-[var(--text-warning)] mt-0.5 shrink-0" />
                    <div className="space-y-1">
                        <p className="text-[11px] uppercase tracking-[0.12em] font-bold text-[var(--text-warning)]">
                            Hay {counts.confirmed} {counts.confirmed === 1 ? "factura confirmada" : "facturas confirmadas"}
                        </p>
                        <p className="font-sans text-[13px] text-[var(--text-warning)] leading-relaxed">
                            Se desconfirmarán en la empresa origen (revierte movimientos y costo promedio)
                            y se reconfirmarán en la empresa destino (recalcula costo promedio con esta compra como input).
                            Los asientos contables también se moverán.
                        </p>
                    </div>
                </div>
            )}

            {/* Aviso auto-creación */}
            <div className="rounded-lg border border-border-light bg-surface-1 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] mb-1">
                    Proveedores y productos
                </p>
                <p className="font-sans text-[13px] text-[var(--text-secondary)] leading-relaxed">
                    Si el proveedor (por RIF) o algún producto (por código) no existe en la empresa destino,
                    se creará automáticamente. Los productos clonados quedan con existencia y costo en cero —
                    la confirmación de la factura los carga.
                </p>
            </div>
        </>
    );
}

// ── Período destino ─────────────────────────────────────────────────────────

const MONTHS_SHORT = [
    "ene", "feb", "mar", "abr", "may", "jun",
    "jul", "ago", "sep", "oct", "nov", "dic",
] as const;

function fmtPeriod(p: string): string {
    if (!/^\d{4}-\d{2}$/.test(p)) return p;
    const [y, m] = p.split("-");
    const idx = (Number(m) - 1) | 0;
    return `${MONTHS_SHORT[idx] ?? ""} ${y}`;
}

function PeriodSection({
    sourcePeriods, mode, onModeChange, override, onOverrideChange, overrideValid,
}: {
    sourcePeriods: string[];
    mode: PeriodMode;
    onModeChange: (m: PeriodMode) => void;
    override: string;
    onOverrideChange: (p: string) => void;
    overrideValid: boolean;
}) {
    const collapsing = mode === "override" && overrideValid && sourcePeriods.length > 1;
    return (
        <div className="space-y-2">
            <label className="block text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                Período destino
            </label>

            {/* Períodos presentes en la selección */}
            {sourcePeriods.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                        En selección:
                    </span>
                    {sourcePeriods.map((p) => (
                        <span
                            key={p}
                            className="inline-flex px-2 py-0.5 rounded border border-border-light bg-surface-2 text-[11px] uppercase tracking-[0.08em] text-[var(--text-secondary)] tabular-nums"
                        >
                            {fmtPeriod(p)}
                        </span>
                    ))}
                </div>
            )}

            {/* Modo */}
            <div className="rounded-lg border border-border-light bg-surface-1 overflow-hidden">
                <RadioRow
                    selected={mode === "keep"}
                    onSelect={() => onModeChange("keep")}
                    label="Mantener período original"
                    helper="Cada factura conserva su período de origen."
                />
                <div className="border-t border-border-light" />
                <RadioRow
                    selected={mode === "override"}
                    onSelect={() => onModeChange("override")}
                    label="Cambiar todas a otro período"
                    helper="Todas las facturas seleccionadas usarán el mismo período en destino."
                />
            </div>

            {mode === "override" && (
                <div className="space-y-2 pl-1 pt-1">
                    <input
                        type="month"
                        value={override}
                        onChange={(e) => onOverrideChange(e.target.value)}
                        placeholder="YYYY-MM"
                        className={[
                            "w-44 h-10 px-3 rounded-lg border bg-surface-1 outline-none font-mono text-[13px] text-foreground tabular-nums transition-colors",
                            override && !overrideValid
                                ? "border-[var(--badge-error-border)] focus:border-[var(--text-error)]"
                                : "border-border-light hover:border-border-medium focus:border-primary-500/60",
                        ].join(" ")}
                    />
                    {override && !overrideValid && (
                        <p className="font-sans text-[12px] text-[var(--text-error)]">
                            Período inválido. Usa formato YYYY-MM.
                        </p>
                    )}
                    {collapsing && (
                        <p className="font-sans text-[12px] text-[var(--text-warning)] leading-relaxed">
                            La selección tiene {sourcePeriods.length} períodos distintos · todos se colapsarán en {fmtPeriod(override)}.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

function RadioRow({
    selected, onSelect, label, helper,
}: {
    selected: boolean;
    onSelect: () => void;
    label: string;
    helper: string;
}) {
    return (
        <button
            type="button"
            onClick={onSelect}
            className={[
                "w-full text-left px-4 py-3 flex items-start gap-3 transition-colors",
                selected ? "bg-primary-500/[0.06]" : "hover:bg-surface-2",
            ].join(" ")}
        >
            <span
                className={[
                    "mt-0.5 size-4 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors",
                    selected ? "border-primary-500" : "border-border-medium",
                ].join(" ")}
            >
                {selected && <span className="size-2 rounded-full bg-primary-500" />}
            </span>
            <span className="space-y-0.5">
                <span className="block text-[12px] uppercase tracking-[0.10em] text-foreground">
                    {label}
                </span>
                <span className="block font-sans text-[13px] text-[var(--text-tertiary)] leading-snug">
                    {helper}
                </span>
            </span>
        </button>
    );
}

function Stat({ label, value }: { label: string; value: number }) {
    return (
        <div>
            <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">{label}</div>
            <div className="text-[18px] font-bold text-foreground tabular-nums">{value}</div>
        </div>
    );
}

// ── Result ──────────────────────────────────────────────────────────────────

function ResultSummary({ result }: { result: MigratePurchaseInvoicesResult }) {
    const { migrated, skipped, createdSuppliers, createdProducts } = result;

    return (
        <>
            <div className="flex items-start gap-3 rounded-lg border border-[var(--badge-success-border)] bg-[var(--badge-success-bg)] px-4 py-3">
                <CheckCircle2 size={18} strokeWidth={2} className="text-[var(--text-success)] mt-0.5 shrink-0" />
                <div>
                    <p className="text-[12px] uppercase tracking-[0.12em] font-bold text-[var(--text-success)]">
                        {migrated.length} {migrated.length === 1 ? "factura migrada" : "facturas migradas"}
                    </p>
                    {skipped.length > 0 && (
                        <p className="font-sans text-[13px] text-[var(--text-success)] leading-relaxed mt-1">
                            {skipped.length} {skipped.length === 1 ? "fue omitida" : "fueron omitidas"} (ya estaban en la empresa destino).
                        </p>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <CreatedList
                    title="Proveedores creados"
                    items={createdSuppliers.map((s) => ({
                        primary:   s.nombre,
                        secondary: s.rif || "Sin RIF",
                    }))}
                />
                <CreatedList
                    title="Productos creados"
                    items={createdProducts.map((p) => ({
                        primary:   p.nombre,
                        secondary: p.codigo || "Sin código",
                    }))}
                />
            </div>
        </>
    );
}

function CreatedList({
    title, items,
}: {
    title: string;
    items: { primary: string; secondary: string }[];
}) {
    return (
        <div className="rounded-lg border border-border-light bg-surface-2 px-4 py-3">
            <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] mb-2 flex items-center justify-between">
                <span>{title}</span>
                <span className="tabular-nums text-foreground">{items.length}</span>
            </div>
            {items.length === 0 ? (
                <p className="font-sans text-[12px] text-[var(--text-tertiary)]">Ninguno · ya existían en destino.</p>
            ) : (
                <ul className="space-y-1.5 max-h-40 overflow-y-auto">
                    {items.map((it, i) => (
                        <li key={i} className="text-[12px] leading-tight">
                            <div className="text-foreground truncate">{it.primary}</div>
                            <div className="text-[var(--text-tertiary)] text-[11px]">{it.secondary}</div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
