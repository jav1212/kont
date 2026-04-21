"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { FileText, Download, RefreshCw, Users, Calendar, TrendingUp, Percent, Info, ClipboardCheck, ChevronDown, Clock } from "lucide-react";
import { motion } from "framer-motion";
import { useCompany }  from "@/src/modules/companies/frontend/hooks/use-companies";
import { useEmployee } from "@/src/modules/payroll/frontend/hooks/use-employee";
import type { Employee } from "@/src/modules/payroll/frontend/hooks/use-employee";
import { getTodayIsoDate } from "@/src/shared/frontend/utils/local-date";
import { calculateSocialBenefits } from "@/src/modules/payroll/frontend/utils/prestaciones-calculator";
import { generateSocialBenefitsPdf } from "@/src/modules/payroll/frontend/utils/prestaciones-pdf";

// ============================================================================
// HELPERS
// ============================================================================

const formatCurrency = (n: number) =>
    "Bs. " + n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatNumber = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fieldCls = [
    "w-full h-9 px-3 rounded-lg border border-border-light bg-surface-1 outline-none",
    "font-mono text-[13px] text-foreground tabular-nums appearance-none",
    "focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150",
].join(" ");

const labelCls = "font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] mb-1.5 block";

function isoToday(): string { return getTodayIsoDate(); }

function getErrorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

function formatDate(iso: string): string {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    const months = ["enero","febrero","marzo","abril","mayo","junio",
                   "julio","agosto","septiembre","octubre","noviembre","diciembre"];
    return `${parseInt(d)} de ${months[parseInt(m) - 1]} de ${y}`;
}

function makeDocumentId(...parts: Array<string | number | undefined>): string {
    const seed = parts.filter(Boolean).join("|");
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    }
    return hash.toString(36).toUpperCase().padStart(6, "0").slice(-6);
}

// ============================================================================
// CALC RESULT TYPE
// ============================================================================

interface SocialBenefitsCalculation {
    salaryVES:              number;
    dailySalary:            number;
    profitSharingQuota:     number;
    vacationBonusQuota:     number;
    integratedDailySalary:  number;
    yearsOfService:         number;
    completeMonths:         number;
    totalDays:              number;
    quarterlyDays:          number;
    extraDays:              number;
    totalSeniorityDays:     number;
    accumulatedBalance:     number;
    seniorityIndemnityGuarantee: number;
    finalAmount:            number;
    isGuaranteeApplied:     boolean;
    socialBenefitsAdvance:  number;
    accumulatedInterests:   number;
    immediatePayment:       number;   // advance + interests
    balanceInFavor:         number;   // finalAmount − advance − interests
}

// ============================================================================
// SHARED UI ATOMS
// ============================================================================

function SectionHeader({ label, color }: { label: string; color?: "green" | "amber" }) {
    const cls = color === "amber" ? "text-amber-500/70"
              : color === "green" ? "text-emerald-500/70"
              : "text-[var(--text-tertiary)]";
    return <p className={`font-mono text-[11px] uppercase tracking-[0.2em] mb-2 pt-1 ${cls}`}>{label}</p>;
}

function CalcRow({ label, formula, value, accent, dim }: {
    label: string; formula?: string; value: string;
    accent?: "green" | "amber"; dim?: boolean;
}) {
    const valCls = dim ? "text-[var(--text-tertiary)]"
        : accent === "green"  ? "text-emerald-500"
        : accent === "amber"  ? "text-amber-500"
        : "text-foreground";
    return (
        <div className="flex items-start justify-between gap-2 py-1.5 border-b border-border-light/60 last:border-0">
            <div className="min-w-0">
                <span className="font-mono text-[13px] text-[var(--text-secondary)] leading-snug">{label}</span>
                {formula && <div className="font-mono text-[12px] text-[var(--text-tertiary)] mt-0.5 tabular-nums">{formula}</div>}
            </div>
            <span className={`font-mono text-[13px] font-bold tabular-nums shrink-0 ${valCls}`}>{value}</span>
        </div>
    );
}

