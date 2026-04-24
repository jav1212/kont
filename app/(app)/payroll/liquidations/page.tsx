"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { 
    FileText, 
    Download, 
    Users, 
    Calendar, 
    ClipboardCheck, 
    ChevronDown, 
    RefreshCw, 
    TrendingUp, 
    Info,
    Clock,
    AlertCircle
} from "lucide-react";
import { useCompany }  from "@/src/modules/companies/frontend/hooks/use-companies";
import { useEmployee } from "@/src/modules/payroll/frontend/hooks/use-employee";
import type { Employee } from "@/src/modules/payroll/frontend/hooks/use-employee";
import { generateLiquidationPdf } from "@/src/modules/payroll/frontend/utils/liquidaciones-pdf";
import type { LiquidationEmployee, LiquidationOptions } from "@/src/modules/payroll/frontend/utils/liquidaciones-pdf";
import { motion } from "framer-motion";
import { getTodayIsoDate } from "@/src/shared/frontend/utils/local-date";

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

// ============================================================================
// LIQUIDATION ENGINE
// ============================================================================

type LiquidationReason = "renuncia" | "despido_justificado" | "despido_injustificado";

interface LiquidationResult {
    employee:               Employee;
    salaryVES:              number;
    yearsOfService:         number;
    totalDays:              number;   // total days since hire
    daysSeniority:          number;
    daysSeniorityQuarterly: number;   // quarterly base (5 days/month)
    daysSeniorityExtra:     number;   // extra days (2 days/year from year 2)
    socialBenefits:         number;
    daysInCurrentYear:      number;   // days worked in the termination calendar year
    daysSinceAnniversary:   number;   // days since last work anniversary (for vacations/bonus)
    fractionalProfitSharing: number;
    fractionalVacations:    number;
    fractionalVacationBonus: number;
    terminationIndemnity:   number;
    total:                  number;
    warning?:               string;
}

function calculateLiquidation(
    employee:         Employee,
    terminationDate:  string,
    reason:           LiquidationReason,
    profitSharingDays: number,
    vacationBonusDays: number,
    bcvRate:          number,
): LiquidationResult {
    const base: LiquidationResult = {
        employee, salaryVES: 0,
        yearsOfService: 0, totalDays: 0,
        daysSeniority: 0, daysSeniorityQuarterly: 0, daysSeniorityExtra: 0,
        socialBenefits: 0, daysInCurrentYear: 0, daysSinceAnniversary: 0,
        fractionalProfitSharing: 0, fractionalVacations: 0, fractionalVacationBonus: 0,
        terminationIndemnity: 0, total: 0,
    };

    if (!employee.fechaIngreso) return { ...base, warning: "Sin fecha de ingreso" };
    const hireDate = new Date(employee.fechaIngreso + "T00:00:00");
    const termDate = new Date(terminationDate + "T00:00:00");
    if (termDate <= hireDate) return { ...base, warning: "Egreso anterior a ingreso" };

    const salaryVES = employee.moneda === "USD" ? employee.salarioMensual * bcvRate : employee.salarioMensual;
    if (salaryVES <= 0) return { ...base, salaryVES, warning: "Salario cero" };

    const msPerDay   = 86400000;
    const totalDays  = Math.floor((termDate.getTime() - hireDate.getTime()) / msPerDay);
    const yearsOfService = Math.floor(totalDays / 365);

    // ── SOCIAL BENEFITS (PRESTACIONES) (Art. 142 LOTTT) ──────────────────
    // Base: 15 days per quarter = 5 days/month (60 days/year)
    const totalMonths            = Math.floor(totalDays / 30.4375);
    const daysSeniorityQuarterly = totalMonths * 5;

    // Extra days: annual deposit grows by 2 days per year of service (cumulative).
    const daysOfLastYear = totalDays % 365;
    const daysExtraFull  = yearsOfService <= 16
        ? yearsOfService * Math.max(0, yearsOfService - 1)
        : 240 + 30 * (yearsOfService - 16);
    const daysSeniorityExtra = daysExtraFull
        + (yearsOfService >= 1 && daysOfLastYear > 182 ? Math.min(30, 2 * yearsOfService) : 0);
    const daysSeniority      = daysSeniorityQuarterly + daysSeniorityExtra;

    // Integrated daily salary
    const baseDailySalary = salaryVES / 30;
    const profitSharingQuota = baseDailySalary * profitSharingDays / 360;
    const vacationBonusQuota = baseDailySalary * vacationBonusDays / 360;
    const integratedDailySalary = baseDailySalary + profitSharingQuota + vacationBonusQuota;

    const socialBenefits = daysSeniority * integratedDailySalary;

    // ── FRACTIONAL PROFIT SHARING ─────────────────────────────────────────
    const yearStart        = new Date(termDate.getFullYear(), 0, 1);
    const refStartDate      = hireDate > yearStart ? hireDate : yearStart;
    const daysInCurrentYear = Math.floor((termDate.getTime() - refStartDate.getTime()) / msPerDay);

    const fractionalProfitSharing = (salaryVES / 30) * profitSharingDays * (daysInCurrentYear / 365);

    // ── FRACTIONAL VACATIONS & BONUS ──────────────────────────────────────
    const daysSinceAnniversary = yearsOfService >= 1 ? daysOfLastYear : totalDays;
    const baseVacationDays     = Math.max(15, 15 + Math.max(0, yearsOfService - 1));

    const fractionalVacations     = (salaryVES / 30) * baseVacationDays * (daysSinceAnniversary / 365);
    const fractionalVacationBonus = (salaryVES / 30) * vacationBonusDays * (daysSinceAnniversary / 365);

    const terminationIndemnity = reason === "despido_injustificado" ? socialBenefits : 0;
    const total = socialBenefits + fractionalProfitSharing + fractionalVacations + fractionalVacationBonus + terminationIndemnity;

    return {
        employee, salaryVES,
        yearsOfService, totalDays,
        daysSeniority, daysSeniorityQuarterly, daysSeniorityExtra,
        socialBenefits, daysInCurrentYear, daysSinceAnniversary,
        fractionalProfitSharing, fractionalVacations, fractionalVacationBonus, terminationIndemnity, total,
    };
}

