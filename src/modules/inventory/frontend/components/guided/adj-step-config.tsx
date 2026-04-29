"use client";

import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { GuidedStepShell, StepSection } from "@/src/modules/payroll/frontend/components/guided/guided-step-shell";
import type { AdjustmentBaseSource, AdjustmentMode } from "@/src/modules/inventory/frontend/hooks/use-inventory";

export interface AdjStepConfigProps {
    period: string;
    setPeriod: (v: string) => void;
    baseSource: AdjustmentBaseSource;
    setBaseSource: (v: AdjustmentBaseSource) => void;
    mode: AdjustmentMode;
    setMode: (v: AdjustmentMode) => void;
    targetStr: string;
    setTargetStr: (v: string) => void;
    onNext: () => void;
}

const labelCls =
    "font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] mb-1.5 block";

const fieldCls = [
    "h-11 px-3 rounded-lg border border-border-light bg-surface-1 outline-none w-full",
    "font-mono text-[14px] text-foreground tabular-nums",
    "focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150",
].join(" ");

const MONTHS_LONG = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
] as const;

function currentPeriodKey(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function periodLabel(key: string): string {
    const [y, m] = key.split("-");
    const month = MONTHS_LONG[(Number(m) - 1) | 0] ?? "";
    return `${month} ${y}`;
}

function shiftPeriod(key: string, delta: number): string {
    const [y, m] = key.split("-").map(Number);
    const date = new Date(y, m - 1 + delta, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function PeriodPicker({
    period,
    onChange,
}: {
    period: string;
    onChange: (next: string) => void;
}) {
    const today = currentPeriodKey();
    const isCurrent = period === today;

    return (
        <div className="inline-flex items-center gap-1 rounded-lg border border-border-light bg-surface-1 px-1 h-11">
            <button
                type="button"
                onClick={() => onChange(shiftPeriod(period, -1))}
                className="w-8 h-8 flex items-center justify-center rounded text-[var(--text-tertiary)] hover:text-foreground hover:bg-surface-2 transition-colors"
                aria-label="Mes anterior"
            >
                <ChevronLeft size={16} strokeWidth={2} />
            </button>
            <div className="px-3 flex items-center gap-2 min-w-[160px] justify-center">
                <Calendar size={13} strokeWidth={2} className="text-[var(--text-tertiary)]" />
                <span className="text-[13px] uppercase tracking-[0.12em] text-foreground tabular-nums">
                    {periodLabel(period)}
                </span>
            </div>
            <button
                type="button"
                onClick={() => onChange(shiftPeriod(period, 1))}
                className="w-8 h-8 flex items-center justify-center rounded text-[var(--text-tertiary)] hover:text-foreground hover:bg-surface-2 transition-colors"
                aria-label="Mes siguiente"
            >
                <ChevronRight size={16} strokeWidth={2} />
            </button>
            {!isCurrent && (
                <button
                    type="button"
                    onClick={() => onChange(today)}
                    className="ml-1 px-2 h-8 rounded text-[10px] uppercase tracking-[0.14em] text-primary-500 hover:bg-primary-500/10 transition-colors"
                >
                    Hoy
                </button>
            )}
        </div>
    );
}

function isValidTarget(str: string, mode: AdjustmentMode): boolean {
    const n = Number(str.replace(",", "."));
    if (!Number.isFinite(n)) return false;
    if (mode === "porcentaje") return n >= 0 && n <= 1000;
    return n >= 0;
}

export function AdjStepConfig({
    period,
    setPeriod,
    baseSource,
    setBaseSource,
    mode,
    setMode,
    targetStr,
    setTargetStr,
    onNext,
}: AdjStepConfigProps) {
    const nextDisabled = !period || !isValidTarget(targetStr, mode);

    return (
        <GuidedStepShell
            title="¿Sobre qué base y a qué monto debe cuadrar la existencia?"
            subtitle="El ajuste modifica directamente el saldo de los productos hasta que la suma (cantidad × costo promedio) coincida con el target. NO crea movimientos en el kardex."
            onNext={onNext}
            nextDisabled={nextDisabled}
            centerHeader
        >
            <StepSection
                title="Período"
                description="Mes cuyas Entradas Bs o Ventas S/IVA Bs sirven como base de cálculo."
            >
                <PeriodPicker period={period} onChange={setPeriod} />
            </StepSection>

            <StepSection
                title="Base de cálculo"
                description="Se lee del balance del período seleccionado. El target se aplica sobre esta cifra cuando el modo es porcentaje."
            >
                <div className="flex rounded-lg border border-border-light overflow-hidden bg-surface-1">
                    {([
                        { v: "entradas", l: "Entradas (Bs)",     d: "costo de las compras del periodo" },
                        { v: "ventas",   l: "Ventas S/IVA (Bs)", d: "precio de venta × cantidad despachada" },
                    ] as const).map((b) => (
                        <button
                            key={b.v}
                            type="button"
                            onClick={() => setBaseSource(b.v)}
                            className={[
                                "flex-1 px-4 py-3 text-left transition-colors font-mono",
                                baseSource === b.v
                                    ? "bg-primary-500/10"
                                    : "hover:bg-surface-2",
                            ].join(" ")}
                        >
                            <span
                                className={[
                                    "block text-[12px] uppercase tracking-[0.12em]",
                                    baseSource === b.v ? "text-primary-500 font-bold" : "text-foreground",
                                ].join(" ")}
                            >
                                {b.l}
                            </span>
                            <span className="block text-[11px] text-[var(--text-tertiary)] mt-0.5">
                                {b.d}
                            </span>
                        </button>
                    ))}
                </div>
            </StepSection>

            <StepSection
                title="Tipo de objetivo"
                description="Porcentaje: target = base × pct/100. Monto: target absoluto en Bs (la base queda como referencia)."
            >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className={labelCls}>Modalidad</label>
                        <div className="flex rounded-lg border border-border-light overflow-hidden bg-surface-1">
                            {([
                                { v: "porcentaje", l: "Porcentaje" },
                                { v: "monto",      l: "Monto Bs."  },
                            ] as const).map((m) => (
                                <button
                                    key={m.v}
                                    type="button"
                                    onClick={() => setMode(m.v)}
                                    className={[
                                        "flex-1 h-11 text-[12px] uppercase tracking-[0.12em] transition-colors font-mono",
                                        mode === m.v
                                            ? "bg-primary-500/10 text-primary-500 font-bold"
                                            : "text-[var(--text-tertiary)] hover:bg-surface-2",
                                    ].join(" ")}
                                >
                                    {m.l}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className={labelCls}>
                            {mode === "porcentaje" ? "% sobre la base" : "Total en Bs"}
                        </label>
                        <input
                            inputMode="decimal"
                            className={fieldCls}
                            value={targetStr}
                            placeholder={mode === "porcentaje" ? "80" : "120.000,00"}
                            onChange={(e) => setTargetStr(e.target.value)}
                            autoFocus
                        />
                        {targetStr && !isValidTarget(targetStr, mode) && (
                            <p className="mt-1.5 font-mono text-[11px] text-red-400">
                                {mode === "porcentaje"
                                    ? "Ingresa un porcentaje entre 0 y 1000"
                                    : "Ingresa un monto ≥ 0"}
                            </p>
                        )}
                    </div>
                </div>
            </StepSection>
        </GuidedStepShell>
    );
}
