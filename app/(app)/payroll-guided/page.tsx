"use client";

import { useEffect, useRef, useState } from "react";
import { TrendingUp } from "lucide-react";
import { DesktopOnlyGuard } from "@/src/shared/frontend/components/desktop-only-guard";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { useGuidedPayrollState } from "@/src/modules/payroll/frontend/hooks/use-guided-payroll-state";
import {
    GuidedStepperHeader,
    type StepDef,
} from "@/src/modules/payroll/frontend/components/guided/guided-stepper-header";
import { GuidedStepPeriod } from "@/src/modules/payroll/frontend/components/guided/guided-step-period";
import { GuidedStepEarnings } from "@/src/modules/payroll/frontend/components/guided/guided-step-earnings";
import { GuidedStepDeductions } from "@/src/modules/payroll/frontend/components/guided/guided-step-deductions";
import { GuidedStepBonuses } from "@/src/modules/payroll/frontend/components/guided/guided-step-bonuses";
import { GuidedStepReview } from "@/src/modules/payroll/frontend/components/guided/guided-step-review";

const STEPS: StepDef[] = [
    { id: 1, label: "Período" },
    { id: 2, label: "Asignaciones" },
    { id: 3, label: "Deducciones" },
    { id: 4, label: "Bonos" },
    { id: 5, label: "Revisión" },
];

export default function PayrollGuidedPage() {
    const state = useGuidedPayrollState();
    const [currentStep, setCurrentStep] = useState(1);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Scroll content area to top whenever the step changes — gives the user a
    // clear sense of "new page" instead of carrying scroll position across steps.
    useEffect(() => {
        scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }, [currentStep]);

    const goNext = () => setCurrentStep((s) => Math.min(STEPS.length, s + 1));
    const goBack = () => setCurrentStep((s) => Math.max(1, s - 1));

    const { activePeriodInfo, employees, company, bcvRate } = state;
    const activos = employees.filter((e) => e.estado === "activo").length;

    return (
        <DesktopOnlyGuard>
            <div className="flex flex-1 flex-col bg-surface-2 font-mono overflow-hidden">
                <PageHeader
                    title="Nómina · Modo guiado"
                    subtitle={
                        <div className="flex items-center gap-2">
                            <span>{activePeriodInfo.label}</span>
                            <span className="text-border-light/40">•</span>
                            <span>{activos} activos</span>
                            <span className="text-border-light/40">•</span>
                            <span className="uppercase tracking-[0.14em]">Experimental</span>
                        </div>
                    }
                >
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-light bg-surface-2 h-8">
                            <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-tertiary)]">BCV</span>
                            <span className="font-mono text-[11px] font-semibold tabular-nums text-foreground">
                                {bcvRate.toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                            </span>
                        </div>
                        {company && (
                            <span className="font-mono text-[10px] text-[var(--text-tertiary)] uppercase tracking-[0.14em]">
                                {company.name}
                            </span>
                        )}
                        <span className="hidden lg:inline-flex items-center gap-1.5 font-mono text-[10px] text-primary-500 uppercase tracking-[0.14em]">
                            <TrendingUp size={12} /> Calculadora
                        </span>
                    </div>
                </PageHeader>

                <GuidedStepperHeader
                    steps={STEPS}
                    currentStep={currentStep}
                    onStepClick={setCurrentStep}
                />

                <div ref={scrollContainerRef} className="flex-1 flex flex-col overflow-hidden">
                    {currentStep === 1 && <GuidedStepPeriod state={state} onNext={goNext} />}
                    {currentStep === 2 && (
                        <GuidedStepEarnings state={state} onBack={goBack} onNext={goNext} />
                    )}
                    {currentStep === 3 && (
                        <GuidedStepDeductions state={state} onBack={goBack} onNext={goNext} />
                    )}
                    {currentStep === 4 && (
                        <GuidedStepBonuses state={state} onBack={goBack} onNext={goNext} />
                    )}
                    {currentStep === 5 && <GuidedStepReview state={state} onBack={goBack} />}
                </div>
            </div>
        </DesktopOnlyGuard>
    );
}
