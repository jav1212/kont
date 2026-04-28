"use client";

import { EarningsSection } from "../payroll-accordion-sections";
import { HorasExtrasGlobalEditor } from "../payroll-row-editors";
import type { GuidedPayrollState } from "../../hooks/use-guided-payroll-state";
import { GuidedStepShell, StepSection } from "./guided-step-shell";

interface Props {
    state: GuidedPayrollState;
    onBack: () => void;
    onNext: () => void;
}

export function GuidedStepEarnings({ state, onBack, onNext }: Props) {
    const {
        earningRows, earningValues, totalEarnings,
        addEarning, updateEarning, removeEarning,
        dailyRate,
        horasExtrasGlobal, updateHorasExtrasGlobal,
    } = state;

    return (
        <GuidedStepShell
            title="¿Qué se le paga al empleado?"
            subtitle="Días normales, sábados, domingos, feriados, y horas extras. Las cantidades de calendario se rellenan automáticamente según el período que eligió."
            onBack={onBack}
            onNext={onNext}
        >
            <StepSection
                title="Asignaciones"
                description="Cada fila se calcula como: cantidad × salario diario × multiplicador (o monto fijo)."
            >
                <EarningsSection
                    rows={earningRows}
                    values={earningValues}
                    total={totalEarnings}
                    dailyRate={dailyRate}
                    onUpdate={updateEarning}
                    onRemove={removeEarning}
                    onAdd={addEarning}
                />
            </StepSection>

            <StepSection
                title="Horas extras (Art. 118 LOTTT)"
                description="Estas horas se aplican a todos los empleados activos. Marque las que correspondan al período."
            >
                <div className="space-y-3">
                    {horasExtrasGlobal.map((row) => (
                        <HorasExtrasGlobalEditor
                            key={row.id}
                            row={row}
                            dailyRate={dailyRate}
                            onChange={(u) => updateHorasExtrasGlobal(row.id, u)}
                        />
                    ))}
                </div>
            </StepSection>
        </GuidedStepShell>
    );
}
