"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Receipt, Save } from "lucide-react";
import { DesktopOnlyGuard } from "@/src/shared/frontend/components/desktop-only-guard";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { notify } from "@/src/shared/frontend/notify";
import { useGuidedPayrollState } from "@/src/modules/payroll/frontend/hooks/use-guided-payroll-state";
import {
    useCestaTicketHistory,
    type CestaTicketPayload,
} from "@/src/modules/payroll/frontend/hooks/use-cesta-ticket-history";
import {
    GuidedStepperHeader,
    type StepDef,
} from "@/src/modules/payroll/frontend/components/guided/guided-stepper-header";
import { GuidedStepPeriod } from "@/src/modules/payroll/frontend/components/guided/guided-step-period";
import { GuidedStepEarnings } from "@/src/modules/payroll/frontend/components/guided/guided-step-earnings";
import { GuidedStepDeductions } from "@/src/modules/payroll/frontend/components/guided/guided-step-deductions";
import { GuidedStepBonuses } from "@/src/modules/payroll/frontend/components/guided/guided-step-bonuses";
import { GuidedStepReview } from "@/src/modules/payroll/frontend/components/guided/guided-step-review";
import { generateCestaTicketPdf } from "@/src/modules/payroll/frontend/utils/cesta-ticket-pdf";

const STEPS: StepDef[] = [
    { id: 1, label: "Período" },
    { id: 2, label: "Asignaciones" },
    { id: 3, label: "Deducciones" },
    { id: 4, label: "Bonos" },
    { id: 5, label: "Revisión" },
];

export default function PayrollCalculatorPage() {
    const state = useGuidedPayrollState();
    const [currentStep, setCurrentStep] = useState(1);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }, [currentStep]);

    const goNext = () => setCurrentStep((s) => Math.min(STEPS.length, s + 1));
    const goBack = () => setCurrentStep((s) => Math.max(1, s - 1));

    const {
        activePeriodInfo,
        employees,
        company,
        companyId,
        bcvRate,
        showCestaTicket,
        cestaTicketUSD,
    } = state;
    const activos = employees.filter((e) => e.estado === "activo").length;

    const {
        runs: ctRuns,
        saveDraft: saveCtDraft,
        confirm: confirmCt,
    } = useCestaTicketHistory(companyId);

    const cestaTicketAlreadyConfirmed = useMemo(
        () =>
            ctRuns.some(
                (r) =>
                    r.companyId === companyId &&
                    r.periodStart === activePeriodInfo.startDate &&
                    r.periodEnd === activePeriodInfo.endDate &&
                    r.status === "confirmed",
            ),
        [ctRuns, companyId, activePeriodInfo],
    );

    const [savingCtDraft, setSavingCtDraft]   = useState(false);
    const [confirmingCt, setConfirmingCt]     = useState(false);

    const buildCtPayload = useCallback((): CestaTicketPayload | null => {
        if (!companyId) return null;
        const active = employees.filter((e) => e.estado === "activo");
        if (!active.length) return null;
        const montoUsd = parseFloat(cestaTicketUSD) || 40;
        const montoVes = montoUsd * bcvRate;
        return {
            run: {
                companyId,
                periodStart:  activePeriodInfo.startDate,
                periodEnd:    activePeriodInfo.endDate,
                montoUsd,
                exchangeRate: bcvRate,
            },
            receipts: active.map((e) => ({
                companyId,
                employeeId:     e.cedula,
                employeeCedula: e.cedula,
                employeeNombre: e.nombre,
                employeeCargo:  e.cargo,
                montoUsd,
                montoVes,
            })),
        };
    }, [companyId, employees, cestaTicketUSD, bcvRate, activePeriodInfo]);

    const handleCestaTicketPdf = () => {
        const active = employees.filter((e) => e.estado === "activo");
        if (!active.length) return;
        generateCestaTicketPdf(
            active.map((e) => ({ cedula: e.cedula, nombre: e.nombre, cargo: e.cargo, estado: e.estado })),
            {
                companyName: company?.name ?? "",
                companyId: company?.id,
                periodLabel: activePeriodInfo.label,
                payrollDate: activePeriodInfo.endDate,
                montoUSD: parseFloat(cestaTicketUSD) || 40,
                bcvRate,
            },
        );
    };

    const handleSaveCestaTicketDraft = async () => {
        const payload = buildCtPayload();
        if (!payload) { notify.error("No hay empleados activos para guardar"); return; }
        setSavingCtDraft(true);
        const { runId } = await saveCtDraft(payload);
        setSavingCtDraft(false);
        if (runId) notify.success("Borrador de cesta ticket guardado");
    };

    const handleConfirmCestaTicket = async () => {
        const payload = buildCtPayload();
        if (!payload) { notify.error("No hay empleados activos para confirmar"); return; }
        setConfirmingCt(true);
        const ok = await confirmCt(payload);
        setConfirmingCt(false);
        if (ok) notify.success("Cesta ticket confirmada");
    };

    return (
        <DesktopOnlyGuard>
            <div className="flex flex-1 flex-col bg-surface-2 font-mono overflow-hidden">
                <PageHeader
                    title="Nómina"
                    subtitle={
                        <div className="flex items-center gap-2">
                            <span>{activePeriodInfo.label}</span>
                            <span className="text-border-light/40">•</span>
                            <span>{activos} activos</span>
                        </div>
                    }
                >
                    <div className="flex items-center gap-3">
                        {showCestaTicket && (
                            <>
                                <BaseButton.Root
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleSaveCestaTicketDraft}
                                    disabled={savingCtDraft || !activos || cestaTicketAlreadyConfirmed}
                                    leftIcon={<Save size={14} />}
                                >
                                    {savingCtDraft ? "Guardando..." : "Guardar borrador"}
                                </BaseButton.Root>
                                <BaseButton.Root
                                    variant="primary"
                                    size="sm"
                                    onClick={handleConfirmCestaTicket}
                                    disabled={confirmingCt || !activos || cestaTicketAlreadyConfirmed}
                                    leftIcon={<Check size={14} />}
                                >
                                    {confirmingCt
                                        ? "Confirmando..."
                                        : cestaTicketAlreadyConfirmed
                                            ? "Cesta ticket confirmada"
                                            : "Confirmar cesta ticket"}
                                </BaseButton.Root>
                                <BaseButton.Root
                                    variant="secondary"
                                    size="sm"
                                    onClick={handleCestaTicketPdf}
                                    leftIcon={<Receipt size={14} />}
                                >
                                    Cesta Ticket
                                </BaseButton.Root>
                            </>
                        )}

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