// ============================================================================
// RIGHT PANEL — Social Benefits Constancy
// ============================================================================

function SocialBenefitsConstancy({ calc, hireDate, cutoffDate, employeeName, employeeIdNumber,
    employeeRole, companyName, companyLogoUrl, showLogoInPdf, advancePercentageString, interestRateString }: {
    calc: SocialBenefitsCalculation;
    hireDate: string; cutoffDate: string;
    employeeName: string; employeeIdNumber: string; employeeRole?: string;
    companyName: string; companyLogoUrl?: string; showLogoInPdf?: boolean;
    advancePercentageString: string;
    interestRateString: string;
}) {
    const monthsRemainder = calc.completeMonths % 12;
    const seniorityString = `${calc.yearsOfService} año${calc.yearsOfService !== 1 ? "s" : ""}${monthsRemainder > 0 ? ` ${monthsRemainder} mes${monthsRemainder !== 1 ? "es" : ""}` : ""}`;
    const issuedAt = new Date().toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
    const documentId = makeDocumentId(companyName, employeeIdNumber, hireDate, cutoffDate);

    return (
        <div className="mb-2 bg-surface-1 rounded-[1.5rem] overflow-hidden shadow-sm shadow-black/5 border border-border-light max-w-3xl mx-auto flex flex-col">
            <div className="px-8 py-6 border-b border-border-light bg-surface-2/30 flex items-start justify-between gap-6">
                <div className="flex flex-row items-center gap-4">
                    {(showLogoInPdf && companyLogoUrl) && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={companyLogoUrl} alt="Logo" className="max-h-12 w-auto object-contain shrink-0" />
                    )}
                    <div>
                        <p className="text-[20px] font-black uppercase tracking-tight text-foreground leading-none">{companyName}</p>
                        <p className="text-[11px] text-[var(--text-tertiary)] mt-2 uppercase tracking-[0.2em] font-semibold">PRESTACIONES SOCIALES</p>
                        <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 font-medium">Art. 142 LOTTT — Garantía y Acumulados</p>
                    </div>
                </div>
                <div className="text-right shrink-0">
                    <p className="text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-0.5">Corte al</p>
                    <p className="text-[13px] font-bold text-foreground bg-surface-2 px-2.5 py-1 rounded inline-block border border-border-light">{formatDate(cutoffDate)}</p>
                    <p className="text-[9px] text-[var(--text-tertiary)] mt-2 uppercase">Emitido: {issuedAt}</p>
                </div>
            </div>

            <div className="px-8 py-5 border-b border-border-light flex flex-col sm:flex-row items-center justify-between bg-surface-1">
                <div className="flex items-center gap-4 w-full">
                    <div className="flex-shrink-0 w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center border border-border-light text-[var(--text-tertiary)] transition-colors">
                        <Users size={20} />
                    </div>
                    <div className="flex-1">
                        <p className="text-[16px] font-bold text-foreground tracking-tight">{employeeName}</p>
                        {employeeRole && <p className="text-[11px] uppercase tracking-[0.1em] text-[var(--text-secondary)] font-medium mt-0.5">{employeeRole}</p>}
                    </div>
                    <div className="text-right shrink-0 pl-5 md:pr-4 border-l border-border-light">
                        <p className="text-[13px] font-bold text-foreground tabular-nums">CI {employeeIdNumber}</p>
                        <div className="inline-flex items-center gap-1.5 mt-1 text-[11px] text-[var(--text-secondary)] font-medium bg-surface-2 px-2 py-0.5 rounded border border-border-light">
                            <Clock size={12} className="text-[var(--text-tertiary)]" />
                            {seniorityString}
                        </div>
                    </div>
                </div>
            </div>

            <div className="px-8 py-5 grid grid-cols-2 lg:grid-cols-4 gap-6 border-b border-border-light bg-surface-2/20">
                {[
                    { lbl: "Salario Mensual",  val: formatCurrency(calc.salaryVES), color: "text-foreground" },
                    { lbl: "Fecha Ingreso", val: formatDate(hireDate), color: "text-foreground" },
                    { lbl: "Antigüedad",val: seniorityString, color: "text-primary-500" },
                    { lbl: "Salario Integral",val: formatCurrency(calc.integratedDailySalary) + " /día", color: "text-emerald-500 font-bold bg-emerald-500/10 px-2 py-0.5 rounded inline-flex border border-emerald-500/20" },
                ].map((item, idx) => (
                    <div key={idx}>
                        <p className="text-[10px] uppercase tracking-[0.15em] text-[var(--text-tertiary)] mb-1 font-bold">{item.lbl}</p>
                        <p className={`text-[13px] font-bold tabular-nums ${item.color}`}>{item.val}</p>
                    </div>
                ))}
            </div>

            <div className="px-8 py-5 border-b border-border-light">
                <SectionHeader label="Prestaciones acumuladas (Art. 142)" />
                <div className="space-y-1">
                    <CalcRow label="Saldo Acumulado" formula={`${calc.totalSeniorityDays}d totales acumulados`} value={formatCurrency(calc.accumulatedBalance)} />
                    <CalcRow label="Garantía Art. 142.c" formula={`30 d/año × ${calc.yearsOfService} años`} value={formatCurrency(calc.seniorityIndemnityGuarantee)} />
                </div>
                <div className="flex justify-between items-baseline pt-4 mt-2 border-t border-border-light">
                    <div>
                        <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--text-secondary)] block">Monto total prestaciones</span>
                        <span className="font-mono text-[10px] text-[var(--text-tertiary)] mt-1 block">Saldo acumulado + Garantía</span>
                    </div>
                    <span className="font-mono text-[20px] font-black tabular-nums text-foreground">{formatCurrency(calc.finalAmount)}</span>
                </div>
            </div>

            {(calc.socialBenefitsAdvance > 0 || calc.accumulatedInterests > 0) && (
                <div className="px-8 py-5 border-b border-border-light bg-surface-2/30">
                    <SectionHeader label="Pago inmediato (Art. 143 / 144 LOTTT)" color="amber" />
                    <div className="space-y-1">
                        <CalcRow label="Adelanto de Prestaciones" formula={`Art. 144 — ${advancePercentageString}%`} value={formatCurrency(calc.socialBenefitsAdvance)} accent="amber" />
                        <CalcRow label="Intereses Acumulados" formula={`Art. 143 — Tasa ${interestRateString}%`} value={formatCurrency(calc.accumulatedInterests)} accent="green" />
                    </div>
                    <div className="flex justify-between items-baseline pt-4 mt-2 border-t border-border-light">
                        <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Total pago inmediato</span>
                        <span className="font-mono text-[18px] font-black tabular-nums text-amber-500">{formatCurrency(calc.immediatePayment)}</span>
                    </div>
                </div>
            )}

            <div className="px-8 py-6">
                {(calc.socialBenefitsAdvance > 0 || calc.accumulatedInterests > 0) && (
                    <div className="mb-4">
                        <div className="flex justify-between items-baseline mb-1">
                            <span className="font-mono text-[12px] text-[var(--text-secondary)]">Monto total prestaciones</span>
                            <span className="font-mono text-[12px] tabular-nums text-[var(--text-secondary)]">{formatCurrency(calc.finalAmount)}</span>
                        </div>
                        <div className="flex justify-between items-baseline mb-4 text-amber-500/80">
                            <span className="font-mono text-[12px]">− Anticipo + Intereses</span>
                            <span className="font-mono text-[12px] tabular-nums">− {formatCurrency(calc.immediatePayment)}</span>
                        </div>
                    </div>
                )}
                
                <div className="mt-4 p-5 rounded-2xl bg-surface-2/60 border border-border-light flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.15em] text-[var(--text-tertiary)] flex items-center gap-2 mb-1">
                            {calc.socialBenefitsAdvance > 0 || calc.accumulatedInterests > 0 ? "Saldo a Favor" : "Monto total prestaciones"}
                        </p>
                        <p className={`text-[24px] font-black tabular-nums leading-none ${calc.socialBenefitsAdvance > 0 || calc.accumulatedInterests > 0 ? "text-emerald-500" : "text-foreground"}`}>
                            {formatCurrency(calc.balanceInFavor)}
                        </p>
                    </div>
                </div>
            </div>

            <div className="bg-surface-2/30 px-8 py-4 border-t border-border-light flex items-center justify-between mt-auto">
                <p className="text-[10px] text-[var(--text-tertiary)] leading-relaxed uppercase tracking-wider font-semibold">
                    Documento de conformidad · Original
                </p>
                <div className="flex items-center gap-2 text-[var(--text-tertiary)]">
                    <FileText size={14} />
                    <span className="text-[10px] font-bold tracking-widest uppercase">ID {documentId}</span>
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// PAGE
// ============================================================================

