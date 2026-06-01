"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Coins, FileDown, Receipt, Save, Shield } from "lucide-react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BenefitActionCluster } from "@/src/modules/payroll/frontend/components/benefit-action-cluster";
import { notify } from "@/src/shared/frontend/notify";
import { ConfirmCompanyDialog, SummaryRow } from "@/src/shared/frontend/components/confirm-company-dialog";
import { useConfirmAction } from "@/src/shared/frontend/hooks/use-confirm-action";
import { useGuidedPayrollState } from "@/src/modules/payroll/frontend/hooks/use-guided-payroll-state";
import {
    useCestaTicketHistory,
    type CestaTicketPayload,
} from "@/src/modules/payroll/frontend/hooks/use-cesta-ticket-history";
import {
    useBonoGuerraHistory,
    type BonoGuerraPayload,
} from "@/src/modules/payroll/frontend/hooks/use-bono-guerra-history";
import {
    useBonificacionesHistory,
    type BonificacionesPayload,
} from "@/src/modules/payroll/frontend/hooks/use-bonificaciones-history";
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
import { generateBonoGuerraPdf } from "@/src/modules/payroll/frontend/utils/bono-guerra-pdf";
import { generateBonificacionesPdf } from "@/src/modules/payroll/frontend/utils/bonificaciones-pdf";
import type { ReportMode } from "@/src/shared/frontend/utils/pdf-receipt-chrome";
import { formatBcvRate } from "@/src/modules/payroll/frontend/components/calculator/formatters";

const MODE_LABEL: Record<ReportMode, string> = {
    general:    "General · consolidado",
    individual: "Hoja por empleado · A4",
    duplicado:  "Cortable · oficio Original + Copia",
};

const STEPS: StepDef[] = [
    { id: 1, label: "Período" },
    { id: 2, label: "Asignaciones" },
    { id: 3, label: "Deducciones" },
    { id: 4, label: "Bonos" },
    { id: 5, label: "Revisión" },
];

