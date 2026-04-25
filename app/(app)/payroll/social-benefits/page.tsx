"use client";

import { useState, useMemo } from "react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { Calendar, ClipboardCheck, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import { useCompany }  from "@/src/modules/companies/frontend/hooks/use-companies";
import { useEmployee } from "@/src/modules/payroll/frontend/hooks/use-employee";
import type { Employee } from "@/src/modules/payroll/frontend/hooks/use-employee";
import { getTodayIsoDate } from "@/src/shared/frontend/utils/local-date";
import { calculateSocialBenefits } from "@/src/modules/payroll/frontend/utils/prestaciones-calculator";
import { generateSocialBenefitsPdf } from "@/src/modules/payroll/frontend/utils/prestaciones-pdf";

import {
    formatCurrency,
    formatNumber,
    formatDateLong,
    makeDocumentId,
    useCalculatorBcv,
    SectionHeader,
    CalculatorPanelHeader,
    OnlyActiveToggle,
    EmployeeSelect,
    EmployeeInfoCard,
    BcvRateField,
    CalculatorFooter,
    FooterStat,
    FooterTotal,
    ConstanciaShell,
    ConstanciaWarning,
    LiquidoTotal,
    CalcRow,
    CalculatorLoading,
    CalculatorEmptyState,
} from "@/src/modules/payroll/frontend/components/calculator";

// ============================================================================
// HELPERS
// ============================================================================

function getErrorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

// ============================================================================
// CALC RESULT TYPE
// ============================================================================

interface SocialBenefitsCalculation {
    salaryVES:                   number;
    dailySalary:                 number;
    profitSharingQuota:          number;
    vacationBonusQuota:          number;
    integratedDailySalary:       number;
    yearsOfService:              number;
    completeMonths:              number;
    totalDays:                   number;
    quarterlyDays:               number;
    extraDays:                   number;
    totalSeniorityDays:          number;
    accumulatedBalance:          number;
    seniorityIndemnityGuarantee: number;
    finalAmount:                 number;
    isGuaranteeApplied:          boolean;
    socialBenefitsAdvance:       number;
    accumulatedInterests:        number;
    immediatePayment:            number;
    balanceInFavor:              number;
}

// ============================================================================
// CONSTANCIA — Social Benefits
// ============================================================================

interface SocialBenefitsConstancyProps {
    calc:                    SocialBenefitsCalculation;
    hireDate:                string;
    cutoffDate:              string;
    employeeName:            string;
    employeeIdNumber:        string;
    employeeRole?:           string;
    companyName:             string;
    companyLogoUrl?:         string;
    showLogoInPdf?:          boolean;
    advancePercentageString: string;
    interestRateString:      string;
}