export default function PrestacionesPage() {
    const { companyId, company } = useCompany();
    const { employees, loading }  = useEmployee(companyId);

    // ── Employee ──────────────────────────────────────────────────────────────
    const [selectedIdNumber, setSelectedIdNumber] = useState<string>("");
    const [onlyActive,    setOnlyActive]    = useState(true);

    const [salaryOverride, setSalaryOverride] = useState("");
    const [manualHireDate, setManualHireDate] = useState("");

    // ── BCV ─────────────────────────────────────────────────────────────────
    const [exchangeRate, setExchangeRate] = useState("79.59");
    const [isBcvLoading, setIsBcvLoading] = useState(true);
    const [bcvError, setBcvError] = useState<string | null>(null);

    const bcvRate = useMemo(() => parseFloat(exchangeRate) || 0, [exchangeRate]);

    const fetchBcvRate = useCallback(() => {
        setIsBcvLoading(true);
        fetch(`/api/bcv/rate?date=${isoToday()}`)
            .then(r => r.json())
            .then(data => { 
                const rate = data.price || data.rate;
                if (rate) { 
                    setExchangeRate(rate.toFixed(2)); 
                    setBcvError(null); 
                } else setBcvError("No disponible"); 
            })
            .catch(() => setBcvError("Error al obtener tasa"))
            .finally(() => setIsBcvLoading(false));
    }, []);

    useEffect(() => { fetchBcvRate(); }, [fetchBcvRate]);

    // ── Params ────────────────────────────────────────────────────────────────
    const [cutoffDate,         setCutoffDate]         = useState(isoToday());
    const [profitSharingDays,  setProfitSharingDays]  = useState("15");
    const [vacationBonusDays,  setVacationBonusDays]  = useState("15");
    const [interestRate,       setInterestRate]       = useState("3");
    const [advancePercentage,  setAdvancePercentage]  = useState("75");

    // ── BATCH PROCESSING ─────────────────────────────────────────────────────

    const filteredEmployees = useMemo(() => {
        const pool = onlyActive ? employees.filter(e => e.estado === "activo") : employees;
        if (!selectedIdNumber) return pool;
        return pool.filter(e => e.cedula === selectedIdNumber);
    }, [employees, onlyActive, selectedIdNumber]);

    // Derived for individual manual mode if needed
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
        employee:  Employee;
        calculation: SocialBenefitsCalculation | null;
        message?: string;
    }

    const benefitResults = useMemo<BenefitResult[]>(() => {
        return filteredEmployees.map(emp => {
            const vesAmount  = emp.moneda === "USD" ? emp.salarioMensual * bcvRate : emp.salarioMensual;
            const hire = emp.fechaIngreso ?? "";
            const psDays = parseInt(profitSharingDays) || 15;
            const vbDays = parseInt(vacationBonusDays) || 15;

            const res = calculateSocialBenefits({
                salaryVES: vesAmount,
                hireDate: hire,
                cutoffDate: cutoffDate,
                profitSharingDays: psDays,
                vacationBonusDays: vbDays,
            });

            if (!res) return { employee: emp, calculation: null, message: "Verificar datos" };

            const dailyNormalSalary = vesAmount / 30;
            const psQuota = dailyNormalSalary * psDays / 360;
            const vbQuota = dailyNormalSalary * vbDays / 360;
            const guaranteeAmount = 30 * res.integratedDailySalary * res.yearsOfService;
            const seniorityBalance = res.seniorityIndemnityBalance;
            const isGuaranteeApplied = guaranteeAmount > seniorityBalance;
            const finalAmount = Math.max(seniorityBalance, guaranteeAmount);
            const advancePctValue = Math.min(100, Math.max(0, parseFloat(advancePercentage) || 75));
            const advanceValue = seniorityBalance * (advancePctValue / 100);
            const rateValue = Math.max(0, parseFloat(interestRate) || 0);
            const interestValue = seniorityBalance * (rateValue / 100) * (res.completeMonths / 12);

            const calculation: SocialBenefitsCalculation = {
                salaryVES: vesAmount,
                dailySalary: dailyNormalSalary,
                profitSharingQuota: psQuota,
                vacationBonusQuota: vbQuota,
                integratedDailySalary: res.integratedDailySalary,
                yearsOfService:   res.yearsOfService,
                completeMonths:   res.completeMonths,
                totalDays:        res.totalDays,
                quarterlyDays:    res.quarterlyDays,
                extraDays:        res.extraDays,
                totalSeniorityDays: res.totalSeniorityDays,
                accumulatedBalance: seniorityBalance,
                seniorityIndemnityGuarantee: guaranteeAmount,
                finalAmount:      finalAmount,
                isGuaranteeApplied,
                socialBenefitsAdvance: advanceValue,
                accumulatedInterests:  interestValue,
                immediatePayment:      advanceValue + interestValue,
                balanceInFavor:        finalAmount - advanceValue - interestValue,
            };

            return { employee: emp, calculation };
        });
    }, [filteredEmployees, bcvRate, profitSharingDays, vacationBonusDays, cutoffDate, advancePercentage, interestRate]);

    const grandTotal = useMemo(() => benefitResults.reduce((acc, r) => acc + (r.calculation?.balanceInFavor ?? 0), 0), [benefitResults]);

    const vesSalary = parseFloat(salaryOverride) || 0;
    const individualCalculation = benefitResults.length === 1 ? benefitResults[0].calculation : null;

    const [isExportingBatch, setIsExportingBatch] = useState(false);
    const handleBatchExport = async () => {
        setIsExportingBatch(true);
        try {
            for (const result of benefitResults) {
                if (!result.calculation) continue;
                const advPct = Math.min(100, Math.max(0, parseFloat(advancePercentage) || 75));
                const rate = Math.max(0, parseFloat(interestRate) || 0);
                await generateSocialBenefitsPdf({
                    companyName: company?.name ?? "La Empresa",
                    employee: { name: result.employee.nombre, idNumber: result.employee.cedula, role: result.employee.cargo },
                    hireDate: result.employee.fechaIngreso ?? "",
                    cutoffDate,
                    yearsOfService: result.calculation.yearsOfService,
                    completeMonths: result.calculation.completeMonths,
                    totalDays: result.calculation.totalDays,
                    salaryVES: result.calculation.salaryVES,
                    dailySalary: result.calculation.dailySalary,
                    profitSharingQuota: result.calculation.profitSharingQuota,
                    vacationBonusQuota: result.calculation.vacationBonusQuota,
                    integratedDailySalary: result.calculation.integratedDailySalary,
                    quarterlyDays: result.calculation.quarterlyDays,
                    extraDays: result.calculation.extraDays,
                    totalSeniorityDays: result.calculation.totalSeniorityDays,
                    accumulatedBalance: result.calculation.accumulatedBalance,
                    seniorityIndemnityGuarantee: result.calculation.seniorityIndemnityGuarantee,
                    finalAmount: result.calculation.finalAmount,
                    isGuaranteeApplied: result.calculation.isGuaranteeApplied,
                    socialBenefitsAdvance: result.calculation.socialBenefitsAdvance,
                    accumulatedInterests: result.calculation.accumulatedInterests,
                    immediatePayment: result.calculation.immediatePayment,
                    balanceInFavor: result.calculation.balanceInFavor,
                    advancePercentage: advPct,
                    interestRate: rate,
                    logoUrl: company?.logoUrl,
                    showLogoInPdf: company?.showLogoInPdf,
                });
            }
        } catch (err: unknown) {
            console.error(err);
            alert("Error al exportar: " + getErrorMessage(err));
        } finally {
            setIsExportingBatch(false);
        }
    };

    return (
        <div className="min-h-full bg-surface-2 flex flex-col overflow-hidden">
            <PageHeader
                title="Prestaciones Sociales"
                subtitle="Cálculo de garantía y acumulados (Art. 142 LOTTT)"
            >
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-light bg-surface-1 h-8 shadow-sm">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-tertiary)]">BCV</span>
                    <span className="font-mono text-[11px] font-semibold tabular-nums text-foreground">
                        {isBcvLoading ? "..." : bcvRate.toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                    </span>
                    {bcvError && <span className="w-1.5 h-1.5 rounded-full bg-red-400" title={bcvError} />}
                </div>
            </PageHeader>

            <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
                {/* ══ LEFT PANEL ══════════════════════════════════════════════ */}
                <aside className="w-full lg:w-96 shrink-0 flex flex-col border-b lg:border-b-0 lg:border-r border-border-light bg-surface-1 overflow-y-auto">

                    <div className="px-5 py-4 border-b border-border-light bg-surface-2/[0.03]">
                        <p className="font-mono text-[13px] font-black uppercase tracking-widest text-foreground leading-none flex items-center gap-2">
                            <TrendingUp size={14} className="text-primary-500" />
                            Calculadora
                        </p>
                    </div>

                    <div className="flex-1 divide-y divide-border-light">
                        <div className="px-5 py-4 space-y-4">
                            <SectionHeader label="Alcance" />
                            <div className="space-y-4">
                                {!loading && employees.length > 0 && (
                                    <div className="relative">
                                        <Users className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" size={14} />
                                        <select value={selectedIdNumber} onChange={e => setSelectedIdNumber(e.target.value)} className={fieldCls + " pl-9"}>
                                            <option value="">Lote por defecto (Todos)</option>
                                            <optgroup label="Empleados">
                                                {employees
                                                    .filter(e => !onlyActive || e.estado === "activo")
                                                    .sort((a,b) => a.nombre.localeCompare(b.nombre))
                                                    .map(e => (
                                                        <option key={e.cedula} value={e.cedula}>{e.nombre} ({e.cedula})</option>
                                                    ))
                                                }
                                            </optgroup>
                                        </select>
                                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
                                    </div>
                                )}
                                {selectedEmp && (
                                    <div className="p-3.5 rounded-xl border border-border-light bg-surface-2/[0.03] space-y-2.5 relative overflow-hidden">
                                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary-500/40" />
                                        {[
                                            { k: "Cédula", v: selectedEmp.cedula, icon: <Info size={12} /> },
                                            { k: "Cargo", v: selectedEmp.cargo || "—", icon: <ClipboardCheck size={12} /> },
                                            { k: "Ingreso", v: selectedEmp.fechaIngreso ?? "—", icon: <Calendar size={12} /> },
                                        ].map(({ k, v, icon }) => (
                                            <div key={k} className="flex justify-between items-center font-mono text-[11px]">
                                                <div className="flex items-center gap-2 text-[var(--text-tertiary)]">
                                                    {icon}
                                                    <span className="uppercase tracking-wider">{k}</span>
                                                </div>
                                                <span className="text-foreground font-bold tabular-nums">{v}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <label className="flex items-center gap-3 cursor-pointer group py-1">
                                    <div onClick={(e) => { e.preventDefault(); setOnlyActive(v => !v); }}
                                        className={["w-8 h-4.5 rounded-full transition-all duration-200 flex items-center px-0.5 cursor-pointer ring-offset-background group-hover:ring-2 ring-primary-500/10", onlyActive ? "bg-primary-500" : "bg-border-medium"].join(" ")}>
                                        <div className={["w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform duration-200", onlyActive ? "translate-x-3.5" : "translate-x-0"].join(" ")} />
                                    </div>
                                    <span className="font-mono text-[11px] text-[var(--text-secondary)] uppercase tracking-[0.14em] font-medium group-hover:text-foreground">Solo activos</span>
                                </label>
                            </div>

                            {selectedIdNumber && (
                                <div className="pt-2">
                                    <label className={labelCls}>Salario mensual (Bs.)</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[12px] text-[var(--text-tertiary)] pointer-events-none select-none">Bs.</span>
                                        <input type="number" step="0.01" min="0" value={salaryOverride}
                                            onChange={e => setSalaryOverride(e.target.value)} placeholder="0.00"
                                            className={fieldCls + " pl-9 text-right"} />
                                    </div>
                                </div>
                            )}
                            {!selectedEmp && selectedIdNumber && (
                                <div>
                                    <label className={labelCls}>Fecha de ingreso</label>
                                    <div className="relative">
                                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={14} />
                                        <input type="date" value={manualHireDate}
                                            onChange={e => setManualHireDate(e.target.value)} className={fieldCls + " pl-9"} />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="px-5 py-4">
                            <div className="flex items-center justify-between mb-2">
                                <SectionHeader label="Tasa BCV" />
                                <button 
                                    onClick={fetchBcvRate}
                                    disabled={isBcvLoading}
                                    className="p-1 hover:bg-surface-2 rounded-md transition-colors text-[var(--text-tertiary)] hover:text-primary-500 disabled:opacity-40"
                                >
                                    <RefreshCw size={12} className={isBcvLoading ? "animate-spin" : ""} />
                                </button>
                            </div>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[12px] text-[var(--text-tertiary)] pointer-events-none select-none">Bs.</span>
                                <input 
                                    type="number" 
                                    step="0.01" 
                                    value={exchangeRate}
                                    onChange={e => setExchangeRate(e.target.value)} 
                                    className={fieldCls + " pl-9 text-right"} 
                                />
                            </div>
                        </div>

                        <div className="px-5 py-5 space-y-4">
                            <SectionHeader label="Configuración Temporal" />
                            <div>
                                <label className={labelCls}>Fecha de corte</label>
                                <div className="relative">
                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={14} />
                                    <input type="date" value={cutoffDate}
                                        onChange={e => setCutoffDate(e.target.value)} className={fieldCls + " pl-9"} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3 pt-1">
                                <div>
                                    <label className={labelCls}>Días Util.</label>
                                    <div className="relative">
                                        <ClipboardCheck className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={13} />
                                        <input type="number" min="15" max="120" step="1"
                                            value={profitSharingDays}
                                            onChange={e => setProfitSharingDays(e.target.value)}
                                            className={fieldCls + " pl-9 text-right"} />
                                    </div>
                                </div>
                                <div>
                                    <label className={labelCls}>Bono Vac.</label>
                                    <div className="relative">
                                        <TrendingUp className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={13} />
                                        <input type="number" min="15" max="90" step="1"
                                            value={vacationBonusDays}
                                            onChange={e => setVacationBonusDays(e.target.value)}
                                            className={fieldCls + " pl-9 text-right"} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="px-5 py-5 space-y-4 bg-surface-2/[0.03]">
                            <SectionHeader label="Ajustes de Ley" />
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelCls}>Tasa Int.</label>
                                    <div className="relative">
                                        <Percent className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={13} />
                                        <input type="number" step="0.01" min="0" max="100"
                                            value={interestRate}
                                            onChange={e => setInterestRate(e.target.value)}
                                            className={fieldCls + " pl-8 text-right"} />
                                    </div>
                                </div>
                                <div>
                                    <label className={labelCls}>Anticipo</label>
                                    <div className="relative">
                                        <Percent className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={13} />
                                        <input type="number" step="1" min="0" max="75"
                                            value={advancePercentage}
                                            onChange={e => setAdvancePercentage(e.target.value)}
                                            className={fieldCls + " pl-8 text-right"} />
                                    </div>
                                </div>
                            </div>
                        </div>

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

                    <div className="p-5 border-t border-border-light space-y-4 mt-auto bg-surface-2/[0.03]">
                        {benefitResults.length > 0 && (
                            <div className="space-y-2 mb-4 bg-surface-2/40 rounded-xl p-4 border border-border-light/50">
                                <div className="flex justify-between font-mono text-[11px] uppercase tracking-wider">
                                    <span className="text-[var(--text-tertiary)]">Empleados</span>
                                    <span className="text-foreground font-bold">{benefitResults.length}</span>
                                </div>
                                
                                <div className="flex justify-between items-baseline pt-2 border-t border-border-light/30">
                                    <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--text-secondary)] font-bold">Total Gral. (Neto)</span>
                                    <span className="font-mono text-[15px] font-black tabular-nums text-emerald-500">{formatCurrency(grandTotal)}</span>
                                </div>
                            </div>
                        )}
                        
                        <BaseButton.Root
                            variant="primary"
                            className="w-full"
                            onClick={handleBatchExport}
                            disabled={benefitResults.length === 0 || isExportingBatch}
                            leftIcon={isExportingBatch ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
                        >
                            {isExportingBatch ? `Generando…` : `Generar PDF (${benefitResults.filter(r => r.calculation).length})`}
                        </BaseButton.Root>
                    </div>
                </aside>

                <main className="flex-1 overflow-y-auto p-6 lg:p-10 bg-surface-2 lg:bg-surface-2/50 relative">
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:14px_14px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />
                    <div className="relative z-10 w-full h-full">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-full gap-4 text-[var(--text-tertiary)]">
                            <RefreshCw size={24} className="animate-spin text-primary-500/50" />
                            <span className="text-[13px] font-bold uppercase tracking-widest">Cargando datos…</span>
                        </div>
                    ) : benefitResults.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full gap-5 text-[var(--text-disabled)] max-w-sm mx-auto animate-in fade-in duration-500">
                            <div className="w-20 h-20 rounded-[1.5rem] bg-surface-1 border border-border-light flex items-center justify-center shadow-sm text-border-medium">
                                <Users strokeWidth={1.5} size={32} />
                            </div>
                            <div className="text-center space-y-2">
                                <p className="text-[14px] font-bold uppercase tracking-widest text-foreground">Sistema Listo</p>
                                <p className="text-[13px] font-medium text-[var(--text-secondary)] leading-relaxed">
                                    Selecciona un empleado de la lista y ajusta los parámetros de cálculo para previsualizar la constancia de prestaciones sociales.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="max-w-4xl mx-auto space-y-10 pb-12">
                            {benefitResults.map((result, i) => {
                                if (result.message || !result.calculation) return (
                                    <div key={result.employee.cedula} className="bg-surface-1 rounded-xl p-4 border border-border-light flex justify-between items-center opacity-70">
                                        <div>
                                            <p className="font-mono text-[13px] font-bold uppercase text-foreground">{result.employee.nombre}</p>
                                            <p className="font-mono text-[10px] text-[var(--text-tertiary)] uppercase">{result.employee.cargo}</p>
                                        </div>
                                        <span className="font-mono text-[10px] text-amber-500 uppercase border border-amber-500/20 px-2 py-0.5 rounded">{result.message ?? "Error"}</span>
                                    </div>
                                );

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