// Deriva (montoUsd, montoVes) a partir del valor del input y la moneda activa.
// Si el usuario captura en bolívares, USD = Bs / tasa. Redondeo a 2 decimales
// para alinear con `numeric(14,2)` del schema y mantener
// `montoUsd × exchangeRate ≈ montoVes` en céntimos.
function deriveMontos(
    raw: number,
    currency: "USD" | "VES",
    fallbackUsd: number,
    bcvRate: number,
): { montoUsd: number; montoVes: number } {
    const round2 = (n: number) => Math.round(n * 100) / 100;
    if (currency === "USD") {
        const usd = raw > 0 ? raw : fallbackUsd;
        return { montoUsd: round2(usd), montoVes: round2(usd * bcvRate) };
    }
    return {
        montoUsd: round2(bcvRate > 0 ? raw / bcvRate : 0),
        montoVes: round2(raw),
    };
}

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
        showBonoSocioEconomico,
        cestaTicketUSD,
        cestaTicketCurrency,
        bonoGuerraUSD,
        bonoGuerraCurrency,
        bonusRows,
        cestaTicketExcluded,
        bonoGuerraExcluded,
        cestaTicketOverrides,
        bonoGuerraOverrides,
    } = state;
    const activos = employees.filter((e) => e.estado === "activo").length;

    // Diálogo único de confirmación para los 9 disparadores de beneficios.
    const dialog = useConfirmAction();
    const fmtNum = (n: number) =>
        n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const {
        runs: ctRuns,
        saveDraft: saveCtDraft,
        confirm: confirmCt,
    } = useCestaTicketHistory(companyId);

    const {
        runs: bgRuns,
        saveDraft: saveBgDraft,
        confirm: confirmBg,
    } = useBonoGuerraHistory(companyId);

    const {
        runs: bfRuns,
        saveDraft: saveBfDraft,
        confirm: confirmBf,
    } = useBonificacionesHistory(companyId);

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

    const bonoGuerraAlreadyConfirmed = useMemo(
        () =>
            bgRuns.some(
                (r) =>
                    r.companyId === companyId &&
                    r.periodStart === activePeriodInfo.startDate &&
                    r.periodEnd === activePeriodInfo.endDate &&
                    r.status === "confirmed",
            ),
        [bgRuns, companyId, activePeriodInfo],
    );

    const bonificacionesAlreadyConfirmed = useMemo(
        () =>
            bfRuns.some(
                (r) =>
                    r.companyId === companyId &&
                    r.periodStart === activePeriodInfo.startDate &&
                    r.periodEnd === activePeriodInfo.endDate &&
                    r.status === "confirmed",
            ),
        [bfRuns, companyId, activePeriodInfo],
    );

    const [savingCtDraft, setSavingCtDraft]   = useState(false);
    const [confirmingCt, setConfirmingCt]     = useState(false);
    const [savingBgDraft, setSavingBgDraft]   = useState(false);
    const [confirmingBg, setConfirmingBg]     = useState(false);
    const [savingBfDraft, setSavingBfDraft]   = useState(false);
    const [confirmingBf, setConfirmingBf]     = useState(false);

    const buildCtPayload = useCallback((): CestaTicketPayload | null => {
        if (!companyId) return null;
        const active = employees.filter(
            (e) => e.estado === "activo" && !cestaTicketExcluded.has(e.cedula),
        );
        if (!active.length) return null;
        // Monto global (default + run-level fallback). Cada empleado puede tener
        // su propio override; si no, hereda este global.
        const globalRaw = parseFloat(cestaTicketUSD) || 0;
        const { montoUsd: globalUsd } = deriveMontos(
            globalRaw, cestaTicketCurrency, 40, bcvRate,
        );
        return {
            run: {
                companyId,
                periodStart:  activePeriodInfo.startDate,
                periodEnd:    activePeriodInfo.endDate,
                montoUsd:     globalUsd,
                exchangeRate: bcvRate,
            },
            receipts: active.map((e) => {
                const overrideRaw = cestaTicketOverrides.get(e.cedula);
                const rawNum =
                    overrideRaw && overrideRaw.trim() !== ""
                        ? parseFloat(overrideRaw) || 0
                        : globalRaw;
                const { montoUsd, montoVes } = deriveMontos(
                    rawNum, cestaTicketCurrency, 40, bcvRate,
                );
                return {
                    companyId,
                    employeeId:     e.cedula,
                    employeeCedula: e.cedula,
                    employeeNombre: e.nombre,
                    employeeCargo:  e.cargo,
                    montoUsd,
                    montoVes,
                };
            }),
        };
    }, [companyId, employees, cestaTicketExcluded, cestaTicketOverrides, cestaTicketUSD, cestaTicketCurrency, bcvRate, activePeriodInfo]);

    const handleCestaTicketPdf = (pdfMode: ReportMode) => {
        const active = employees.filter(
            (e) => e.estado === "activo" && !cestaTicketExcluded.has(e.cedula),
        );
        if (!active.length) {
            notify.error("No hay empleados seleccionados para cesta ticket");
            return;
        }
        const globalRaw = parseFloat(cestaTicketUSD) || 0;
        const { montoUsd: globalUsd } = deriveMontos(
            globalRaw, cestaTicketCurrency, 40, bcvRate,
        );
        generateCestaTicketPdf(
            active.map((e) => {
                const overrideRaw = cestaTicketOverrides.get(e.cedula);
                const rawNum =
                    overrideRaw && overrideRaw.trim() !== ""
                        ? parseFloat(overrideRaw) || 0
                        : globalRaw;
                const { montoUsd } = deriveMontos(
                    rawNum, cestaTicketCurrency, 40, bcvRate,
                );
                return { cedula: e.cedula, nombre: e.nombre, cargo: e.cargo, estado: e.estado, montoUsd };
            }),
            {
                companyName: company?.name ?? "",
                companyId: company?.id,
                periodLabel: activePeriodInfo.label,
                payrollDate: activePeriodInfo.endDate,
                montoUSD: globalUsd,
                bcvRate,
                pdfMode,
            },
        );
    };

    const handleSaveCestaTicketDraft = async () => {
        const payload = buildCtPayload();
        if (!payload) { notify.error("No hay empleados seleccionados para cesta ticket"); return; }
        setSavingCtDraft(true);
        const { runId } = await saveCtDraft(payload);
        setSavingCtDraft(false);
        if (runId) notify.success("Borrador de cesta ticket guardado");
    };

    const handleConfirmCestaTicket = async () => {
        const payload = buildCtPayload();
        if (!payload) { notify.error("No hay empleados seleccionados para cesta ticket"); return; }
        setConfirmingCt(true);
        const ok = await confirmCt(payload);
        setConfirmingCt(false);
        if (ok) notify.success("Cesta ticket confirmada");
    };

    // ── Bono Socio Económico de Ayuda Alimenticia — mismo flujo que cesta ticket ─

    const buildBgPayload = useCallback((): BonoGuerraPayload | null => {
        if (!companyId) return null;
        const active = employees.filter(
            (e) => e.estado === "activo" && !bonoGuerraExcluded.has(e.cedula),
        );
        if (!active.length) return null;
        const globalRaw = parseFloat(bonoGuerraUSD) || 0;
        const { montoUsd: globalUsd } = deriveMontos(
            globalRaw, bonoGuerraCurrency, 200, bcvRate,
        );
        return {
            run: {
                companyId,
                periodStart:  activePeriodInfo.startDate,
                periodEnd:    activePeriodInfo.endDate,
                montoUsd:     globalUsd,
                exchangeRate: bcvRate,
            },
            receipts: active.map((e) => {
                const overrideRaw = bonoGuerraOverrides.get(e.cedula);
                const rawNum =
                    overrideRaw && overrideRaw.trim() !== ""
                        ? parseFloat(overrideRaw) || 0
                        : globalRaw;
                const { montoUsd, montoVes } = deriveMontos(
                    rawNum, bonoGuerraCurrency, 200, bcvRate,
                );
                return {
                    companyId,
                    employeeId:     e.cedula,
                    employeeCedula: e.cedula,
                    employeeNombre: e.nombre,
                    employeeCargo:  e.cargo,
                    montoUsd,
                    montoVes,
                };
            }),
        };
    }, [companyId, employees, bonoGuerraExcluded, bonoGuerraOverrides, bonoGuerraUSD, bonoGuerraCurrency, bcvRate, activePeriodInfo]);

    const handleBonoGuerraPdf = (pdfMode: ReportMode) => {
        const active = employees.filter(
            (e) => e.estado === "activo" && !bonoGuerraExcluded.has(e.cedula),
        );
        if (!active.length) {
            notify.error("No hay empleados seleccionados para bono socio económico");
            return;
        }
        const globalRaw = parseFloat(bonoGuerraUSD) || 0;
        const { montoUsd: globalUsd } = deriveMontos(
            globalRaw, bonoGuerraCurrency, 200, bcvRate,
        );
        generateBonoGuerraPdf(
            active.map((e) => {
                const overrideRaw = bonoGuerraOverrides.get(e.cedula);
                const rawNum =
                    overrideRaw && overrideRaw.trim() !== ""
                        ? parseFloat(overrideRaw) || 0
                        : globalRaw;
                const { montoUsd } = deriveMontos(
                    rawNum, bonoGuerraCurrency, 200, bcvRate,
                );
                return { cedula: e.cedula, nombre: e.nombre, cargo: e.cargo, estado: e.estado, montoUsd };
            }),
            {
                companyName: company?.name ?? "",
                companyId: company?.id,
                periodLabel: activePeriodInfo.label,
                payrollDate: activePeriodInfo.endDate,
                montoUSD: globalUsd,
                bcvRate,
                pdfMode,
            },
        );
    };

    const handleSaveBonoGuerraDraft = async () => {
        const payload = buildBgPayload();
        if (!payload) { notify.error("No hay empleados seleccionados para bono socio económico"); return; }
        setSavingBgDraft(true);
        const { runId } = await saveBgDraft(payload);
        setSavingBgDraft(false);
        if (runId) notify.success("Borrador de bono socio económico guardado");
    };

    const handleConfirmBonoGuerra = async () => {
        const payload = buildBgPayload();
        if (!payload) { notify.error("No hay empleados seleccionados para bono socio económico"); return; }
        setConfirmingBg(true);
        const ok = await confirmBg(payload);
        setConfirmingBg(false);
        if (ok) notify.success("Bono socio económico confirmado");
    };

    // ── Bonificaciones — borrador + confirmación + PDF ─────────────────────

    type BonusLineComputed = {
        label:     string;
        currency:  "USD" | "VES";
        amount:    number;
        amountVes: number;
    };

    const computedBonusLines = useCallback((): BonusLineComputed[] => {
        return bonusRows
            .map((r) => {
                const raw = parseFloat(r.amount) || 0;
                return {
                    label:     r.label || "—",
                    currency:  r.currency,
                    amount:    raw,
                    amountVes: r.currency === "VES" ? raw : raw * bcvRate,
                };
            })
            .filter((l) => l.amount > 0);
    }, [bonusRows, bcvRate]);

    const buildBfPayload = useCallback((): BonificacionesPayload | null => {
        if (!companyId) return null;
        const active = employees.filter((e) => e.estado === "activo");
        if (!active.length) return null;
        const lines = computedBonusLines();
        if (!lines.length) return null;
        const totalVesPerEmployee = lines.reduce((s, l) => s + l.amountVes, 0);
        const totalVes            = totalVesPerEmployee * active.length;
        return {
            run: {
                companyId,
                periodStart:   activePeriodInfo.startDate,
                periodEnd:     activePeriodInfo.endDate,
                exchangeRate:  bcvRate,
                totalVes,
                employeeCount: active.length,
                lineCount:     lines.length,
            },
            receipts: active.map((e) => ({
                companyId,
                employeeId:     e.cedula,
                employeeCedula: e.cedula,
                employeeNombre: e.nombre,
                employeeCargo:  e.cargo,
                totalVes:       totalVesPerEmployee,
                bonusLines:     lines,
            })),
        };
    }, [companyId, employees, computedBonusLines, bcvRate, activePeriodInfo]);

    const handleBonificacionesPdf = (pdfMode: ReportMode) => {
        const active = employees.filter((e) => e.estado === "activo");
        if (!active.length) { notify.error("No hay empleados activos"); return; }
        const lines = computedBonusLines();
        if (!lines.length) {
            notify.error("No hay bonos con monto configurado. Agrega bonos en el paso 4 de la nómina.");
            return;
        }
        generateBonificacionesPdf(
            active.map((e) => ({ cedula: e.cedula, nombre: e.nombre, cargo: e.cargo, estado: e.estado })),
            {
                companyName: company?.name ?? "",
                companyId:   company?.id,
                periodLabel: activePeriodInfo.label,
                payrollDate: activePeriodInfo.endDate,
                bonusLines:  lines.map((l) => ({
                    label:     l.label,
                    currency:  l.currency,
                    amount:    l.amount,
                    amountVES: l.amountVes,
                })),
                bcvRate,
                logoUrl:       company?.logoUrl,
                showLogoInPdf: company?.showLogoInPdf,
                pdfMode,
            },
        );
    };

    const handleSaveBonificacionesDraft = async () => {
        const payload = buildBfPayload();
        if (!payload) {
            notify.error("No hay empleados activos o bonos configurados para guardar");
            return;
        }
        setSavingBfDraft(true);
        const { runId } = await saveBfDraft(payload);
        setSavingBfDraft(false);
        if (runId) notify.success("Borrador de bonificaciones guardado");
    };

    const handleConfirmBonificaciones = async () => {
        const payload = buildBfPayload();
        if (!payload) {
            notify.error("No hay empleados activos o bonos configurados para confirmar");
            return;
        }
        setConfirmingBf(true);
        const ok = await confirmBf(payload);
        setConfirmingBf(false);
        if (ok) notify.success("Bonificaciones confirmadas");
    };

    // ── Wrappers que abren el diálogo de confirmación antes de ejecutar ─────
    // Cada wrapper construye un payload sólo para derivar el summary visible
    // (cantidad de empleados / montos). Si no se puede armar payload se
    // dispara el toast de error y NO se abre el diálogo.

    const askSaveCestaTicketDraft = () => {
        const payload = buildCtPayload();
        if (!payload) { notify.error("No hay empleados seleccionados para cesta ticket"); return; }
        const totalVes = payload.receipts.reduce((s, r) => s + r.montoVes, 0);
        dialog.request({
            title: "Guardar borrador de Cesta Ticket",
            subtitle: "Sobrescribe el borrador anterior del mismo período si existe.",
            summary: (
                <>
                    <SummaryRow label="Período" value={activePeriodInfo.label} />
                    <SummaryRow label="Empleados" value={payload.receipts.length} />
                    <SummaryRow label="Monto global USD" value={`$${fmtNum(payload.run.montoUsd)}`} />
                    <SummaryRow label="Total VES" value={`Bs. ${fmtNum(totalVes)}`} emphasis />
                </>
            ),
            confirmLabel: "Guardar borrador",
            confirmIcon: <Save size={14} strokeWidth={2} />,
            run: handleSaveCestaTicketDraft,
        });
    };

    const askConfirmCestaTicket = () => {
        const payload = buildCtPayload();
        if (!payload) { notify.error("No hay empleados seleccionados para cesta ticket"); return; }
        const totalVes = payload.receipts.reduce((s, r) => s + r.montoVes, 0);
        dialog.request({
            title: "Confirmar Cesta Ticket",
            subtitle: activePeriodInfo.label,
            summary: (
                <>
                    <SummaryRow label="Empleados" value={payload.receipts.length} />
                    <SummaryRow label="Monto global USD" value={`$${fmtNum(payload.run.montoUsd)}`} />
                    <SummaryRow label="Tasa BCV" value={`Bs. ${formatBcvRate(bcvRate)} / USD`} />
                    <SummaryRow label="Total VES" value={`Bs. ${fmtNum(totalVes)}`} emphasis />
                </>
            ),
            warning: "Esta acción guarda la cesta ticket permanentemente y bloquea el período. No se puede deshacer desde la aplicación.",
            confirmLabel: "Confirmar y guardar",
            confirmIcon: <CheckCircle2 size={14} strokeWidth={2} />,
            run: handleConfirmCestaTicket,
        });
    };

    const askCestaTicketPdf = (pdfMode: ReportMode) => {
        const payload = buildCtPayload();
        if (!payload) { notify.error("No hay empleados seleccionados para cesta ticket"); return; }
        dialog.request({
            title: "Descargar PDF de Cesta Ticket",
            subtitle: activePeriodInfo.label,
            summary: (
                <>
                    <SummaryRow label="Empleados" value={payload.receipts.length} />
                    <SummaryRow label="Monto global USD" value={`$${fmtNum(payload.run.montoUsd)}`} />
                    <SummaryRow label="Modalidad" value={MODE_LABEL[pdfMode]} />
                </>
            ),
            confirmLabel: "Descargar PDF",
            confirmIcon: <FileDown size={14} strokeWidth={2} />,
            run: () => handleCestaTicketPdf(pdfMode),
        });
    };

    const askSaveBonoGuerraDraft = () => {
        const payload = buildBgPayload();
        if (!payload) { notify.error("No hay empleados seleccionados para bono socio económico"); return; }
        const totalVes = payload.receipts.reduce((s, r) => s + r.montoVes, 0);
        dialog.request({
            title: "Guardar borrador de Bono Socio Económico",
            subtitle: "Sobrescribe el borrador anterior del mismo período si existe.",
            summary: (
                <>
                    <SummaryRow label="Período" value={activePeriodInfo.label} />
                    <SummaryRow label="Empleados" value={payload.receipts.length} />
                    <SummaryRow label="Monto global USD" value={`$${fmtNum(payload.run.montoUsd)}`} />
                    <SummaryRow label="Total VES" value={`Bs. ${fmtNum(totalVes)}`} emphasis />
                </>
            ),
            confirmLabel: "Guardar borrador",
            confirmIcon: <Save size={14} strokeWidth={2} />,
            run: handleSaveBonoGuerraDraft,
        });
    };

    const askConfirmBonoGuerra = () => {
        const payload = buildBgPayload();
        if (!payload) { notify.error("No hay empleados seleccionados para bono socio económico"); return; }
        const totalVes = payload.receipts.reduce((s, r) => s + r.montoVes, 0);
        dialog.request({
            title: "Confirmar Bono Socio Económico",
            subtitle: activePeriodInfo.label,
            summary: (
                <>
                    <SummaryRow label="Empleados" value={payload.receipts.length} />
                    <SummaryRow label="Monto global USD" value={`$${fmtNum(payload.run.montoUsd)}`} />
                    <SummaryRow label="Tasa BCV" value={`Bs. ${formatBcvRate(bcvRate)} / USD`} />
                    <SummaryRow label="Total VES" value={`Bs. ${fmtNum(totalVes)}`} emphasis />
                </>
            ),
            warning: "Esta acción guarda el bono socio económico permanentemente y bloquea el período. No se puede deshacer desde la aplicación.",
            confirmLabel: "Confirmar y guardar",
            confirmIcon: <CheckCircle2 size={14} strokeWidth={2} />,
            run: handleConfirmBonoGuerra,
        });
    };

    const askBonoGuerraPdf = (pdfMode: ReportMode) => {
        const payload = buildBgPayload();
        if (!payload) { notify.error("No hay empleados seleccionados para bono socio económico"); return; }
        dialog.request({
            title: "Descargar PDF de Bono Socio Económico",
            subtitle: activePeriodInfo.label,
            summary: (
                <>
                    <SummaryRow label="Empleados" value={payload.receipts.length} />
                    <SummaryRow label="Monto global USD" value={`$${fmtNum(payload.run.montoUsd)}`} />
                    <SummaryRow label="Modalidad" value={MODE_LABEL[pdfMode]} />
                </>
            ),
            confirmLabel: "Descargar PDF",
            confirmIcon: <FileDown size={14} strokeWidth={2} />,
            run: () => handleBonoGuerraPdf(pdfMode),
        });
    };

    const askSaveBonificacionesDraft = () => {
        const payload = buildBfPayload();
        if (!payload) { notify.error("No hay empleados activos o bonos configurados para guardar"); return; }
        dialog.request({
            title: "Guardar borrador de Bonificaciones",
            subtitle: "Sobrescribe el borrador anterior del mismo período si existe.",
            summary: (
                <>
                    <SummaryRow label="Período" value={activePeriodInfo.label} />
                    <SummaryRow label="Empleados" value={payload.run.employeeCount} />
                    <SummaryRow label="Líneas de bono" value={payload.run.lineCount} />
                    <SummaryRow label="Total VES" value={`Bs. ${fmtNum(payload.run.totalVes)}`} emphasis />
                </>
            ),
            confirmLabel: "Guardar borrador",
            confirmIcon: <Save size={14} strokeWidth={2} />,
            run: handleSaveBonificacionesDraft,
        });
    };

    const askConfirmBonificaciones = () => {
        const payload = buildBfPayload();
        if (!payload) { notify.error("No hay empleados activos o bonos configurados para confirmar"); return; }
        dialog.request({
            title: "Confirmar Bonificaciones",
            subtitle: activePeriodInfo.label,
            summary: (
                <>
                    <SummaryRow label="Empleados" value={payload.run.employeeCount} />
                    <SummaryRow label="Líneas de bono" value={payload.run.lineCount} />
                    <SummaryRow label="Tasa BCV" value={`Bs. ${formatBcvRate(bcvRate)} / USD`} />
                    <SummaryRow label="Total VES" value={`Bs. ${fmtNum(payload.run.totalVes)}`} emphasis />
                </>
            ),
            warning: "Esta acción guarda las bonificaciones permanentemente y bloquea el período. No se puede deshacer desde la aplicación.",
            confirmLabel: "Confirmar y guardar",
            confirmIcon: <CheckCircle2 size={14} strokeWidth={2} />,
            run: handleConfirmBonificaciones,
        });
    };

    const askBonificacionesPdf = (pdfMode: ReportMode) => {
        // El PDF no requiere payload completo (no persiste); valida lo mismo
        // que el handler original antes de abrir el diálogo.
        const active = employees.filter((e) => e.estado === "activo");
        if (!active.length) { notify.error("No hay empleados activos"); return; }
        const lines = computedBonusLines();
        if (!lines.length) {
            notify.error("No hay bonos con monto configurado. Agrega bonos en el paso 4 de la nómina.");
            return;
        }
        const totalVes = lines.reduce((s, l) => s + l.amountVes, 0);
        dialog.request({
            title: "Descargar PDF de Bonificaciones",
            subtitle: activePeriodInfo.label,
            summary: (
                <>
                    <SummaryRow label="Empleados" value={active.length} />
                    <SummaryRow label="Líneas de bono" value={lines.length} />
                    <SummaryRow label="Total por empleado" value={`Bs. ${fmtNum(totalVes)}`} emphasis />
                    <SummaryRow label="Modalidad" value={MODE_LABEL[pdfMode]} />
                </>
            ),
            confirmLabel: "Descargar PDF",
            confirmIcon: <FileDown size={14} strokeWidth={2} />,
            run: () => handleBonificacionesPdf(pdfMode),
        });
    };

    return (
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
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                        <BenefitActionCluster
                            label="Bonificaciones"
                            icon={<Coins size={12} />}
                            confirmed={bonificacionesAlreadyConfirmed}
                            saving={savingBfDraft}
                            confirming={confirmingBf}
                            disabled={!activos}
                            onSaveDraft={askSaveBonificacionesDraft}
                            onConfirm={askConfirmBonificaciones}
                            onPdf={askBonificacionesPdf}
                            pdfMenuPlacement="left"
                        />

                        {showCestaTicket && (
                            <BenefitActionCluster
                                label="Cesta Ticket"
                                icon={<Receipt size={12} />}
                                confirmed={cestaTicketAlreadyConfirmed}
                                saving={savingCtDraft}
                                confirming={confirmingCt}
                                disabled={!activos}
                                onSaveDraft={askSaveCestaTicketDraft}
                                onConfirm={askConfirmCestaTicket}
                                onPdf={askCestaTicketPdf}
                            />
                        )}

                        {showBonoSocioEconomico && (
                            <BenefitActionCluster
                                label="Bono Socio Económico"
                                icon={<Shield size={12} />}
                                confirmed={bonoGuerraAlreadyConfirmed}
                                saving={savingBgDraft}
                                confirming={confirmingBg}
                                disabled={!activos}
                                onSaveDraft={askSaveBonoGuerraDraft}
                                onConfirm={askConfirmBonoGuerra}
                                onPdf={askBonoGuerraPdf}
                            />
                        )}

                        <div className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-border-light bg-surface-2 shadow-sm">
                            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">BCV</span>
                            <span className="font-mono text-[11px] font-semibold tabular-nums text-foreground">
                                {formatBcvRate(bcvRate)}
                            </span>
                        </div>

                        {company && (
                            <span className="hidden md:inline font-mono text-[10px] text-[var(--text-tertiary)] uppercase tracking-[0.14em] truncate max-w-[180px]">
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

                {/* Diálogo único para los 9 disparadores de beneficios (PDF / borrador / confirmar) */}
                <ConfirmCompanyDialog
                    isOpen={!!dialog.pending}
                    onClose={dialog.clear}
                    onConfirm={dialog.confirm}
                    loading={dialog.loading}
                    title={dialog.pending?.title ?? ""}
                    subtitle={dialog.pending?.subtitle}
                    summary={dialog.pending?.summary}
                    warning={dialog.pending?.warning}
                    confirmLabel={dialog.pending?.confirmLabel}
                    confirmIcon={dialog.pending?.confirmIcon}
                    destructive={dialog.pending?.destructive}
                />
            </div>
    );
}