function SocialBenefitsConstancy({
    calc, hireDate, cutoffDate, employeeName, employeeIdNumber, employeeRole,
    companyName, companyLogoUrl, showLogoInPdf, advancePercentageString, interestRateString,
}: SocialBenefitsConstancyProps) {
    const monthsRemainder = calc.completeMonths % 12;
    const seniorityString =
        `${calc.yearsOfService} año${calc.yearsOfService !== 1 ? "s" : ""}` +
        (monthsRemainder > 0 ? ` ${monthsRemainder} mes${monthsRemainder !== 1 ? "es" : ""}` : "");
    const documentId = makeDocumentId(companyName, employeeIdNumber, hireDate, cutoffDate);
    const hasAdvance = calc.socialBenefitsAdvance > 0 || calc.accumulatedInterests > 0;

    return (
        <ConstanciaShell
            companyName={companyName}
            companyLogoUrl={companyLogoUrl}
            showLogo={showLogoInPdf}
            title="Prestaciones Sociales"
            legalNote="Art. 142 LOTTT — Garantía y Acumulados"
            headerRight={
                <>
                    <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-1">Corte al</p>
                    <p className="font-mono text-[13px] font-bold text-foreground bg-surface-2 px-2.5 py-1 rounded inline-block border border-border-light">
                        {formatDateLong(cutoffDate)}
                    </p>
                </>
            }
            employeeName={employeeName}
            employeeCedula={employeeIdNumber}
            employeeCargo={employeeRole}
            yearsOfService={calc.yearsOfService}
            extraTenureLabel={monthsRemainder > 0 ? `${monthsRemainder}m` : undefined}
            kpis={[
                { label: "Salario Mensual",  value: formatCurrency(calc.salaryVES) },
                { label: "Fecha Ingreso",    value: formatDateLong(hireDate) },
                { label: "Antigüedad",       value: seniorityString,                                       tone: "primary" },
                { label: "Salario Integral", value: formatCurrency(calc.integratedDailySalary) + " /día", tone: "success" },
            ]}
            documentId={documentId}
        >
            {/* ── Prestaciones acumuladas ────────────────────────────────── */}
            <SectionHeader label="Prestaciones acumuladas (Art. 142)" />
            <div className="space-y-1">
                <CalcRow
                    label="Saldo Acumulado"
                    formula={`${calc.totalSeniorityDays}d totales acumulados`}
                    value={formatCurrency(calc.accumulatedBalance)}
                />
                <CalcRow
                    label="Garantía Art. 142.c"
                    formula={`30 d/año × ${calc.yearsOfService} años`}
                    value={formatCurrency(calc.seniorityIndemnityGuarantee)}
                />
            </div>
            <div className="flex justify-between items-baseline pt-4 mt-2 border-t border-border-light">
                <div>
                    <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--text-secondary)] block">
                        Monto total prestaciones
                    </span>
                    <span className="font-mono text-[10px] text-[var(--text-tertiary)] mt-1 block">
                        Saldo acumulado + Garantía
                    </span>
                </div>
                <span className="font-mono text-[20px] font-black tabular-nums text-foreground">
                    {formatCurrency(calc.finalAmount)}
                </span>
            </div>

            {/* ── Pago inmediato (conditional) ────────────────────────────── */}
            {hasAdvance && (
                <div className="mt-6 pt-6 border-t border-border-light/60">
                    <SectionHeader label="Pago inmediato (Art. 143 / 144 LOTTT)" tone="amber" />
                    <div className="space-y-1">
                        <CalcRow
                            label="Adelanto de Prestaciones"
                            formula={`Art. 144 — ${advancePercentageString}%`}
                            value={formatCurrency(calc.socialBenefitsAdvance)}
                            accent="amber"
                        />
                        <CalcRow
                            label="Intereses Acumulados"
                            formula={`Art. 143 — Tasa ${interestRateString}%`}
                            value={formatCurrency(calc.accumulatedInterests)}
                            accent="green"
                        />
                    </div>
                    <div className="flex justify-between items-baseline pt-4 mt-2 border-t border-border-light">
                        <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">
                            Total pago inmediato
                        </span>
                        <span className="font-mono text-[18px] font-black tabular-nums text-amber-500">
                            {formatCurrency(calc.immediatePayment)}
                        </span>
                    </div>

                    {/* Subtotal breakdown that leads into the saldo a favor */}
                    <div className="mt-4 space-y-1">
                        <div className="flex justify-between items-baseline">
                            <span className="font-mono text-[12px] text-[var(--text-secondary)]">Monto total prestaciones</span>
                            <span className="font-mono text-[12px] tabular-nums text-[var(--text-secondary)]">{formatCurrency(calc.finalAmount)}</span>
                        </div>
                        <div className="flex justify-between items-baseline text-amber-500/80">
                            <span className="font-mono text-[12px]">− Anticipo + Intereses</span>
                            <span className="font-mono text-[12px] tabular-nums">− {formatCurrency(calc.immediatePayment)}</span>
                        </div>
                    </div>
                </div>
            )}

            <LiquidoTotal
                label={hasAdvance ? "Saldo a Favor" : "Monto total prestaciones"}
                valueBs={calc.balanceInFavor}
            />
        </ConstanciaShell>
    );
}

// ============================================================================
// PAGE
// ============================================================================

