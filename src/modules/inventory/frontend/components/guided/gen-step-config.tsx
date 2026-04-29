"use client";

import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { GuidedStepShell, StepSection } from "@/src/modules/payroll/frontend/components/guided/guided-step-shell";

export type GenMode = "monto" | "margen";

export interface GenStepConfigProps {
    period: string;
    setPeriod: (v: string) => void;
    mode: GenMode;
    setMode: (v: GenMode) => void;
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

// Same chevron-style picker as /inventory/sales — keeps the visual language
// consistent across the inventory module.
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

function isValidTarget(str: string): boolean {
    const n = Number(str.replace(",", "."));
    return Number.isFinite(n) && n > 0;
}

export function GenStepConfig({
    period,
    setPeriod,
    mode,
    setMode,
    targetStr,
    setTargetStr,
    onNext,
}: GenStepConfigProps) {
    const nextDisabled = !period || !isValidTarget(targetStr);

    return (
        <GuidedStepShell
            title="¿Cuándo y cuánto quieres generar?"
            subtitle="Elige el período del mes y define el objetivo en bolívares o como porcentaje sobre las entradas registradas."
            onNext={onNext}
            nextDisabled={nextDisabled}
            centerHeader
        >
            <StepSection
                title="Período"
                description="Mes del cual se distribuirán las salidas."
            >
                <PeriodPicker period={period} onChange={setPeriod} />
            </StepSection>

            <StepSection
                title="Tipo de objetivo"
                description="Monto Bs: distribuye exactamente esa cifra S/IVA. Margen %: el target se calcula como entradas × (1 + margen/100)."
            >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className={labelCls}>Modalidad</label>
                        <div className="flex rounded-lg border border-border-light overflow-hidden bg-surface-1">
                            {([
                                { v: "monto",  l: "Monto Bs." },
                                { v: "margen", l: "Margen %"  },
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
                            {mode === "monto" ? "Total en Bs (sin IVA)" : "% sobre entradas"}
                        </label>
                        <input
                            inputMode="decimal"
                            className={fieldCls}
                            value={targetStr}
                            placeholder={mode === "monto" ? "120.000,00" : "20"}
                            onChange={(e) => setTargetStr(e.target.value)}
                            autoFocus
                        />
                        {targetStr && !isValidTarget(targetStr) && (
                            <p className="mt-1.5 font-mono text-[11px] text-red-400">
                                Ingresa un número mayor a 0
                            </p>
                        )}
                    </div>
                </div>
            </StepSection>
        </GuidedStepShell>
    );
}
