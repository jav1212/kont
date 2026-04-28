"use client";

import { Save } from "lucide-react";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { PayrollEmployeeTable } from "../payroll-employee-table";
import type { GuidedPayrollState } from "../../hooks/use-guided-payroll-state";
import type { PdfVisibility } from "../../../backend/domain/payroll-settings";
import { GuidedStepShell, AdvancedDisclosure } from "./guided-step-shell";

interface Props {
    state: GuidedPayrollState;
    onBack: () => void;
}

export function GuidedStepReview({ state, onBack }: Props) {
    const {
        employees, empLoading, empError,
        company, companyId,
        earningRows, deductionRows, bonusRows,
        mondaysInMonth, bcvRate,
        diasUtilNum, diasBonoNum,
        horasExtrasGlobal, salarioMinimo,
        activePeriodInfo, periodAlreadyConfirmed,
        salaryMode, activeQuincena,
        pdfVisibility, setPdfVisibility,
        handleConfirm, handleSaveDraft,
        handleSaveSettings, saveLoading, saveMsg,
    } = state;

    return (
        <GuidedStepShell
            title="Revise y confirme la nómina"
            subtitle="Verifique los totales por empleado. Si todo está correcto, confirme la nómina o exporte el PDF de los recibos."
            onBack={onBack}
            footerExtra={
                <BaseButton.Root
                    variant="secondary"
                    size="md"
                    onClick={handleSaveSettings}
                    isDisabled={!companyId || saveLoading}
                    leftIcon={<Save size={15} />}
                >
                    {saveLoading
                        ? "Guardando…"
                        : saveMsg
                            ? saveMsg.text
                            : "Guardar configuración"}
                </BaseButton.Root>
            }
            hideNav={false}
        >
            <PayrollEmployeeTable
                employees={employees}
                empLoading={empLoading}
                empError={empError}
                onConfirm={handleConfirm}
                onSaveDraft={handleSaveDraft}
                earningRows={earningRows}
                deductionRows={deductionRows}
                bonusRows={bonusRows}
                mondaysInMonth={mondaysInMonth}
                bcvRate={bcvRate}
                diasUtilidades={diasUtilNum}
                diasBonoVacacional={diasBonoNum}
                horasExtrasGlobal={horasExtrasGlobal}
                salarioMinimo={salarioMinimo}
                companyName={company?.name ?? ""}
                companyId={company?.id ?? ""}
                companyLogoUrl={company?.logoUrl}
                showLogoInPdf={company?.showLogoInPdf}
                payrollDate={activePeriodInfo.endDate}
                periodStart={activePeriodInfo.startDate}
                periodLabel={activePeriodInfo.label}
                periodAlreadyConfirmed={periodAlreadyConfirmed}
                salaryMode={salaryMode}
                quincena={activeQuincena}
                pdfVisibility={pdfVisibility}
            />

            <AdvancedDisclosure label="Avanzado · qué secciones aparecen en el PDF">
                <p className="font-mono text-[13px] text-[var(--text-tertiary)] leading-relaxed">
                    La visibilidad solo afecta la presentación del recibo en PDF — los cálculos y
                    totales no cambian.
                </p>
                <div className="space-y-1.5">
                    {(
                        [
                            ["showEarnings", "Asignaciones"],
                            ["showDeductions", "Deducciones"],
                            ["showBonuses", "Bonificaciones"],
                            ["showOvertime", "Horas extras"],
                            ["showAlicuotaBreakdown", "Desglose salario integral"],
                        ] as [keyof PdfVisibility, string][]
                    ).map(([key, label]) => (
                        <div
                            key={key}
                            className="flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-foreground/[0.02]"
                        >
                            <span className="font-mono text-[13px] text-[var(--text-secondary)]">
                                {label}
                            </span>
                            <button
                                onClick={() => setPdfVisibility((v) => ({ ...v, [key]: !v[key] }))}
                                className={[
                                    "h-7 px-3 rounded border font-mono text-[11px] uppercase tracking-[0.14em] transition-colors",
                                    pdfVisibility[key]
                                        ? "border-green-500/40 bg-green-500/10 text-green-500"
                                        : "border-border-light bg-surface-1 text-[var(--text-tertiary)] hover:border-border-medium",
                                ].join(" ")}
                            >
                                {pdfVisibility[key] ? "Visible" : "Oculto"}
                            </button>
                        </div>
                    ))}
                </div>
            </AdvancedDisclosure>
        </GuidedStepShell>
    );
}
