"use client";

import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { DeductionsSection } from "../payroll-accordion-sections";
import type { GuidedPayrollState } from "../../hooks/use-guided-payroll-state";
import { GuidedStepShell, StepSection, AdvancedDisclosure } from "./guided-step-shell";

interface Props {
    state: GuidedPayrollState;
    onBack: () => void;
    onNext: () => void;
}

export function GuidedStepDeductions({ state, onBack, onNext }: Props) {
    const {
        deductionRows, deductionValues, totalDeductions,
        addDeduction, updateDeduction, removeDeduction,
        weeklyBase, weeklyRate, mondaysInMonth, monthlySalary,
        integralBase, cappedWeeklyBase,
        salarioMinimoInput, setSalarioMinimoInput,
        salarioMinimo, periodoMode, activeQuincena,
    } = state;

    const showFaovNote =
        periodoMode === "quincenal" &&
        activeQuincena === 1 &&
        deductionRows.some((r) => r.quincenaRule === "second-half");

    return (
        <GuidedStepShell
            title="¿Qué se le descuenta?"
            subtitle="Retenciones e impuestos sobre la nómina (S.S.O., R.P.E., F.A.O.V., otros)."
            onBack={onBack}
            onNext={onNext}
        >
            <StepSection
                title="Deducciones"
                description="Las filas marcadas como 'segunda quincena' se aplican automáticamente solo cuando corresponda."
            >
                <DeductionsSection
                    rows={deductionRows}
                    values={deductionValues}
                    total={totalDeductions}
                    weeklyBase={weeklyBase}
                    weeklyRate={weeklyRate}
                    mondaysInMonth={mondaysInMonth}
                    monthlySalary={monthlySalary}
                    integralBase={integralBase}
                    cappedWeeklyBase={cappedWeeklyBase}
                    onUpdate={updateDeduction}
                    onRemove={removeDeduction}
                    onAdd={addDeduction}
                />
                {showFaovNote && (
                    <p className="mt-3 px-4 py-2.5 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] font-mono text-[12px] text-amber-600 leading-relaxed">
                        Está en la primera quincena. Las filas de F.A.O.V. (segunda quincena) no se
                        están aplicando — aparecerán automáticamente en la quincena 16–fin.
                    </p>
                )}
            </StepSection>

            <AdvancedDisclosure label="Avanzado · tope SSO (10 × salario mínimo)">
                <p className="font-mono text-[13px] text-[var(--text-tertiary)] leading-relaxed">
                    Si el salario semanal del empleado supera 10 veces el salario mínimo nacional, la
                    base para el S.S.O. se limita a ese tope. Deje el campo vacío si no quiere aplicar
                    el tope.
                </p>
                <BaseInput.Field
                    label="Salario mínimo de referencia (Bs.)"
                    type="number"
                    step={0.01}
                    placeholder="Salario mínimo Bs."
                    value={salarioMinimoInput}
                    onValueChange={setSalarioMinimoInput}
                    prefix="Bs."
                    inputClassName="text-right"
                />
                {salarioMinimo > 0 && (
                    <p className="font-mono text-[12px] text-[var(--text-tertiary)]">
                        Base SSO máxima:{" "}
                        <span className="text-red-400 tabular-nums">
                            {(10 * salarioMinimo).toLocaleString("es-VE", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                            })}{" "}
                            Bs
                        </span>
                        {cappedWeeklyBase < weeklyBase && (
                            <span className="text-[var(--text-tertiary)]"> · tope activo</span>
                        )}
                    </p>
                )}
            </AdvancedDisclosure>
        </GuidedStepShell>
    );
}
