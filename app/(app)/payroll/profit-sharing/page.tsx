"use client";

import { useState, useMemo } from "react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import {
    Calendar, ClipboardCheck, HandCoins, Info,
} from "lucide-react";
import { motion } from "framer-motion";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useEmployee } from "@/src/modules/payroll/frontend/hooks/use-employee";
import type { Employee } from "@/src/modules/payroll/frontend/hooks/use-employee";
import { getTodayIsoDate } from "@/src/shared/frontend/utils/local-date";
import {
    generateFullProfitSharingPdf,
    generateFractionalProfitSharingPdf,
} from "@/src/modules/payroll/frontend/utils/utilidades-pdf";

import {
    formatCurrency,
    formatNumber,
    formatDateLong,
    makeDocumentId,
    LABEL_CLS,
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
// HELPERS — date math (utilidades-specific)
// ============================================================================

function getErrorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

/** Complete calendar months between two ISO dates */
function getCompleteMonths(from: string, to: string): number {
    if (!from || !to) return 0;
    const a = new Date(from + "T00:00:00");
    const b = new Date(to + "T00:00:00");
    if (b <= a) return 0;
    let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
    if (b.getDate() < a.getDate()) m--;
    return Math.max(0, m);
}

function getYearStart(year: number): string { return `${year}-01-01`; }
function maxDate(a: string, b: string): string { return a > b ? a : b; }

// ============================================================================
// CALCULATION ENGINES — preserve verbatim
// ============================================================================

interface FullProfitSharing {
    salaryVES:         number;
    dailySalary:       number;
    profitSharingDays: number;
    amount:            number;
    fiscalYear:        number;
}

function calculateFull(
    salaryVES: number,
    profitSharingDays: number,
    fiscalYear: number,
): FullProfitSharing | null {
    if (salaryVES <= 0 || profitSharingDays <= 0) return null;
    const dailySalary = salaryVES / 30;
    const amount      = profitSharingDays * dailySalary;
    return { salaryVES, dailySalary, profitSharingDays, amount, fiscalYear };
}

interface FractionalProfitSharing {
    salaryVES:         number;
    dailySalary:       number;
    profitSharingDays: number;
    fiscalYear:        number;
    fiscalStart:       string;
    periodStart:       string;
    monthsWorked:      number;
    fractionalDays:    number;
    amount:            number;
}

function calculateFractional(
    salaryVES: number,
    profitSharingDays: number,
    fiscalYear: number,
    hireDate: string,
    cutoffDate: string,
): FractionalProfitSharing | null {
    if (salaryVES <= 0 || profitSharingDays <= 0 || !hireDate || !cutoffDate) return null;

    const fiscalStart = getYearStart(fiscalYear);
    const periodStart = maxDate(fiscalStart, hireDate);

    if (cutoffDate <= periodStart) return null;

    const monthsWorked = getCompleteMonths(periodStart, cutoffDate);
    if (monthsWorked <= 0) return null;

    const fractionalDays = Math.ceil((profitSharingDays / 12) * monthsWorked);
    const dailySalary    = salaryVES / 30;
    const amount         = fractionalDays * dailySalary;

    return {
        salaryVES, dailySalary, profitSharingDays, fiscalYear,
        fiscalStart, periodStart, monthsWorked, fractionalDays, amount,
    };
}

// ============================================================================
// CONSTANCIA — Completas
// ============================================================================

interface FullConstancyProps {
    calc:             FullProfitSharing;
    employeeName:     string;
    employeeIdNumber: string;
    employeeRole?:    string;
    companyName:      string;
    companyLogoUrl?:  string;
    showLogoInPdf?:   boolean;
}

function FullConstancy({
    calc, employeeName, employeeIdNumber, employeeRole,
    companyName, companyLogoUrl, showLogoInPdf,
}: FullConstancyProps) {
    const documentId = makeDocumentId(`${employeeIdNumber}|${calc.fiscalYear}|completas`);

    return (
        <ConstanciaShell
            companyName={companyName}
            companyLogoUrl={companyLogoUrl}
            showLogo={showLogoInPdf}
            title="Constancia de Utilidades Completas"
            legalNote="Art. 131 + 174 LOTTT"
            headerRight={
                <>
                    <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-1">Año Fiscal</p>
                    <p className="font-mono text-[13px] font-bold text-foreground bg-surface-2 px-2.5 py-1 rounded inline-block border border-border-light">
                        {calc.fiscalYear}
                    </p>
                </>
            }
            employeeName={employeeName || "—"}
            employeeCedula={employeeIdNumber || "—"}
            employeeCargo={employeeRole}
            yearsOfService={0}
            kpis={[
                { label: "Salario Mensual", value: formatCurrency(calc.salaryVES) },
                { label: "Año Fiscal",      value: String(calc.fiscalYear) },
                { label: "Días Base",       value: `${calc.profitSharingDays} días`, tone: "primary" },
                { label: "Salario Diario",  value: `${formatCurrency(calc.dailySalary)} / día` },
            ]}
            documentId={documentId}
        >
            <SectionHeader label="Conceptos" />
            <div className="space-y-1">
                <CalcRow
                    label="Utilidades Anuales"
                    formula={`Art. 131 + 174 LOTTT · ${calc.profitSharingDays}d × ${formatNumber(calc.dailySalary)}/día`}
                    value={formatCurrency(calc.amount)}
                />
            </div>
            <LiquidoTotal valueBs={calc.amount} />
        </ConstanciaShell>
    );
}

// ============================================================================
// CONSTANCIA — Fraccionada
// ============================================================================

interface FractionalConstancyProps {
    calc:             FractionalProfitSharing;
    employeeName:     string;
    employeeIdNumber: string;
    employeeRole?:    string;
    companyName:      string;
    companyLogoUrl?:  string;
    showLogoInPdf?:   boolean;
    hireDate:         string;
    cutoffDate:       string;
}

function FractionalConstancy({
    calc, employeeName, employeeIdNumber, employeeRole,
    companyName, companyLogoUrl, showLogoInPdf,
    cutoffDate,
}: FractionalConstancyProps) {
    const documentId = makeDocumentId(`${employeeIdNumber}|${cutoffDate}|fraccionadas`);

    return (
        <ConstanciaShell
            companyName={companyName}
            companyLogoUrl={companyLogoUrl}
            showLogo={showLogoInPdf}
            title="Constancia de Utilidades Fraccionadas"
            legalNote="Art. 175 LOTTT"
            headerRight={
                <>
                    <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-1">Corte al</p>
                    <p className="font-mono text-[13px] font-bold text-foreground bg-surface-2 px-2.5 py-1 rounded inline-block border border-border-light">
                        {formatDateLong(cutoffDate)}
                    </p>
                </>
            }
            employeeName={employeeName || "—"}
            employeeCedula={employeeIdNumber || "—"}
            employeeCargo={employeeRole}
            yearsOfService={0}
            extraTenureLabel={`${calc.monthsWorked}m en ${calc.fiscalYear}`}
            kpis={[
                { label: "Salario Mensual", value: formatCurrency(calc.salaryVES) },
                { label: "Inicio Período",  value: formatDateLong(calc.periodStart) },
                { label: "Meses Trab.",     value: `${calc.monthsWorked} mes${calc.monthsWorked !== 1 ? "es" : ""}`, tone: "primary" },
                { label: "Salario Diario",  value: `${formatCurrency(calc.dailySalary)} / día` },
            ]}
            documentId={documentId}
        >
            <SectionHeader label="Conceptos" />
            <div className="space-y-1">
                <CalcRow
                    label="Utilidades Fraccionadas"
                    formula={`Art. 175 LOTTT · ⌈ ${calc.profitSharingDays}d / 12 × ${calc.monthsWorked} meses ⌉`}
                    value={formatCurrency(calc.amount)}
                />
            </div>
            <LiquidoTotal valueBs={calc.amount} />
        </ConstanciaShell>
    );
}

// ============================================================================
// PAGE
// ============================================================================

type Mode = "completas" | "fraccionadas";

export default function UtilidadesPage() {
    const { companyId, company } = useCompany();
    const { employees, loading } = useEmployee(companyId);

    // ── Mode ────────────────────────────────────────────────────────────────
    const [mode, setMode] = useState<Mode>("completas");

    // ── Employee selection ──────────────────────────────────────────────────
    const [selectedIdNumber, setSelectedIdNumber] = useState<string>("");
    const [onlyActive,       setOnlyActive]       = useState(true);
    const [salaryOverride,   setSalaryOverride]   = useState("");
    const [manualHireDate,   setManualHireDate]   = useState("");

    // ── BCV via shared hook ─────────────────────────────────────────────────
    const {
        exchangeRate, setExchangeRate,
        bcvRate, bcvLoading, bcvFetchError, fetchBcvRate,
    } = useCalculatorBcv();

    // ── Selected employee + salary sync ─────────────────────────────────────
    const selectedEmp = useMemo(() => employees.find(e => e.cedula === selectedIdNumber), [employees, selectedIdNumber]);

    const [salarySourceKey, setSalarySourceKey] = useState("");
    const currentSalaryKey = `${selectedEmp?.cedula ?? ""}|${bcvRate}`;
    if (salarySourceKey !== currentSalaryKey) {
        setSalarySourceKey(currentSalaryKey);
        if (selectedEmp) {
            const ves = selectedEmp.moneda === "USD"
                ? selectedEmp.salarioMensual * bcvRate
                : selectedEmp.salarioMensual;
            setSalaryOverride(ves.toFixed(2));
        } else {
            setSalaryOverride("");
        }
    }

    const salaryVES = parseFloat(salaryOverride) || 0;
    const hireDate  = selectedEmp?.fechaIngreso ?? manualHireDate;

    // ── Shared params ───────────────────────────────────────────────────────
    const currentYear = new Date().getFullYear();
    const [fiscalYear,        setFiscalYear]        = useState(String(currentYear));
    const [profitSharingDays, setProfitSharingDays] = useState("15");
    const [cutoffDate,        setCutoffDate]        = useState(getTodayIsoDate());

    // ── Single-employee preview calcs (resumen panel) ───────────────────────
    const fullCalculation = useMemo(
        () => calculateFull(salaryVES, parseInt(profitSharingDays) || 0, parseInt(fiscalYear) || currentYear),
        [salaryVES, profitSharingDays, fiscalYear, currentYear],
    );

    const fractionalCalculation = useMemo(
        () => calculateFractional(
            salaryVES,
            parseInt(profitSharingDays) || 0,
            parseInt(fiscalYear) || currentYear,
            hireDate,
            cutoffDate,
        ),
        [salaryVES, profitSharingDays, fiscalYear, hireDate, cutoffDate, currentYear],
    );

    // ── Batch processing ────────────────────────────────────────────────────
    interface CalculationResult {
        emp:  Employee;
        calc: FullProfitSharing | FractionalProfitSharing | null;
        msg?: string;
    }

    const filteredEmployees = useMemo(() => {
        const pool = onlyActive ? employees.filter(e => e.estado === "activo") : employees;
        if (!selectedIdNumber) return pool;
        return pool.filter(e => e.cedula === selectedIdNumber);
    }, [employees, onlyActive, selectedIdNumber]);

    const calculationResults = useMemo<CalculationResult[]>(() => {
        return filteredEmployees.map(emp => {
            const ves = emp.moneda === "USD" ? emp.salarioMensual * bcvRate : emp.salarioMensual;
            const ing = emp.fechaIngreso ?? "";

            let calc: FullProfitSharing | FractionalProfitSharing | null = null;
            let msg: string | undefined;

            if (mode === "completas") {
                calc = calculateFull(ves, parseInt(profitSharingDays) || 0, parseInt(fiscalYear) || currentYear);
                if (!calc) msg = "Verificar parámetros";
            } else {
                calc = calculateFractional(ves, parseInt(profitSharingDays) || 0, parseInt(fiscalYear) || currentYear, ing, cutoffDate);
                if (!calc) msg = "Verificar fechas/parámetros";
            }

            return { emp, calc, msg };
        });
    }, [filteredEmployees, mode, profitSharingDays, fiscalYear, currentYear, cutoffDate, bcvRate]);

    const totalAmount = useMemo(
        () => calculationResults.reduce((acc, r) => acc + (r.calc?.amount ?? 0), 0),
        [calculationResults],
    );

    const observationsCount = calculationResults.filter(r => r.msg).length;

    const [isExportingBatch, setIsExportingBatch] = useState(false);
    const handleExportBatch = async () => {
        setIsExportingBatch(true);
        try {
            for (const r of calculationResults) {
                if (!r.calc) continue;
                if (mode === "completas") {
                    const c = r.calc as FullProfitSharing;
                    await generateFullProfitSharingPdf({
                        companyName: company?.name ?? "La Empresa",
                        employee: { name: r.emp.nombre, idNumber: r.emp.cedula, role: r.emp.cargo },
                        fiscalYear:        c.fiscalYear,
                        salaryVES:         c.salaryVES,
                        dailySalary:       c.dailySalary,
                        profitSharingDays: c.profitSharingDays,
                        amount:            c.amount,
                        logoUrl:           company?.logoUrl,
                        showLogoInPdf:     company?.showLogoInPdf,
                    });
                } else {
                    const c = r.calc as FractionalProfitSharing;
                    await generateFractionalProfitSharingPdf({
                        companyName: company?.name ?? "La Empresa",
                        employee: { name: r.emp.nombre, idNumber: r.emp.cedula, role: r.emp.cargo },
                        fiscalYear:        c.fiscalYear,
                        hireDate:          r.emp.fechaIngreso ?? "",
                        cutoffDate:        cutoffDate,
                        fiscalStart:       c.fiscalStart,
                        periodStart:       c.periodStart,
                        monthsWorked:      c.monthsWorked,
                        profitSharingDays: c.profitSharingDays,
                        fractionalDays:    c.fractionalDays,
                        salaryVES:         c.salaryVES,
                        dailySalary:       c.dailySalary,
                        amount:            c.amount,
                        logoUrl:           company?.logoUrl,
                        showLogoInPdf:     company?.showLogoInPdf,
                    });
                }
            }
        } catch (err: unknown) {
            console.error(err);
            alert("Error al exportar: " + getErrorMessage(err));
        } finally {
            setIsExportingBatch(false);
        }
    };

    const validResultsCount = calculationResults.filter(r => r.calc).length;

    return (
        <div className="min-h-full bg-surface-2 flex flex-col overflow-hidden">
            <PageHeader
                title="Utilidades"
                subtitle="Cálculo de utilidades anuales y fraccionadas (Arts. 131 · 174 LOTTT)"
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

                    {/* Mode toggle */}
                    <div className="px-5 py-5 border-b border-border-light bg-surface-2/[0.03]">
                        <label className={LABEL_CLS + " mb-2"}>Tipo de Utilidades</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setMode("completas")}
                                className={[
                                    "flex items-center justify-center gap-2 h-9 rounded-lg border font-mono text-[11px] uppercase tracking-[0.1em] transition-all",
                                    mode === "completas"
                                        ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-700"
                                        : "bg-surface-1 border-border-light text-[var(--text-secondary)] hover:border-border-medium",
                                ].join(" ")}
                            >
                                <ClipboardCheck size={14} /> Completas
                            </button>
                            <button
                                type="button"
                                onClick={() => setMode("fraccionadas")}
                                className={[
                                    "flex items-center justify-center gap-2 h-9 rounded-lg border font-mono text-[11px] uppercase tracking-[0.1em] transition-all",
                                    mode === "fraccionadas"
                                        ? "bg-amber-500/10 border-amber-500/50 text-amber-700"
                                        : "bg-surface-1 border-border-light text-[var(--text-secondary)] hover:border-border-medium",
                                ].join(" ")}
                            >
                                <HandCoins size={14} /> Fraccionadas
                            </button>
                        </div>
                    </div>

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

                        {/* ── Configuración fiscal ───────────────────────── */}
                        <div className="px-5 py-5 space-y-4">
                            <SectionHeader label="Configuración Fiscal" />
                            <div className="grid grid-cols-2 gap-3">
                                <BaseInput.Field
                                    label="Año fiscal"
                                    type="number"
                                    min={2000}
                                    max={2100}
                                    step={1}
                                    value={fiscalYear}
                                    onValueChange={setFiscalYear}
                                    startContent={<Calendar size={13} className="text-[var(--text-tertiary)]" />}
                                    inputClassName="text-right"
                                />
                                <BaseInput.Field
                                    label="Días util."
                                    type="number"
                                    min={15}
                                    max={120}
                                    step={1}
                                    value={profitSharingDays}
                                    onValueChange={setProfitSharingDays}
                                    startContent={<HandCoins size={13} className="text-[var(--text-tertiary)]" />}
                                    inputClassName="text-right"
                                />
                            </div>
                            <p className="font-mono text-[10px] text-[var(--text-disabled)] leading-relaxed">
                                <Info size={10} className="inline mr-1 -mt-0.5" />
                                Basado en Arts. 131 y 174 de la LOTTT.
                            </p>
                        </div>

                        {/* ── Mode-specific preview ─────────────────────── */}
                        {mode === "completas" && (
                            <div className="px-5 py-4 space-y-0.5">
                                <SectionHeader label="Resumen Completas" tone="green" />
                                {fullCalculation ? (
                                    <>
                                        <CalcRow label="Salario mensual" value={formatCurrency(fullCalculation.salaryVES)} dim />
                                        <CalcRow
                                            label="Salario diario"
                                            formula="salario ÷ 30"
                                            value={`${formatNumber(fullCalculation.dailySalary)} Bs./día`}
                                            dim
                                        />
                                        <div className="border-t border-border-light my-2" />
                                        <CalcRow
                                            label="Días de utilidades"
                                            formula="Mín. 15, máx. 120"
                                            value={`${fullCalculation.profitSharingDays} días`}
                                            dim
                                        />
                                        <CalcRow
                                            label="Monto"
                                            formula={`${fullCalculation.profitSharingDays}d × ${formatNumber(fullCalculation.dailySalary)} Bs./día`}
                                            value={formatCurrency(fullCalculation.amount)}
                                            accent="green"
                                        />
                                        <div className="border-t border-border-light my-2" />
                                        <div className="flex items-baseline justify-between pt-1">
                                            <span className="font-mono text-[12px] font-bold uppercase tracking-[0.18em] text-[var(--text-secondary)]">Total</span>
                                            <span className="font-mono text-[20px] font-black tabular-nums text-emerald-500">{formatCurrency(fullCalculation.amount)}</span>
                                        </div>
                                    </>
                                ) : (
                                    <p className="font-mono text-[11px] text-[var(--text-tertiary)] pt-2">
                                        Selecciona un empleado y define los parámetros.
                                    </p>
                                )}
                            </div>
                        )}

                        {mode === "fraccionadas" && (
                            <div className="px-5 py-4 space-y-3">
                                <BaseInput.Field
                                    label="Fecha de corte"
                                    type="date"
                                    value={cutoffDate}
                                    onValueChange={setCutoffDate}
                                    startContent={<Calendar size={14} className="text-[var(--text-tertiary)]" />}
                                />

                                <SectionHeader label="Resumen Fracc." tone="amber" />
                                {fractionalCalculation ? (
                                    <div className="space-y-0.5">
                                        <CalcRow
                                            label="Meses trabajados"
                                            formula={`Desde ${formatDateLong(fractionalCalculation.periodStart)}`}
                                            value={`${fractionalCalculation.monthsWorked} meses`}
                                            dim
                                        />
                                        <CalcRow
                                            label="Días proporcionales"
                                            formula={`⌈ ${fractionalCalculation.profitSharingDays}d / 12m × ${fractionalCalculation.monthsWorked}m ⌉`}
                                            value={`${fractionalCalculation.fractionalDays} días`}
                                            dim
                                        />
                                        <div className="border-t border-border-light my-2" />
                                        <CalcRow
                                            label="Monto"
                                            formula={`${fractionalCalculation.fractionalDays}d × ${formatNumber(fractionalCalculation.dailySalary)} Bs./día`}
                                            value={formatCurrency(fractionalCalculation.amount)}
                                            accent="amber"
                                        />
                                        <div className="border-t border-border-light my-2" />
                                        <div className="flex items-baseline justify-between pt-1">
                                            <span className="font-mono text-[12px] font-bold uppercase tracking-[0.18em] text-[var(--text-secondary)]">Total</span>
                                            <span className="font-mono text-[20px] font-black tabular-nums text-amber-500">{formatCurrency(fractionalCalculation.amount)}</span>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="font-mono text-[11px] text-[var(--text-tertiary)] pt-2">
                                        Verifica salario, fechas y parámetros.
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* ── Footer ────────────────────────────────────────── */}
                    <CalculatorFooter
                        ctaLabel={`Generar PDF (${validResultsCount})`}
                        busy={isExportingBatch}
                        disabled={calculationResults.length === 0 || calculationResults.every(r => !r.calc)}
                        onCta={handleExportBatch}
                    >
                        {calculationResults.length > 0 && (
                            <>
                                <FooterStat label="Empleados" value={String(calculationResults.length)} />
                                {observationsCount > 0 && (
                                    <FooterStat label="Observaciones" value={String(observationsCount)} tone="amber" />
                                )}
                                <FooterTotal label="Total Gral." valueBs={totalAmount} bcvRate={bcvRate} />
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
                        ) : calculationResults.length === 0 ? (
                            <CalculatorEmptyState
                                description={`Selecciona un empleado y ajusta los parámetros para previsualizar la constancia de utilidades ${mode === "completas" ? "completas" : "fraccionadas"}.`}
                            />
                        ) : (
                            <div className="max-w-4xl mx-auto space-y-10 pb-12">
                                {calculationResults.map((result, i) => {
                                    if (result.msg || !result.calc) {
                                        return (
                                            <ConstanciaWarning
                                                key={result.emp.cedula}
                                                employeeName={result.emp.nombre}
                                                employeeCedula={result.emp.cedula}
                                                message={result.msg ?? "Error"}
                                            />
                                        );
                                    }

                                    return (
                                        <motion.div
                                            key={result.emp.cedula}
                                            initial={{ opacity: 0, scale: 0.98, y: 15 }}
                                            animate={{ opacity: 1, scale: 1, y: 0 }}
                                            transition={{ delay: i * 0.05, ease: "easeOut" }}
                                        >
                                            {mode === "completas" ? (
                                                <FullConstancy
                                                    calc={result.calc as FullProfitSharing}
                                                    employeeName={result.emp.nombre}
                                                    employeeIdNumber={result.emp.cedula}
                                                    employeeRole={result.emp.cargo}
                                                    companyName={company?.name ?? "La Empresa"}
                                                    companyLogoUrl={company?.logoUrl}
                                                    showLogoInPdf={company?.showLogoInPdf}
                                                />
                                            ) : (
                                                <FractionalConstancy
                                                    calc={result.calc as FractionalProfitSharing}
                                                    employeeName={result.emp.nombre}
                                                    employeeIdNumber={result.emp.cedula}
                                                    employeeRole={result.emp.cargo}
                                                    companyName={company?.name ?? "La Empresa"}
                                                    companyLogoUrl={company?.logoUrl}
                                                    showLogoInPdf={company?.showLogoInPdf}
                                                    hireDate={result.emp.fechaIngreso ?? ""}
                                                    cutoffDate={cutoffDate}
                                                />
                                            )}
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
