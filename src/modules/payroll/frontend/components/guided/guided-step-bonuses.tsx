"use client";

import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { BonusesSection } from "../payroll-accordion-sections";
import type { GuidedPayrollState } from "../../hooks/use-guided-payroll-state";
import { GuidedStepShell, StepSection, AdvancedDisclosure } from "./guided-step-shell";

interface Props {
    state: GuidedPayrollState;
    onBack: () => void;
    onNext: () => void;
}

export function GuidedStepBonuses({ state, onBack, onNext }: Props) {
    const {
        bonusRows, bonusValues, totalBonuses,
        addBonus, updateBonus, removeBonus,
        bcvRate,
        showCestaTicket, periodoMode,
        cestaTicketUSD, setCestaTicketUSD,
        salaryMode, setSalaryMode,
        diasUtilidades, setDiasUtilidades,
        diasBonoVacacional, setDiasBonoVacacional,
        diasUtilNum, diasBonoNum,
        refSalary, alicuotaUtil, alicuotaBono, integralBase,
    } = state;

    return (
        <GuidedStepShell
            title="¿Algún bono o beneficio extra?"
            subtitle="Bonos en dólares (se convierten a bolívares con la tasa BCV) y cesta ticket si aplica."
            onBack={onBack}
            onNext={onNext}
        >
            <StepSection
                title="Bonos en USD"
                description="Cada bono se convierte automáticamente a bolívares: monto USD × tasa BCV."
            >
                <BonusesSection
                    rows={bonusRows}
                    values={bonusValues}
                    total={totalBonuses}
                    bcvRate={bcvRate}
                    onUpdate={updateBonus}
                    onRemove={removeBonus}
                    onAdd={addBonus}
                />
            </StepSection>

            {showCestaTicket && (
                <StepSection
                    title={
                        periodoMode === "semanal"
                            ? "Cesta ticket · última semana del mes"
                            : "Cesta ticket · 2ª quincena"
                    }
                    description="Beneficio mensual. Se paga una sola vez al mes — solo aparece en este período."
                >
                    <BaseInput.Field
                        label="Monto por empleado (USD)"
                        type="number"
                        step={0.01}
                        min={0}
                        value={cestaTicketUSD}
                        onValueChange={setCestaTicketUSD}
                        prefix="$"
                        inputClassName="text-right"
                    />
                    <div className="mt-3 px-4 py-3 rounded-lg border border-primary-500/20 bg-primary-500/[0.04]">
                        <div className="flex justify-between font-mono text-[13px]">
                            <span className="text-[var(--text-tertiary)]">Equivalente en Bs por empleado</span>
                            <span className="text-primary-500 tabular-nums">
                                {((parseFloat(cestaTicketUSD) || 0) * bcvRate).toLocaleString("es-VE", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                })}{" "}
                                Bs
                            </span>
                        </div>
                    </div>
                </StepSection>
            )}

            <AdvancedDisclosure label="Avanzado · alícuotas y modo de salario">
                <p className="font-mono text-[13px] text-[var(--text-tertiary)] leading-relaxed">
                    El salario integral suma alícuotas de utilidades y bono vacacional al salario base.
                    Se usa como base para retenciones que aplican sobre salario integral.
                </p>

                <div>
                    <label className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] mb-2 block">
                        Salario en el PDF
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={() => setSalaryMode("mensual")}
                            className={[
                                "h-10 rounded-lg border font-mono text-[12px] uppercase tracking-[0.12em] transition-all",
                                salaryMode === "mensual"
                                    ? "bg-primary-500/10 border-primary-500/60 text-primary-600 font-bold"
                                    : "bg-surface-1 border-border-light text-[var(--text-secondary)] hover:border-border-medium",
                            ].join(" ")}
                        >
                            Normal
                        </button>
                        <button
                            onClick={() => setSalaryMode("integral")}
                            className={[
                                "h-10 rounded-lg border font-mono text-[12px] uppercase tracking-[0.12em] transition-all",
                                salaryMode === "integral"
                                    ? "bg-primary-500/10 border-primary-500/60 text-primary-600 font-bold"
                                    : "bg-surface-1 border-border-light text-[var(--text-secondary)] hover:border-border-medium",
                            ].join(" ")}
                        >
                            Integral
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <BaseInput.Field
                        label="Días utilidades / año"
                        type="number"
                        min={15}
                        step={1}
                        value={diasUtilidades}
                        onValueChange={setDiasUtilidades}
                        inputClassName="text-right"
                    />
                    <BaseInput.Field
                        label="Días bono vacacional / año"
                        type="number"
                        min={15}
                        step={1}
                        value={diasBonoVacacional}
                        onValueChange={setDiasBonoVacacional}
                        inputClassName="text-right"
                    />
                </div>

                <div className="px-4 py-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.05] space-y-1.5">
                    <div className="flex justify-between items-baseline font-mono">
                        <span className="text-[12px] uppercase tracking-[0.16em] text-[var(--text-secondary)]">
                            Salario integral
                        </span>
                        <span className="text-[14px] font-black tabular-nums text-foreground">
                            {integralBase.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs
                        </span>
                    </div>
                    <div className="border-t border-amber-500/20" />
                    <div className="space-y-0.5 font-mono text-[12px] tabular-nums">
                        <div className="flex justify-between">
                            <span className="text-[var(--text-tertiary)]">Salario base</span>
                            <span className="text-[var(--text-secondary)]">
                                {refSalary.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-[var(--text-tertiary)]">+ alíc. utilidades ({diasUtilNum}d / 360)</span>
                            <span className="text-amber-500">
                                {alicuotaUtil.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-[var(--text-tertiary)]">+ alíc. bono vac. ({diasBonoNum}d / 360)</span>
                            <span className="text-amber-500">
                                {alicuotaBono.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs
                            </span>
                        </div>
                    </div>
                </div>
            </AdvancedDisclosure>
        </GuidedStepShell>
    );
}
