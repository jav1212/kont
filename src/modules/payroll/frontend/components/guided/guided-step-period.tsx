"use client";

import { Calendar, CalendarDays, ChevronDown, RefreshCw } from "lucide-react";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { getTodayIsoDate } from "@/src/shared/frontend/utils/local-date";
import { MONTH_NAMES } from "../../utils/period-info";
import type { GuidedPayrollState } from "../../hooks/use-guided-payroll-state";
import { GuidedStepShell, StepSection, AdvancedDisclosure } from "./guided-step-shell";

interface Props {
    state: GuidedPayrollState;
    onNext: () => void;
}

function DayStat({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
    return (
        <div className="flex flex-col items-center gap-0.5">
            <span
                className={[
                    "font-mono text-[22px] font-black tabular-nums",
                    muted ? "text-[var(--text-tertiary)]" : "text-foreground",
                ].join(" ")}
            >
                {value}
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                {label}
            </span>
        </div>
    );
}

export function GuidedStepPeriod({ state, onNext }: Props) {
    const {
        periodoMode, setPeriodoMode,
        selYear, setSelYear, selMonth, setSelMonth,
        selQuincena, setSelQuincena,
        selWeekMonday, setSelWeekMonday,
        mondaysOfMonth, activePeriodInfo,
        bcvDate, setBcvDate, exchangeRate, setExchangeRate,
        bcvLoading, bcvFetchError, fetchBcvRate,
        monthlySalary, setMonthlySalary,
    } = state;

    const now = new Date();
    const validBcv = (parseFloat(exchangeRate) || 0) > 0;

    return (
        <GuidedStepShell
            title="¿Cuándo y cómo paga la nómina?"
            subtitle="Elija la modalidad y el período de pago. La tasa BCV se cargará automáticamente para esa fecha."
            onNext={onNext}
            nextDisabled={!validBcv}
        >
            <StepSection
                title="Modalidad de pago"
                description="¿Paga cada quincena (dos pagos al mes) o cada semana?"
            >
                <div className="grid grid-cols-2 gap-3">
                    <button
                        onClick={() => setPeriodoMode("quincenal")}
                        className={[
                            "flex items-center justify-center gap-2 h-14 rounded-xl border font-mono text-[14px] uppercase tracking-[0.12em] transition-all shadow-sm",
                            periodoMode === "quincenal"
                                ? "bg-primary-500/10 border-primary-500/60 text-primary-600 font-bold ring-1 ring-primary-500/40"
                                : "bg-surface-1 border-border-light text-[var(--text-secondary)] hover:border-border-medium hover:text-foreground",
                        ].join(" ")}
                    >
                        <CalendarDays size={18} /> Quincenal
                    </button>
                    <button
                        onClick={() => setPeriodoMode("semanal")}
                        className={[
                            "flex items-center justify-center gap-2 h-14 rounded-xl border font-mono text-[14px] uppercase tracking-[0.12em] transition-all shadow-sm",
                            periodoMode === "semanal"
                                ? "bg-primary-500/10 border-primary-500/60 text-primary-600 font-bold ring-1 ring-primary-500/40"
                                : "bg-surface-1 border-border-light text-[var(--text-secondary)] hover:border-border-medium hover:text-foreground",
                        ].join(" ")}
                    >
                        <Calendar size={18} /> Semanal
                    </button>
                </div>
            </StepSection>

            <StepSection title="Período" description="Mes, año y quincena/semana a calcular.">
                <div className="grid grid-cols-2 gap-3 mb-4">
                    <div>
                        <label className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] mb-1.5 block">
                            Mes
                        </label>
                        <div className="relative">
                            <select
                                value={selMonth}
                                onChange={(e) => setSelMonth(Number(e.target.value))}
                                className="w-full h-11 px-3 pr-9 rounded-lg border border-border-light bg-surface-1 outline-none font-mono text-[14px] text-foreground appearance-none focus:border-primary-500/60 hover:border-border-medium transition-colors"
                            >
                                {MONTH_NAMES.map((name, i) => (
                                    <option key={i + 1} value={i + 1}>{name}</option>
                                ))}
                            </select>
                            <ChevronDown
                                size={16}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] mb-1.5 block">
                            Año
                        </label>
                        <div className="relative">
                            <select
                                value={selYear}
                                onChange={(e) => setSelYear(Number(e.target.value))}
                                className="w-full h-11 px-3 pr-9 rounded-lg border border-border-light bg-surface-1 outline-none font-mono text-[14px] text-foreground tabular-nums appearance-none focus:border-primary-500/60 hover:border-border-medium transition-colors"
                            >
                                {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                                    <option key={y} value={y}>{y}</option>
                                ))}
                            </select>
                            <ChevronDown
                                size={16}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none"
                            />
                        </div>
                    </div>
                </div>

                {periodoMode === "quincenal" && (
                    <div>
                        <label className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] mb-2 block">
                            Quincena
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => setSelQuincena(1)}
                                className={[
                                    "h-11 rounded-lg border font-mono text-[13px] uppercase tracking-[0.12em] transition-all",
                                    selQuincena === 1
                                        ? "bg-primary-500/10 border-primary-500/60 text-primary-600 font-bold"
                                        : "bg-surface-1 border-border-light text-[var(--text-secondary)] hover:border-border-medium",
                                ].join(" ")}
                            >
                                1 al 15
                            </button>
                            <button
                                onClick={() => setSelQuincena(2)}
                                className={[
                                    "h-11 rounded-lg border font-mono text-[13px] uppercase tracking-[0.12em] transition-all",
                                    selQuincena === 2
                                        ? "bg-primary-500/10 border-primary-500/60 text-primary-600 font-bold"
                                        : "bg-surface-1 border-border-light text-[var(--text-secondary)] hover:border-border-medium",
                                ].join(" ")}
                            >
                                16 al fin
                            </button>
                        </div>
                    </div>
                )}

                {periodoMode === "semanal" && (
                    <div>
                        <label className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] mb-2 block">
                            Semanas del mes (lunes a domingo)
                        </label>
                        <div className="grid grid-cols-1 gap-2">
                            {mondaysOfMonth.map((monday, i) => {
                                const sun = new Date(monday + "T00:00:00");
                                sun.setDate(sun.getDate() + 6);
                                const startFmt = new Date(monday + "T00:00:00").toLocaleDateString("es-VE", { day: "2-digit", month: "short" });
                                const endFmt = sun.toLocaleDateString("es-VE", { day: "2-digit", month: "short" });
                                const isSel = selWeekMonday === monday;
                                return (
                                    <button
                                        key={monday}
                                        onClick={() => setSelWeekMonday(monday)}
                                        className={[
                                            "flex items-center justify-between px-4 py-3 rounded-lg border font-mono transition-all",
                                            isSel
                                                ? "bg-primary-500/10 border-primary-500/60"
                                                : "bg-surface-1 border-border-light hover:border-border-medium",
                                        ].join(" ")}
                                    >
                                        <span className={["text-[13px] font-bold uppercase tracking-wider", isSel ? "text-primary-600" : "text-[var(--text-secondary)]"].join(" ")}>
                                            Semana {i + 1}
                                        </span>
                                        <span className={["text-[12px] tabular-nums", isSel ? "text-primary-600/80" : "text-[var(--text-tertiary)]"].join(" ")}>
                                            {startFmt} – {endFmt}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                <div className="mt-5 px-5 py-4 rounded-xl border border-border-light bg-surface-2 flex items-center justify-around">
                    <DayStat label="Norm" value={activePeriodInfo.weekdays} />
                    <div className="w-px h-7 bg-border-light" />
                    <DayStat label="Sáb" value={activePeriodInfo.saturdays} />
                    <div className="w-px h-7 bg-border-light" />
                    <DayStat label="Dom" value={activePeriodInfo.sundays} />
                    <div className="w-px h-7 bg-border-light" />
                    <DayStat label="Lun" value={activePeriodInfo.mondays} muted />
                    {activePeriodInfo.holidays > 0 && (
                        <>
                            <div className="w-px h-7 bg-border-light" />
                            <DayStat label="Fer" value={activePeriodInfo.holidays} />
                        </>
                    )}
                </div>
                {activePeriodInfo.holidayList.length > 0 && (
                    <div className="mt-3 px-4 py-3 rounded-lg border border-primary-500/20 bg-primary-500/[0.04] space-y-1">
                        {activePeriodInfo.holidayList.map((h) => (
                            <div key={h.date} className="flex items-center justify-between">
                                <span className="font-mono text-[13px] text-[var(--text-secondary)]">{h.name}</span>
                                <span className="font-mono text-[13px] tabular-nums text-primary-500">
                                    {new Date(h.date + "T00:00:00").toLocaleDateString("es-VE", { day: "2-digit", month: "short" })}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </StepSection>

            <StepSection
                title="Tasa de cambio (BCV)"
                description="Bolívares por dólar. Se usa para convertir bonos en USD y mostrar el neto en dólares."
            >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                        <label className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] mb-1.5 block">
                            Fecha
                        </label>
                        <BaseInput.Field
                            type="date"
                            value={bcvDate}
                            max={getTodayIsoDate()}
                            onValueChange={(v) => setBcvDate(v)}
                        />
                    </div>
                    <div>
                        <label className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] mb-1.5 block">
                            Tasa (Bs. por $)
                        </label>
                        <div className="flex gap-2">
                            <BaseInput.Field
                                type="number"
                                step={0.01}
                                value={exchangeRate}
                                onValueChange={setExchangeRate}
                                prefix="Bs."
                                inputClassName="text-right"
                            />
                            <button
                                onClick={fetchBcvRate}
                                disabled={bcvLoading || !bcvDate}
                                title="Consultar BCV"
                                className="shrink-0 h-11 w-11 rounded-lg border border-border-light bg-surface-1 hover:bg-surface-2 hover:border-border-medium text-[var(--text-secondary)] hover:text-primary-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                            >
                                <RefreshCw size={16} className={bcvLoading ? "animate-spin" : ""} />
                            </button>
                        </div>
                    </div>
                </div>
                {bcvFetchError && (
                    <p className="mt-2 font-mono text-[12px] text-red-400">{bcvFetchError}</p>
                )}
            </StepSection>

            <AdvancedDisclosure label="Avanzado · salario de referencia">
                <p className="font-mono text-[13px] text-[var(--text-tertiary)] leading-relaxed">
                    Este salario es solo para previsualizar las fórmulas y subtotales. Cada empleado
                    siempre se calcula con su propio salario asignado en su ficha.
                </p>
                <BaseInput.Field
                    label="Salario mensual de referencia (Bs.)"
                    type="number"
                    step={0.01}
                    value={monthlySalary}
                    onValueChange={setMonthlySalary}
                    prefix="Bs."
                    inputClassName="text-right"
                />
            </AdvancedDisclosure>
        </GuidedStepShell>
    );
}