export default function PrestacionesPage() {
    const { companyId, company } = useCompany();
    const { employees, loading } = useEmployee(companyId);

    // ── Employee selection ──────────────────────────────────────────────────
    const [selectedIdNumber, setSelectedIdNumber] = useState<string>("");
    const [onlyActive,       setOnlyActive]       = useState(true);
    const [salaryOverride,   setSalaryOverride]   = useState("");
    const [manualHireDate,   setManualHireDate]   = useState("");

    // ── BCV via shared hook ────────────────────────────────────────────────
    const {
        exchangeRate, setExchangeRate,
        bcvRate, bcvLoading, bcvFetchError, fetchBcvRate,
    } = useCalculatorBcv();

    // ── Params ──────────────────────────────────────────────────────────────
    const [cutoffDate,         setCutoffDate]         = useState(getTodayIsoDate());
    const [profitSharingDays,  setProfitSharingDays]  = useState("15");
    const [vacationBonusDays,  setVacationBonusDays]  = useState("15");
    const [interestRate,       setInterestRate]       = useState("3");
    const [advancePercentage,  setAdvancePercentage]  = useState("75");

    // ── Batch processing ────────────────────────────────────────────────────
    const filteredEmployees = useMemo(() => {
        const pool = onlyActive ? employees.filter(e => e.estado === "activo") : employees;
        if (!selectedIdNumber) return pool;
        return pool.filter(e => e.cedula === selectedIdNumber);
    }, [employees, onlyActive, selectedIdNumber]);

    const selectedEmp = useMemo(() => employees.find(e => e.cedula === selectedIdNumber), [employees, selectedIdNumber]);

    // Salary field auto-populated from employee data, overridable by user.
    const [salarySourceKey, setSalarySourceKey] = useState("");
    const currentSalaryKey = `${selectedEmp?.cedula ?? ""}|${bcvRate}`;
    if (salarySourceKey !== currentSalaryKey) {
        setSalarySourceKey(currentSalaryKey);
        if (selectedEmp) {
            const vesAmount = selectedEmp.moneda === "USD"
                ? selectedEmp.salarioMensual * bcvRate
                : selectedEmp.salarioMensual;
            setSalaryOverride(vesAmount.toFixed(2));
        } else {
            setSalaryOverride("");
        }
    }

    interface BenefitResult {
        employee:    Employee;
        calculation: SocialBenefitsCalculation | null;
        message?:    string;
    }

    const benefitResults = useMemo<BenefitResult[]>(() => {
        return filteredEmployees.map(emp => {
            const vesAmount = emp.moneda === "USD" ? emp.salarioMensual * bcvRate : emp.salarioMensual;
            const hire      = emp.fechaIngreso ?? "";
            const psDays    = parseInt(profitSharingDays) || 15;
            const vbDays    = parseInt(vacationBonusDays) || 15;

            const res = calculateSocialBenefits({
                salaryVES: vesAmount,
                hireDate: hire,
                cutoffDate: cutoffDate,
                profitSharingDays: psDays,
                vacationBonusDays: vbDays,
            });

            if (!res) return { employee: emp, calculation: null, message: "Verificar datos" };

            const dailyNormalSalary = vesAmount / 30;
            const psQuota           = dailyNormalSalary * psDays / 360;
            const vbQuota           = dailyNormalSalary * vbDays / 360;
            const guaranteeAmount   = 30 * res.integratedDailySalary * res.yearsOfService;
            const seniorityBalance  = res.seniorityIndemnityBalance;
            const isGuaranteeApplied = guaranteeAmount > seniorityBalance;
            const finalAmount       = Math.max(seniorityBalance, guaranteeAmount);
            const advancePctValue   = Math.min(100, Math.max(0, parseFloat(advancePercentage) || 75));
            const advanceValue      = seniorityBalance * (advancePctValue / 100);
            const rateValue         = Math.max(0, parseFloat(interestRate) || 0);
            const interestValue     = seniorityBalance * (rateValue / 100) * (res.completeMonths / 12);

            const calculation: SocialBenefitsCalculation = {
                salaryVES:                  vesAmount,
                dailySalary:                dailyNormalSalary,
                profitSharingQuota:         psQuota,
                vacationBonusQuota:         vbQuota,
                integratedDailySalary:      res.integratedDailySalary,
                yearsOfService:             res.yearsOfService,
                completeMonths:             res.completeMonths,
                totalDays:                  res.totalDays,
                quarterlyDays:              res.quarterlyDays,
                extraDays:                  res.extraDays,
                totalSeniorityDays:         res.totalSeniorityDays,
                accumulatedBalance:         seniorityBalance,
                seniorityIndemnityGuarantee: guaranteeAmount,
                finalAmount,
                isGuaranteeApplied,
                socialBenefitsAdvance:      advanceValue,
                accumulatedInterests:       interestValue,
                immediatePayment:           advanceValue + interestValue,
                balanceInFavor:             finalAmount - advanceValue - interestValue,
            };

            return { employee: emp, calculation };
        });
    }, [filteredEmployees, bcvRate, profitSharingDays, vacationBonusDays, cutoffDate, advancePercentage, interestRate]);

    const grandTotal = useMemo(
        () => benefitResults.reduce((acc, r) => acc + (r.calculation?.balanceInFavor ?? 0), 0),
        [benefitResults],
    );

    const vesSalary             = parseFloat(salaryOverride) || 0;
    const individualCalculation = benefitResults.length === 1 ? benefitResults[0].calculation : null;

    const [isExportingBatch, setIsExportingBatch] = useState(false);
    const handleBatchExport = async () => {
        setIsExportingBatch(true);
        try {
            for (const result of benefitResults) {
                if (!result.calculation) continue;
                const advPct = Math.min(100, Math.max(0, parseFloat(advancePercentage) || 75));
                const rate   = Math.max(0, parseFloat(interestRate) || 0);
                await generateSocialBenefitsPdf({
                    companyName: company?.name ?? "La Empresa",
                    employee: { name: result.employee.nombre, idNumber: result.employee.cedula, role: result.employee.cargo },
                    hireDate: result.employee.fechaIngreso ?? "",
                    cutoffDate,
                    yearsOfService:             result.calculation.yearsOfService,
                    completeMonths:             result.calculation.completeMonths,
                    totalDays:                  result.calculation.totalDays,
                    salaryVES:                  result.calculation.salaryVES,
                    dailySalary:                result.calculation.dailySalary,
                    profitSharingQuota:         result.calculation.profitSharingQuota,
                    vacationBonusQuota:         result.calculation.vacationBonusQuota,
                    integratedDailySalary:      result.calculation.integratedDailySalary,
                    quarterlyDays:              result.calculation.quarterlyDays,
                    extraDays:                  result.calculation.extraDays,
                    totalSeniorityDays:         result.calculation.totalSeniorityDays,
                    accumulatedBalance:         result.calculation.accumulatedBalance,
                    seniorityIndemnityGuarantee: result.calculation.seniorityIndemnityGuarantee,
                    finalAmount:                result.calculation.finalAmount,
                    isGuaranteeApplied:         result.calculation.isGuaranteeApplied,
                    socialBenefitsAdvance:      result.calculation.socialBenefitsAdvance,
                    accumulatedInterests:       result.calculation.accumulatedInterests,
                    immediatePayment:           result.calculation.immediatePayment,
                    balanceInFavor:             result.calculation.balanceInFavor,
                    advancePercentage:          advPct,
                    interestRate:               rate,
                    logoUrl:                    company?.logoUrl,
                    showLogoInPdf:              company?.showLogoInPdf,
                });
            }
        } catch (err: unknown) {
            console.error(err);
            alert("Error al exportar: " + getErrorMessage(err));
        } finally {
            setIsExportingBatch(false);
        }
    };

    const validResultsCount = benefitResults.filter(r => r.calculation).length;

    return (
        <div className="min-h-full bg-surface-2 flex flex-col overflow-hidden">
            <PageHeader
                title="Prestaciones Sociales"
                subtitle="Cálculo de garantía y acumulados (Art. 142 LOTTT)"
            >
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-light bg-surface-1 h-8 shadow-sm">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-tertiary)]">BCV</span>
                    <span className="font-mono text-[11px] font-semibold tabular-nums text-foreground">
                        {bcvLoading ? "..." : bcvRate.toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                    </span>
                    {bcvFetchError && <span className="w-1.5 h-1.5 rounded-full bg-red-400" title={bcvFetchError} />}
                </div>
            </PageHeader>

            <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
                {/* ══ LEFT PANEL ══════════════════════════════════════════════ */}
                <aside className="w-full lg:w-96 shrink-0 flex flex-col border-b lg:border-b-0 lg:border-r border-border-light bg-surface-1 overflow-y-auto">

                    <CalculatorPanelHeader />

                    <div className="flex-1 divide-y divide-border-light">
                        {/* ── Alcance ───────────────────────────────────────── */}
                        <div className="px-5 py-4 space-y-4">
                            <SectionHeader label="Alcance" />
                            <div className="space-y-4">
                                {!loading && employees.length > 0 && (
                                    <EmployeeSelect
                                        employees={employees}
                                        selectedCedula={selectedIdNumber}
                                        onChange={setSelectedIdNumber}
                                        onlyActive={onlyActive}
                                    />
                                )}
                                {selectedEmp && <EmployeeInfoCard employee={selectedEmp} />}
                                <OnlyActiveToggle checked={onlyActive} onChange={setOnlyActive} />
                            </div>

                            {selectedIdNumber && (
                                <div className="pt-2">
                                    <BaseInput.Field
                                        label="Salario mensual (Bs.)"
                                        type="number"
                                        step={0.01}
                                        min={0}
                                        value={salaryOverride}
                                        onValueChange={setSalaryOverride}
                                        placeholder="0.00"
                                        prefix="Bs."
                                        inputClassName="text-right"
                                    />
                                </div>
                            )}
                            {!selectedEmp && selectedIdNumber && (
                                <BaseInput.Field
                                    label="Fecha de ingreso"
                                    type="date"
                                    value={manualHireDate}
                                    onValueChange={setManualHireDate}
                                    startContent={<Calendar size={14} className="text-[var(--text-tertiary)]" />}
                                />
                            )}
                        </div>

                        {/* ── Tasa BCV ──────────────────────────────────────── */}
                        <div className="px-5 py-4">
                            <BcvRateField
                                value={exchangeRate}
                                onChange={setExchangeRate}
                                onRefresh={fetchBcvRate}
                                loading={bcvLoading}
                                error={bcvFetchError}
                            />
                        </div>

                        {/* ── Configuración temporal ─────────────────────── */}
                        <div className="px-5 py-5 space-y-4">
                            <SectionHeader label="Configuración Temporal" />
                            <BaseInput.Field
                                label="Fecha de corte"
                                type="date"
                                value={cutoffDate}
                                onValueChange={setCutoffDate}
                                startContent={<Calendar size={14} className="text-[var(--text-tertiary)]" />}
                            />
                            <div className="grid grid-cols-2 gap-3 pt-1">
                                <BaseInput.Field
                                    label="Días Util."
                                    type="number"
                                    min={15}
                                    max={120}
                                    step={1}
                                    value={profitSharingDays}
                                    onValueChange={setProfitSharingDays}
                                    startContent={<ClipboardCheck size={13} className="text-[var(--text-tertiary)]" />}
                                    inputClassName="text-right"
                                />
                                <BaseInput.Field
                                    label="Bono Vac."
                                    type="number"
                                    min={15}
                                    max={90}
                                    step={1}
                                    value={vacationBonusDays}
                                    onValueChange={setVacationBonusDays}
                                    startContent={<TrendingUp size={13} className="text-[var(--text-tertiary)]" />}
                                    inputClassName="text-right"
                                />
                            </div>
                        </div>

                        {/* ── Ajustes de Ley ────────────────────────────── */}
                        <div className="px-5 py-5 space-y-4 bg-surface-2/[0.03]">
                            <SectionHeader label="Ajustes de Ley" />
                            <div className="grid grid-cols-2 gap-3">
                                <BaseInput.Field
                                    label="Tasa Int."
                                    type="number"
                                    step={0.01}
                                    min={0}
                                    max={100}
                                    value={interestRate}
                                    onValueChange={setInterestRate}
                                    suffix="%"
                                    inputClassName="text-right"
                                />
                                <BaseInput.Field
                                    label="Anticipo"
                                    type="number"
                                    step={1}
                                    min={0}
                                    max={75}
                                    value={advancePercentage}
                                    onValueChange={setAdvancePercentage}
                                    suffix="%"
                                    inputClassName="text-right"
                                />
                            </div>
                        </div>

                        {/* ── Resumen de cálculo (single emp only) ───────── */}
                        <div className="px-5 py-4">
                            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-3 flex items-center gap-2">
                                <TrendingUp size={11} className="text-primary-500/60" />
                                Resumen de Cálculo
                            </p>
                            {individualCalculation ? (
                                <div className="rounded-xl border border-border-light bg-surface-2/30 overflow-hidden">
                                    <div className="px-4 py-3 space-y-1.5 border-b border-border-light/60">
                                        <div className="flex justify-between items-baseline">
                                            <span className="font-mono text-[11px] text-[var(--text-secondary)]">Salario mensual</span>
                                            <span className="font-mono text-[12px] font-semibold tabular-nums text-foreground">{formatCurrency(individualCalculation.salaryVES)}</span>
                                        </div>
                                        <div className="flex justify-between items-baseline">
                                            <span className="font-mono text-[11px] text-[var(--text-tertiary)]">Sal. diario</span>
                                            <span className="font-mono text-[11px] tabular-nums text-[var(--text-secondary)]">{formatNumber(individualCalculation.dailySalary)} /día</span>
                                        </div>
                                        <div className="flex justify-between items-baseline pt-1 border-t border-dashed border-border-light/60">
                                            <span className="font-mono text-[11px] font-bold text-[var(--text-secondary)]">Sal. integral / día</span>
                                            <span className="font-mono text-[12px] font-bold tabular-nums text-foreground">{formatNumber(individualCalculation.integratedDailySalary)} /día</span>
                                        </div>
                                    </div>
                                    <div className="px-4 py-3 space-y-1.5 border-b border-border-light/60">
                                        <div className="flex justify-between items-baseline">
                                            <span className="font-mono text-[11px] text-[var(--text-secondary)]">Saldo acumulado</span>
                                            <span className="font-mono text-[12px] font-semibold tabular-nums text-foreground">{formatCurrency(individualCalculation.accumulatedBalance)}</span>
                                        </div>
                                        <div className="flex justify-between items-baseline">
                                            <span className="font-mono text-[11px] text-[var(--text-tertiary)]">Garantía 142.c</span>
                                            <span className="font-mono text-[11px] tabular-nums text-[var(--text-secondary)]">{formatCurrency(individualCalculation.seniorityIndemnityGuarantee)}</span>
                                        </div>
                                    </div>
                                    <div className="px-4 py-3.5 flex justify-between items-center bg-surface-1">
                                        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--text-secondary)]">Saldo a favor</span>
                                        <span className="font-mono text-[18px] font-black tabular-nums text-foreground">{formatCurrency(individualCalculation.balanceInFavor)}</span>
                                    </div>
                                </div>
                            ) : (
                                <p className="font-mono text-[11px] text-[var(--text-tertiary)] pt-2">
                                    {vesSalary <= 0 ? "Ingresa el salario." : "Selecciona un empleado."}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* ── Footer ────────────────────────────────────────── */}
                    <CalculatorFooter
                        ctaLabel={`Generar PDF (${validResultsCount})`}
                        busy={isExportingBatch}
                        disabled={benefitResults.length === 0}
                        onCta={handleBatchExport}
                    >
                        {benefitResults.length > 0 && (
                            <>
                                <FooterStat label="Empleados" value={String(benefitResults.length)} />
                                <FooterTotal label="Total Gral. (Neto)" valueBs={grandTotal} bcvRate={bcvRate} tone="success" />
                            </>
                        )}
                    </CalculatorFooter>
                </aside>

                {/* ══ RIGHT PANEL ═════════════════════════════════════════════ */}
                <main className="flex-1 overflow-y-auto p-6 lg:p-10 bg-surface-2 lg:bg-surface-2/50 relative">
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:14px_14px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />
                    <div className="relative z-10 w-full h-full">
                        {loading ? (
                            <CalculatorLoading />
                        ) : benefitResults.length === 0 ? (
                            <CalculatorEmptyState
                                description="Selecciona un empleado de la lista y ajusta los parámetros de cálculo para previsualizar la constancia de prestaciones sociales."
                            />
                        ) : (
                            <div className="max-w-4xl mx-auto space-y-10 pb-12">
                                {benefitResults.map((result, i) => {
                                    if (result.message || !result.calculation) {
                                        return (
                                            <ConstanciaWarning
                                                key={result.employee.cedula}
                                                employeeName={result.employee.nombre}
                                                employeeCedula={result.employee.cedula}
                                                message={result.message ?? "Error"}
                                            />
                                        );
                                    }

                                    return (
                                        <motion.div
                                            key={result.employee.cedula}
                                            initial={{ opacity: 0, scale: 0.98, y: 15 }}
                                            animate={{ opacity: 1, scale: 1, y: 0 }}
                                            transition={{ delay: i * 0.05, ease: "easeOut" }}
                                        >
                                            <SocialBenefitsConstancy
                                                calc={result.calculation}
                                                hireDate={result.employee.fechaIngreso ?? ""}
                                                cutoffDate={cutoffDate}
                                                employeeName={result.employee.nombre}
                                                employeeIdNumber={result.employee.cedula}
                                                employeeRole={result.employee.cargo}
                                                companyName={company?.name ?? "La Empresa"}
                                                companyLogoUrl={company?.logoUrl}
                                                showLogoInPdf={company?.showLogoInPdf}
                                                advancePercentageString={advancePercentage}
                                                interestRateString={interestRate}
                                            />
                                        </motion.div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
}