function formatDate(iso: string): string {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    const months = ["enero","febrero","marzo","abril","mayo","junio",
                   "julio","agosto","septiembre","octubre","noviembre","diciembre"];
    return `${parseInt(d)} de ${months[parseInt(m) - 1]} de ${y}`;
}

// ============================================================================
// CARD — Liquidation Constancy
// ============================================================================

function LiquidationConstancy({ result, companyName, companyLogoUrl, showLogoInPdf, terminationDate, reason, profitSharingDays, vacationBonusDays }: {
    result: LiquidationResult; companyName: string; companyLogoUrl?: string; showLogoInPdf?: boolean; terminationDate: string; reason: LiquidationReason;
    profitSharingDays: string; vacationBonusDays: string;
}) {
    const reasonLabel = reason === "renuncia" ? "Renuncia voluntaria"
        : reason === "despido_justificado" ? "Despido justificado"
        : "Despido injustificado";
    const issuedAt = new Date().toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
    const baseVacationDays = Math.max(15, 15 + Math.max(0, result.yearsOfService - 1));
    const documentId = makeDocumentId(`${result.employee.cedula}|${terminationDate}|${reason}`);

    const concepts = [
        { label: "Prestaciones sociales", sub: `Art. 142 LOTTT · ${result.daysSeniorityQuarterly}d trim.${result.daysSeniorityExtra > 0 ? ` + ${result.daysSeniorityExtra}d adic.` : ""}`, days: result.daysSeniority, amount: result.socialBenefits },
        { label: "Utilidades fraccionadas", sub: `${result.daysInCurrentYear}d en año × ${profitSharingDays}d util. / 365`, amount: result.fractionalProfitSharing },
        { label: "Vacaciones fraccionadas", sub: `${result.daysSinceAnniversary}d / 365 × ${baseVacationDays}d vac.`, amount: result.fractionalVacations },
        { label: "Bono vacacional fraccionado", sub: `${result.daysSinceAnniversary}d / 365 × ${vacationBonusDays}d bono`, amount: result.fractionalVacationBonus },
        ...(result.terminationIndemnity > 0 ? [{ label: "Indemnización por despido", sub: "Art. 92 LOTTT — igual al monto", amount: result.terminationIndemnity, highlight: true }] : []),
    ].filter(c => c.amount > 0);

    if (result.warning) return (
        <div className="bg-warning/5 rounded-2xl overflow-hidden border border-warning/20 shadow-sm mb-6">
            <div className="px-6 py-4 flex items-center justify-between border-l-4 border-warning">
                <p className="text-[14px] font-bold uppercase text-foreground">{result.employee.nombre}</p>
                <span className="text-[12px] text-warning font-bold uppercase tracking-widest bg-warning/10 px-2 py-1 rounded">{result.warning}</span>
            </div>
        </div>
    );

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
                        <p className="text-[11px] text-[var(--text-tertiary)] mt-2 uppercase tracking-[0.2em] font-semibold">Constancia de Liquidación Laboral</p>
                        <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 font-medium">Art. 142 LOTTT — {reasonLabel}</p>
                    </div>
                </div>
                <div className="text-right shrink-0">
                    <p className="text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-0.5">Fecha de Egreso</p>
                    <p className="text-[13px] font-bold text-foreground bg-surface-2 px-2.5 py-1 rounded inline-block border border-border-light">{formatDate(terminationDate)}</p>
                    <p className="text-[9px] text-[var(--text-tertiary)] mt-2 uppercase">Emitido: {issuedAt}</p>
                </div>
            </div>

            <div className="px-8 py-5 border-b border-border-light flex flex-col sm:flex-row items-center justify-between bg-surface-1">
                <div className="flex items-center gap-4 w-full">
                    <div className="flex-shrink-0 w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center border border-border-light text-[var(--text-tertiary)] group-hover:border-primary-500/50 group-hover:text-primary-500 transition-colors">
                        <Users size={20} />
                    </div>
                    <div className="flex-1">
                        <p className="text-[16px] font-bold text-foreground tracking-tight">{result.employee.nombre}</p>
                        {result.employee.cargo && <p className="text-[11px] uppercase tracking-[0.1em] text-[var(--text-secondary)] font-medium mt-0.5">{result.employee.cargo}</p>}
                    </div>
                    <div className="text-right shrink-0 pl-5 md:pr-4 border-l border-border-light">
                        <p className="text-[13px] font-bold text-foreground tabular-nums">CI {result.employee.cedula}</p>
                        <div className="inline-flex items-center gap-1.5 mt-1 text-[11px] text-[var(--text-secondary)] font-medium bg-surface-2 px-2 py-0.5 rounded border border-border-light">
                            <Clock size={12} className="text-[var(--text-tertiary)]" />
                            {result.yearsOfService} año{result.yearsOfService !== 1 ? "s" : ""}
                        </div>
                    </div>
                </div>
            </div>

            <div className="px-8 py-5 grid grid-cols-2 lg:grid-cols-4 gap-6 border-b border-border-light bg-surface-2/20">
                {[
                    { lbl: "Salario Mensual",  val: formatCurrency(result.salaryVES), color: "text-foreground" },
                    { lbl: "Fecha de Ingreso", val: formatDate(result.employee.fechaIngreso ?? ""), color: "text-foreground" },
                    { lbl: "Antigüedad",val: `${result.yearsOfService}a ${result.totalDays % 365}d`, color: "text-primary-500" },
                    { lbl: "Salario Base/Día",  val: formatCurrency(result.salaryVES / 30), color: "text-foreground" },
                ].map(({ lbl, val, color }) => (
                    <div key={lbl}>
                        <p className="text-[10px] uppercase tracking-[0.15em] text-[var(--text-tertiary)] mb-1 font-bold">{lbl}</p>
                        <p className={`text-[13px] font-bold tabular-nums ${color}`}>{val}</p>
                    </div>
                ))}
            </div>

            <div className="px-8 py-6">
                <div className="flex justify-between pb-3 border-b border-border-light/60">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-tertiary)] font-bold">Concepto / Cálculo</p>
                    <div className="flex items-center justify-end gap-12 w-48 shrink-0">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-tertiary)] font-bold text-right w-12">Días</p>
                        <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-tertiary)] font-bold text-right flex-1">Monto Asignado</p>
                    </div>
                </div>
                
                <div className="divide-y divide-border-light/40 pt-1">
                    {concepts.map((c) => (
                        <div key={c.label} className="py-3.5 flex items-start justify-between group hover:bg-surface-2/30 -mx-4 px-4 rounded-lg transition-colors">
                            <div className="pr-4">
                                <p className="text-[13px] font-bold text-foreground tracking-tight">{c.label}</p>
                                <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">{c.sub}</p>
                            </div>
                            <div className="flex items-center justify-end gap-12 w-48 shrink-0 text-right">
                                <p className="text-[13px] font-medium tabular-nums text-[var(--text-secondary)] w-12">{c.days != null ? c.days : "—"}</p>
                                <p className={`text-[14px] font-bold tabular-nums flex-1 ${c.highlight ? "text-error" : "text-foreground group-hover:text-primary-500 transition-colors"}`}>
                                    Bs. {formatNumber(c.amount)}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-4 p-5 rounded-2xl bg-surface-2/60 border border-border-light flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.15em] text-[var(--text-tertiary)] flex items-center gap-2 mb-1">
                            Líquido a recibir
                        </p>
                        <p className="text-[24px] font-black tabular-nums text-foreground leading-none">
                            Bs. {formatNumber(result.total)}
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
// ============================================================================
// SHARED UI ATOMS
// ============================================================================

function SectionHeader({ label, color }: { label: string; color?: "green" | "amber" }) {
    const cls = color === "amber" ? "text-amber-500/70"
              : color === "green" ? "text-emerald-500/70"
              : "text-[var(--text-tertiary)]";
    return <p className={`font-mono text-[11px] uppercase tracking-[0.2em] mb-2 pt-1 ${cls}`}>{label}</p>;
}

// ============================================================================
// PAGE
// ============================================================================

export default function LiquidacionesPage() {
    const { companyId, company } = useCompany();
    const { employees, loading, error } = useEmployee(companyId);

    const today = getTodayIsoDate();

    const [terminationDate, setTerminationDate] = useState(today);
    const [reason,          setReason]          = useState<LiquidationReason>("renuncia");
    const [profitSharingDays, setProfitSharingDays] = useState("120");
    const [vacationBonusDays, setVacationBonusDays] = useState("15");
    const [onlyActive, setOnlyActive] = useState(true);
    const [selectedIdNumber, setSelectedIdNumber] = useState<string>("");
    const selectedEmp = useMemo(
        () => employees.find(e => e.cedula === selectedIdNumber),
        [employees, selectedIdNumber]
    );

    // ── BCV fetch ──────────────────────────────────────────────────────────
    const [exchangeRate,  setExchangeRate]  = useState("79.59");
    const [bcvLoading,     setBcvLoading]     = useState(false);
    const [bcvFetchError,  setBcvFetchError]  = useState<string | null>(null);

    const fetchBcvRate = useCallback(async () => {
        setBcvLoading(true);
        setBcvFetchError(null);
        try {
            const iso = getTodayIsoDate();
            const res  = await fetch(`/api/bcv/rate?date=${iso}`);
            const data = await res.json();
            if (!res.ok) { setBcvFetchError(data.error ?? "No rate found"); return; }
            setExchangeRate(String(data.price || data.rate));
        } catch {
            setBcvFetchError("No se pudo conectar.");
        } finally {
            setBcvLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchBcvRate();
    }, [fetchBcvRate]);

    const bcvRate = useMemo(() => parseFloat(exchangeRate) || 0, [exchangeRate]);

    const filteredEmployees = useMemo(() => {
        const pool = onlyActive ? employees.filter((e) => e.estado === "activo") : employees;
        if (!selectedIdNumber) return pool;
        return pool.filter((e) => e.cedula === selectedIdNumber);
    }, [employees, onlyActive, selectedIdNumber]);

    const liquidationResults = useMemo<LiquidationResult[]>(() =>
        filteredEmployees.map(emp => calculateLiquidation(
            emp, terminationDate, reason,
            parseFloat(profitSharingDays) || 120,
            parseFloat(vacationBonusDays) || 15,
            bcvRate,
        )),
        [filteredEmployees, terminationDate, reason, profitSharingDays, vacationBonusDays, bcvRate],
    );

    const validResults = useMemo(() => liquidationResults.filter(r => !r.warning), [liquidationResults]);
    const totalAmount = useMemo(() => validResults.reduce((s, r) => s + r.total, 0), [validResults]);


    const handlePdf = useCallback(() => {
        const pdfEmployees: LiquidationEmployee[] = validResults.map(r => {
            const integratedDailySalary = r.socialBenefits > 0 ? r.socialBenefits / r.daysSeniority : r.salaryVES / 30;
            const simpleDailySalary      = r.salaryVES / 30;
            const lines = [
                {
                    label:   "Prestaciones sociales (Art. 142)",
                    days:    r.daysSeniority,
                    formula: r.daysSeniorityExtra > 0
                        ? `${r.daysSeniorityQuarterly}d trimestr. + ${r.daysSeniorityExtra}d adic.`
                        : `${r.daysSeniorityQuarterly}d × 5d/mes`,
                    salary:  integratedDailySalary,
                    amount:   r.socialBenefits,
                },
                {
                    label:   "Utilidades fraccionadas",
                    formula: `${r.daysInCurrentYear}d en año × ${profitSharingDays}d util / 365`,
                    amount:   r.fractionalProfitSharing,
                },
                {
                    label:   "Vacaciones fraccionadas",
                    formula: `${r.daysSinceAnniversary}d / 365 × ${Math.max(15, 15 + Math.max(0, r.yearsOfService - 1))}d vac.`,
                    salary:  simpleDailySalary,
                    amount:   r.fractionalVacations,
                },
                {
                    label:   "Bono vacacional fraccionado",
                    formula: `${r.daysSinceAnniversary}d / 365 × ${vacationBonusDays}d bono`,
                    salary:  simpleDailySalary,
                    amount:   r.fractionalVacationBonus,
                },
                ...(r.terminationIndemnity > 0
                    ? [{ label: "Indemnización por despido (Art. 92)", days: r.daysSeniority, salary: integratedDailySalary, amount: r.terminationIndemnity, highlight: "amber" as const }]
                    : []),
            ].filter(l => l.amount > 0 || l.days !== undefined);
            return {
                name:            r.employee.nombre,
                idNumber:        r.employee.cedula,
                role:            r.employee.cargo,
                hireDate:        r.employee.fechaIngreso ?? "",
                terminationDate: terminationDate,
                yearsOfService:  r.yearsOfService,
                daysOfService:   r.totalDays,
                reason,
                lines,
                total: r.total,
            };
        });
        const opts: LiquidationOptions = {
            companyName:   company?.name ?? "Empresa",
            companyId:     company?.id,
            documentDate:  new Date().toISOString().split("T")[0],
            bcvRate:       bcvRate || undefined,
            logoUrl:       company?.logoUrl,
            showLogoInPdf: company?.showLogoInPdf,
        };
        generateLiquidationPdf(pdfEmployees, opts);
    }, [validResults, terminationDate, reason, profitSharingDays, vacationBonusDays, bcvRate, company]);

    return (
        <div className="min-h-full bg-surface-2 flex flex-col overflow-hidden">
            <PageHeader
                title="Liquidaciones"
                subtitle="Cálculo de finiquito y prestaciones al egreso (Art. 142 LOTTT)"
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

                    <div className="px-5 py-4 border-b border-border-light bg-surface-2/[0.03]">
                        <p className="font-mono text-[13px] font-black uppercase tracking-widest text-foreground leading-none flex items-center gap-2">
                            <TrendingUp size={14} className="text-primary-500" />
                            Calculadora
                        </p>
                    </div>

                    <div className="flex-1 divide-y divide-border-light">
                        {/* ── Empleado ───────────────────────────────────────── */}
                        <div className="px-5 py-4 space-y-4">
                            <SectionHeader label="Alcance" />
                            <div className="relative">
                                <Users size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
                                <select
                                    value={selectedIdNumber}
                                    onChange={(e) => setSelectedIdNumber(e.target.value)}
                                    className={fieldCls + " pl-9"}
                                >
                                    <option value="">Lote por defecto (Todos)</option>
                                    <optgroup label="Empleados">
                                        {employees
                                            .filter(e => !onlyActive || e.estado === "activo")
                                            .sort((a,b) => a.nombre.localeCompare(b.nombre))
                                            .map(e => (
                                                <option key={e.cedula} value={e.cedula}>
                                                    {e.nombre} ({e.cedula})
                                                </option>
                                            ))
                                        }
                                    </optgroup>
                                </select>
                                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
                            </div>

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

                        {/* ── Parámetros de Egreso ────────────────────────────── */}
                        <div className="px-5 py-5 space-y-4">
                            <SectionHeader label="Egreso" />
                            <BaseInput.Field
                                label="Fecha de egreso"
                                type="date"
                                value={terminationDate}
                                max={today}
                                onValueChange={setTerminationDate}
                                startContent={<Calendar size={14} className="text-[var(--text-tertiary)]" />}
                            />

                            <div>
                                <label className={labelCls}>Motivo de Egreso</label>
                                <div className="relative">
                                    <ClipboardCheck size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
                                    <select 
                                        value={reason} 
                                        onChange={e => setReason(e.target.value as LiquidationReason)} 
                                        className={fieldCls + " pl-9"}
                                    >
                                        <option value="renuncia">Renuncia voluntaria</option>
                                        <option value="despido_justificado">Despido justificado</option>
                                        <option value="despido_injustificado">Despido injustificado</option>
                                    </select>
                                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
                                </div>
                            </div>
                        </div>

                        {/* ── Parámetros de Cálculo ──────────────────────────── */}
                        <div className="px-5 py-5 space-y-4">
                            <SectionHeader label="Parámetros de Cálculo" />
                            <div className="grid grid-cols-2 gap-3">
                                <BaseInput.Field
                                    label="Días util."
                                    type="number"
                                    min={15}
                                    step={1}
                                    value={profitSharingDays}
                                    onValueChange={setProfitSharingDays}
                                    startContent={<ClipboardCheck size={13} className="text-[var(--text-tertiary)]" />}
                                    inputClassName="text-right"
                                />
                                <BaseInput.Field
                                    label="Bono vac."
                                    type="number"
                                    min={15}
                                    step={1}
                                    value={vacationBonusDays}
                                    onValueChange={setVacationBonusDays}
                                    startContent={<TrendingUp size={13} className="text-[var(--text-tertiary)]" />}
                                    inputClassName="text-right"
                                />
                            </div>
                        </div>

                        {/* ── Tasa BCV ────────────────────────────────────────── */}
                        <div className="px-5 py-4">
                            <div className="flex items-center justify-between mb-2">
                                <SectionHeader label="Tasa BCV" />
                                <button 
                                    onClick={fetchBcvRate}
                                    disabled={bcvLoading}
                                    className="p-1 hover:bg-surface-2 rounded-md transition-colors text-[var(--text-tertiary)] hover:text-primary-500 disabled:opacity-40"
                                    title="Actualizar tasa"
                                >
                                    <RefreshCw size={12} className={bcvLoading ? "animate-spin" : ""} />
                                </button>
                            </div>
                            <BaseInput.Field
                                type="number"
                                step={0.01}
                                value={exchangeRate}
                                onValueChange={setExchangeRate}
                                prefix="Bs."
                                inputClassName="text-right"
                            />
                        </div>
                    </div>


                    {/* Totals + export */}
                    <div className="p-5 border-t border-border-light space-y-4 mt-auto bg-surface-2/[0.03]">
                        {validResults.length > 0 && (
                            <div className="space-y-2 mb-4 bg-surface-2/40 rounded-xl p-4 border border-border-light/50">
                                <div className="flex justify-between font-mono text-[11px] uppercase tracking-wider">
                                    <span className="text-[var(--text-tertiary)]">Empleados</span>
                                    <span className="text-foreground font-bold">{validResults.length}</span>
                                </div>
                                
                                {liquidationResults.length - validResults.length > 0 && (
                                    <div className="flex justify-between font-mono text-[11px] uppercase tracking-wider">
                                        <span className="text-[var(--text-tertiary)]">Observaciones</span>
                                        <span className="text-amber-500 font-bold">{liquidationResults.length - validResults.length}</span>
                                    </div>
                                )}

                                {reason === "despido_injustificado" && (
                                    <div className="flex justify-between font-mono text-[11px] uppercase tracking-wider pt-1 border-t border-border-light/30">
                                        <span className="text-[var(--text-tertiary)]">Indemnización</span>
                                        <span className="text-red-500/70 font-bold">{formatCurrency(validResults.reduce((s, r) => s + r.terminationIndemnity, 0))}</span>
                                    </div>
                                )}

                                <div className="flex justify-between items-baseline pt-2 border-t border-border-light/30">
                                    <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--text-secondary)] font-bold">Total Gral.</span>
                                    <span className="font-mono text-[15px] font-black text-primary-500 tabular-nums">{formatCurrency(totalAmount)}</span>
                                </div>
                            </div>
                        )}

                        <BaseButton.Root
                            variant="primary"
                            className="w-full"
                            onClick={handlePdf}
                            disabled={validResults.length === 0}
                            leftIcon={<Download size={14} />}
                        >
                            Generar PDF
                        </BaseButton.Root>
                    </div>
                </aside>

                {/* ══ RIGHT PANEL ═════════════════════════════════════════════ */}
                <main className="flex-1 overflow-y-auto p-6 lg:p-10 bg-surface-2 lg:bg-surface-2/50 relative">
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:14px_14px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />
                    <div className="relative z-10 w-full h-full">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-full gap-4 text-[var(--text-tertiary)]">
                            <RefreshCw size={24} className="animate-spin text-primary-500/50" />
                            <span className="text-[13px] font-bold uppercase tracking-widest">Cargando datos…</span>
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center h-full gap-3 text-error">
                            <AlertCircle size={32} />
                            <span className="text-[13px] font-bold uppercase tracking-widest">{error}</span>
                        </div>
                    ) : liquidationResults.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full gap-5 text-[var(--text-disabled)] max-w-sm mx-auto animate-in fade-in duration-500">
                            <div className="w-20 h-20 rounded-[1.5rem] bg-surface-1 border border-border-light flex items-center justify-center shadow-sm text-border-medium">
                                <Users strokeWidth={1.5} size={32} />
                            </div>
                            <div className="text-center space-y-2">
                                <p className="text-[14px] font-bold uppercase tracking-widest text-foreground">Sistema Listo</p>
                                <p className="text-[13px] font-medium text-[var(--text-secondary)] leading-relaxed">
                                    Selecciona un empleado de la lista y ajusta los parámetros de cálculo para previsualizar la constancia de liquidación laboral.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="max-w-4xl mx-auto space-y-10 pb-12">
                            {liquidationResults.map((result, i) => (
                                <motion.div
                                    key={result.employee.cedula}
                                    initial={{ opacity: 0, scale: 0.98, y: 15 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    transition={{ delay: i * 0.05, ease: "easeOut" }}
                                >
                                    <LiquidationConstancy
                                        result={result}
                                        companyName={company?.name ?? "La Empresa"}
                                        companyLogoUrl={company?.logoUrl}
                                        showLogoInPdf={company?.showLogoInPdf}
                                        terminationDate={terminationDate}
                                        reason={reason}
                                        profitSharingDays={profitSharingDays}
                                        vacationBonusDays={vacationBonusDays}
                                    />
                                </motion.div>
                            ))}
                        </div>
                    )}
                    </div>
                </main>
            </div>
        </div>
    );
}
function makeDocumentId(seed: string): string {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    return Math.abs(hash).toString(36).slice(0, 4).toUpperCase().padStart(4, "0");
}
