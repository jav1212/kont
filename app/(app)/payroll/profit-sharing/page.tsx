"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { FileText, Download, RefreshCw, Users, Calendar, ClipboardCheck, Info, HandCoins, TrendingUp, ChevronDown, Clock } from "lucide-react";
import { motion } from "framer-motion";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useEmployee } from "@/src/modules/payroll/frontend/hooks/use-employee";
import type { Employee } from "@/src/modules/payroll/frontend/hooks/use-employee";
import { getTodayIsoDate } from "@/src/shared/frontend/utils/local-date";
import {
    generateFullProfitSharingPdf,
    generateFractionalProfitSharingPdf,
} from "@/src/modules/payroll/frontend/utils/utilidades-pdf";

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

function makeDocumentId(seed: string): string {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    return Math.abs(hash).toString(36).slice(0, 4).toUpperCase().padStart(4, "0");
}

function getErrorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

function formatDate(iso: string): string {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
        "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    return `${parseInt(d)} de ${months[parseInt(m) - 1]} de ${y}`;
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

/** ISO date for Jan 1 of a given year */
function getYearStart(year: number): string {
    return `${year}-01-01`;
}

/** Later of two ISO dates */
function maxDate(a: string, b: string): string {
    return a > b ? a : b;
}

// ============================================================================
// CALCULATION ENGINES
// ============================================================================

interface FullProfitSharing {
    salaryVES: number;
    dailySalary: number;
    profitSharingDays: number;
    amount: number;
    fiscalYear: number;
}

function calculateFull(
    salaryVES: number,
    profitSharingDays: number,
    fiscalYear: number,
): FullProfitSharing | null {
    if (salaryVES <= 0 || profitSharingDays <= 0) return null;
    const dailySalary = salaryVES / 30;
    const amount = profitSharingDays * dailySalary;
    return { salaryVES, dailySalary, profitSharingDays, amount, fiscalYear };
}

interface FractionalProfitSharing {
    salaryVES: number;
    dailySalary: number;
    profitSharingDays: number;
    fiscalYear: number;
    fiscalStart: string;
    periodStart: string;   // max(fiscalStart, hireDate)
    monthsWorked: number;
    fractionalDays: number;
    amount: number;
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
    // Period starts at whichever is later: fiscal year start or hire date
    const periodStart = maxDate(fiscalStart, hireDate);

    if (cutoffDate <= periodStart) return null;

    const monthsWorked = getCompleteMonths(periodStart, cutoffDate);
    if (monthsWorked <= 0) return null;

    const fractionalDays = Math.ceil((profitSharingDays / 12) * monthsWorked);
    const dailySalary = salaryVES / 30;
    const amount = fractionalDays * dailySalary;

    return {
        salaryVES, dailySalary, profitSharingDays, fiscalYear,
        fiscalStart, periodStart, monthsWorked, fractionalDays, amount,
    };
}

// ============================================================================
// SHARED UI ATOMS
// ============================================================================

function SectionHeader({ label, color }: { label: string; color?: "emerald" | "amber" }) {
    const cls = color === "amber" ? "text-amber-500/70"
        : color === "emerald" ? "text-emerald-500/70"
            : "text-[var(--text-tertiary)]";
    return <p className={`font-mono text-[11px] uppercase tracking-[0.2em] mb-2 pt-1 ${cls}`}>{label}</p>;
}

function CalcRow({ label, formula, value, accent, dim }: {
    label: string; formula?: string; value: string;
    accent?: "emerald" | "amber"; dim?: boolean;
}) {
    const valCls = dim ? "text-[var(--text-tertiary)]"
        : accent === "emerald" ? "text-emerald-500"
            : accent === "amber" ? "text-amber-500"
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

function Hr() { return <div className="border-t border-border-light my-2" />; }

// ============================================================================
// RIGHT PANEL — Full Constancy
// ============================================================================

function FullConstancy({ calc, employeeName, employeeIdNumber, employeeRole, companyName, companyLogoUrl, showLogoInPdf }: {
    calc: FullProfitSharing;
    employeeName: string; employeeIdNumber: string; employeeRole?: string;
    companyName: string; companyLogoUrl?: string; showLogoInPdf?: boolean;
}) {
    const issuedAt = new Date().toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
    const documentId = makeDocumentId(`${employeeIdNumber}|${calc.fiscalYear}|completas`);

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
                        <p className="text-[11px] text-[var(--text-tertiary)] mt-2 uppercase tracking-[0.2em] font-semibold">Constancia de Utilidades Completas</p>
                        <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 font-medium">Art. 131 + 174 LOTTT</p>
                    </div>
                </div>
                <div className="text-right shrink-0">
                    <p className="text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-0.5">Año Fiscal</p>
                    <p className="text-[13px] font-bold text-foreground bg-surface-2 px-2.5 py-1 rounded inline-block border border-border-light">{calc.fiscalYear}</p>
                    <p className="text-[9px] text-[var(--text-tertiary)] mt-2 uppercase">Emitido: {issuedAt}</p>
                </div>
            </div>

            <div className="px-8 py-5 border-b border-border-light flex flex-col sm:flex-row items-center justify-between bg-surface-1">
                <div className="flex items-center gap-4 w-full">
                    <div className="flex-shrink-0 w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center border border-border-light text-[var(--text-tertiary)] group-hover:border-primary-500/50 group-hover:text-primary-500 transition-colors">
                        <Users size={20} />
                    </div>
                    <div className="flex-1">
                        <p className="text-[16px] font-bold text-foreground tracking-tight">{employeeName || "—"}</p>
                        {employeeRole && <p className="text-[11px] uppercase tracking-[0.1em] text-[var(--text-secondary)] font-medium mt-0.5">{employeeRole}</p>}
                    </div>
                    <div className="text-right shrink-0 pl-5 md:pr-4 border-l border-border-light">
                        <p className="text-[13px] font-bold text-foreground tabular-nums">CI {employeeIdNumber || "—"}</p>
                    </div>
                </div>
            </div>

            <div className="px-8 py-5 grid grid-cols-2 lg:grid-cols-4 gap-6 border-b border-border-light bg-surface-2/20">
                {[
                    { lbl: "Salario Mensual",  val: formatCurrency(calc.salaryVES), color: "text-foreground" },
                    { lbl: "Año Fiscal", val: String(calc.fiscalYear), color: "text-foreground" },
                    { lbl: "Días Base", val: `${calc.profitSharingDays} días`, color: "text-primary-500" },
                    { lbl: "Salario Diario",  val: `${formatCurrency(calc.dailySalary)} / día`, color: "text-foreground" },
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
                    <div className="py-3.5 flex items-start justify-between group hover:bg-surface-2/30 -mx-4 px-4 rounded-lg transition-colors">
                        <div className="pr-4">
                            <p className="text-[13px] font-bold text-foreground tracking-tight">Utilidades Anuales</p>
                            <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">Art. 131 + 174 LOTTT · {calc.profitSharingDays}d × {formatNumber(calc.dailySalary)}/día</p>
                        </div>
                        <div className="flex items-center justify-end gap-12 w-48 shrink-0 text-right">
                            <p className="text-[13px] font-medium tabular-nums text-[var(--text-secondary)] w-12">{calc.profitSharingDays}</p>
                            <p className={`text-[14px] font-bold tabular-nums flex-1 text-foreground group-hover:text-primary-500 transition-colors`}>
                                Bs. {formatNumber(calc.amount)}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="mt-4 p-5 rounded-2xl bg-surface-2/60 border border-border-light flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.15em] text-[var(--text-tertiary)] flex items-center gap-2 mb-1">
                            Líquido a recibir
                        </p>
                        <p className="text-[24px] font-black tabular-nums text-foreground leading-none">
                            Bs. {formatNumber(calc.amount)}
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
// RIGHT PANEL — Fractional Constancy
// ============================================================================

function FractionalConstancy({ calc, employeeName, employeeIdNumber, employeeRole,
    companyName, companyLogoUrl, showLogoInPdf, hireDate, cutoffDate }: {
        calc: FractionalProfitSharing;
        employeeName: string; employeeIdNumber: string; employeeRole?: string;
        companyName: string; companyLogoUrl?: string; showLogoInPdf?: boolean;
        hireDate: string; cutoffDate: string;
    }) {
    const issuedAt = new Date().toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
    const documentId = makeDocumentId(`${employeeIdNumber}|${cutoffDate}|fraccionadas`);

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
                        <p className="text-[11px] text-[var(--text-tertiary)] mt-2 uppercase tracking-[0.2em] font-semibold">Constancia de Utilidades Fraccionadas</p>
                        <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 font-medium">Art. 175 LOTTT</p>
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
                    <div className="flex-shrink-0 w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center border border-border-light text-[var(--text-tertiary)] group-hover:border-primary-500/50 group-hover:text-primary-500 transition-colors">
                        <Users size={20} />
                    </div>
                    <div className="flex-1">
                        <p className="text-[16px] font-bold text-foreground tracking-tight">{employeeName || "—"}</p>
                        {employeeRole && <p className="text-[11px] uppercase tracking-[0.1em] text-[var(--text-secondary)] font-medium mt-0.5">{employeeRole}</p>}
                    </div>
                    <div className="text-right shrink-0 pl-5 md:pr-4 border-l border-border-light">
                        <p className="text-[13px] font-bold text-foreground tabular-nums">CI {employeeIdNumber || "—"}</p>
                        <div className="inline-flex items-center gap-1.5 mt-1 text-[11px] text-[var(--text-secondary)] font-medium bg-surface-2 px-2 py-0.5 rounded border border-border-light">
                            <Clock size={12} className="text-[var(--text-tertiary)]" />
                            {calc.monthsWorked} mes{calc.monthsWorked !== 1 ? "es" : ""} en {calc.fiscalYear}
                        </div>
                    </div>
                </div>
            </div>

            <div className="px-8 py-5 grid grid-cols-2 lg:grid-cols-4 gap-6 border-b border-border-light bg-surface-2/20">
                {[
                    { lbl: "Salario Mensual", val: formatCurrency(calc.salaryVES), color: "text-foreground" },
                    { lbl: "Inicio Período", val: formatDate(calc.periodStart), color: "text-foreground" },
                    { lbl: "Meses Trab.", val: `${calc.monthsWorked} mes${calc.monthsWorked !== 1 ? "es" : ""}`, color: "text-primary-500" },
                    { lbl: "Salario Diario", val: `${formatCurrency(calc.dailySalary)} / día`, color: "text-foreground" },
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
                    <div className="py-3.5 flex items-start justify-between group hover:bg-surface-2/30 -mx-4 px-4 rounded-lg transition-colors">
                        <div className="pr-4">
                            <p className="text-[13px] font-bold text-foreground tracking-tight">Utilidades Fraccionadas</p>
                            <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">Art. 175 LOTTT · ⌈ {calc.profitSharingDays}d / 12 × {calc.monthsWorked} meses ⌉</p>
                        </div>
                        <div className="flex items-center justify-end gap-12 w-48 shrink-0 text-right">
                            <p className="text-[13px] font-medium tabular-nums text-[var(--text-secondary)] w-12">{calc.fractionalDays}</p>
                            <p className="text-[14px] font-bold tabular-nums flex-1 text-foreground group-hover:text-primary-500 transition-colors">
                                Bs. {formatNumber(calc.amount)}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="mt-4 p-5 rounded-2xl bg-surface-2/60 border border-border-light flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.15em] text-[var(--text-tertiary)] flex items-center gap-2 mb-1">
                            Líquido a recibir
                        </p>
                        <p className="text-[24px] font-black tabular-nums text-foreground leading-none">
                            Bs. {formatNumber(calc.amount)}
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

type Mode = "completas" | "fraccionadas";

export default function UtilidadesPage() {
    const { companyId, company } = useCompany();
    const { employees, loading } = useEmployee(companyId);

    // ── Mode ────────────────────────────────────────────────────────────────
    const [mode, setMode] = useState<Mode>("completas");

    // ── Employee ─────────────────────────────────────────────────────────────
    const [selectedIdNumber, setSelectedIdNumber] = useState<string>("");
    const [onlyActive,    setOnlyActive]    = useState(true);

    const [salaryOverride, setSalaryOverride] = useState("");
    const [manualHireDate, setManualHireDate] = useState("");

    // ── BCV ─────────────────────────────────────────────────────────────────
    const [exchangeRate, setExchangeRate] = useState("79.59");
    const [bcvLoading, setBcvLoading] = useState(true);
    const [bcvError, setBcvError] = useState<string | null>(null);

    const bcvRate = useMemo(() => parseFloat(exchangeRate) || 0, [exchangeRate]);

    const fetchBcvRate = useCallback(() => {
        setBcvLoading(true);
        fetch(`/api/bcv/rate?date=${isoToday()}`)
            .then(r => r.json())
            .then(d => { 
                const rate = d.price || d.rate;
                if (rate) { 
                    setExchangeRate(rate.toFixed(2)); 
                    setBcvError(null); 
                } else setBcvError("No disponible"); 
            })
            .catch(() => setBcvError("Error al obtener tasa"))
            .finally(() => setBcvLoading(false));
    }, []);

    useEffect(() => { fetchBcvRate(); }, [fetchBcvRate]);

    // ── Shared derived ────────────────────────────────────────────────────────
    const selectedEmp = useMemo(() => employees.find(e => e.cedula === selectedIdNumber), [employees, selectedIdNumber]);

    // Salary field auto-populated from employee data, overridable by user.
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
    const hireDate = selectedEmp?.fechaIngreso ?? manualHireDate;

    // ── Shared params ─────────────────────────────────────────────────────────
    const currentYear = new Date().getFullYear();
    const [fiscalYear, setFiscalYear] = useState(String(currentYear));
    const [profitSharingDays, setProfitSharingDays] = useState("15");

    // ── COMPLETAS ─────────────────────────────────────────────────────────────
    const fullCalculation = useMemo(
        () => calculateFull(salaryVES, parseInt(profitSharingDays) || 0, parseInt(fiscalYear) || currentYear),
        [salaryVES, profitSharingDays, fiscalYear, currentYear],
    );

    // ── FRACCIONADAS ──────────────────────────────────────────────────────────
    const [cutoffDate, setCutoffDate] = useState(isoToday());

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

    // ── BATCH PROCESSING ─────────────────────────────────────────────────────

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

    const totalAmount = useMemo(() => calculationResults.reduce((acc, r) => acc + (r.calc?.amount ?? 0), 0), [calculationResults]);

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
                        fiscalYear: c.fiscalYear,
                        salaryVES: c.salaryVES,
                        dailySalary: c.dailySalary,
                        profitSharingDays: c.profitSharingDays,
                        amount: c.amount,
                        logoUrl: company?.logoUrl,
                        showLogoInPdf: company?.showLogoInPdf,
                    });
                } else {
                    const c = r.calc as FractionalProfitSharing;
                    await generateFractionalProfitSharingPdf({
                        companyName: company?.name ?? "La Empresa",
                        employee: { name: r.emp.nombre, idNumber: r.emp.cedula, role: r.emp.cargo },
                        fiscalYear: c.fiscalYear,
                        hireDate: r.emp.fechaIngreso ?? "",
                        cutoffDate: cutoffDate,
                        fiscalStart: c.fiscalStart,
                        periodStart: c.periodStart,
                        monthsWorked: c.monthsWorked,
                        profitSharingDays: c.profitSharingDays,
                        fractionalDays: c.fractionalDays,
                        salaryVES: c.salaryVES,
                        dailySalary: c.dailySalary,
                        amount: c.amount,
                        logoUrl: company?.logoUrl,
                        showLogoInPdf: company?.showLogoInPdf,
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

                    {/* Mode toggle */}
                    <div className="px-5 py-5 border-b border-border-light bg-surface-2/[0.03]">
                        <label className={labelCls + " mb-2"}>Tipo de Utilidades</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button 
                                onClick={() => setMode("completas")} 
                                className={`flex items-center justify-center gap-2 h-9 rounded-lg border font-mono text-[11px] uppercase tracking-[0.1em] transition-all ${mode === "completas" ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-700" : "bg-surface-1 border-border-light text-[var(--text-secondary)] hover:border-border-medium"}`}
                            >
                                <ClipboardCheck size={14} /> Completas
                            </button>
                            <button 
                                onClick={() => setMode("fraccionadas")} 
                                className={`flex items-center justify-center gap-2 h-9 rounded-lg border font-mono text-[11px] uppercase tracking-[0.1em] transition-all ${mode === "fraccionadas" ? "bg-amber-500/10 border-amber-500/50 text-amber-700" : "bg-surface-1 border-border-light text-[var(--text-secondary)] hover:border-border-medium"}`}
                            >
                                <HandCoins size={14} /> Fraccionadas
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 divide-y divide-border-light">

                        {/* ── Empleado ───────────────────────────────────────── */}
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
                                    <label className={labelCls}>
                                        Salario mensual (Bs.)
                                        <span className="ml-1 text-[var(--text-link)]">— editable</span>
                                    </label>
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
                            {bcvError && <p className="font-mono text-[10px] text-red-500 mt-1.5">{bcvError}</p>}
                        </div>

                        {/* ── Parámetros ─────────────────────────────────────── */}
                        <div className="px-5 py-5 space-y-4">
                            <SectionHeader label="Configuración Fiscal" />
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelCls}>Año fiscal</label>
                                    <div className="relative">
                                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={13} />
                                        <input type="number" min="2000" max="2100" step="1"
                                            value={fiscalYear}
                                            onChange={e => setFiscalYear(e.target.value)}
                                            className={fieldCls + " pl-9 text-right"} />
                                    </div>
                                </div>
                                <div>
                                    <label className={labelCls}>Días util.</label>
                                    <div className="relative">
                                        <HandCoins className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={13} />
                                        <input type="number" min="15" max="120" step="1"
                                            value={profitSharingDays}
                                            onChange={e => setProfitSharingDays(e.target.value)}
                                            className={fieldCls + " pl-9 text-right"} />
                                    </div>
                                </div>
                            </div>
                            <p className="font-mono text-[10px] text-[var(--text-disabled)] leading-relaxed">
                                <Info size={10} className="inline mr-1 -mt-0.5" />
                                Basado en Arts. 131 y 174 de la LOTTT.
                            </p>
                        </div>

                        {/* ══ MODE: COMPLETAS ════════════════════════════════════ */}
                        {mode === "completas" && (
                            <div className="px-5 py-4 space-y-0.5">
                                {fullCalculation && (
                                    <>
                                        <CalcRow label="Salario mensual" value={formatCurrency(fullCalculation.salaryVES)} dim />
                                        <CalcRow label="Salario diario" formula="salario ÷ 30"
                                            value={`${formatNumber(fullCalculation.dailySalary)} Bs./día`} dim />
                                        <Hr />
                                        <SectionHeader label="Utilidades" color="emerald" />
                                        <CalcRow label="Días de utilidades"
                                            formula={`Establecido por el empleador (mín. 15, máx. 120)`}
                                            value={`${fullCalculation.profitSharingDays} días`} dim />
                                        <CalcRow label="Monto"
                                            formula={`${fullCalculation.profitSharingDays}d × ${formatNumber(fullCalculation.dailySalary)} Bs./día`}
                                            value={formatCurrency(fullCalculation.amount)} accent="emerald" />
                                        <Hr />
                                        <div className="flex items-baseline justify-between pt-1">
                                            <span className="font-mono text-[12px] font-bold uppercase tracking-[0.18em] text-[var(--text-secondary)]">Total</span>
                                            <span className="font-mono text-[20px] font-black tabular-nums text-emerald-500">{formatCurrency(fullCalculation.amount)}</span>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {/* ══ MODE: FRACCIONADAS ═════════════════════════════════ */}
                        {mode === "fraccionadas" && (
                            <div className="px-5 py-4 space-y-0.5">
                                <div className="mb-4">
                                    <label className={labelCls}>Fecha de corte</label>
                                    <div className="relative">
                                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={14} />
                                        <input type="date" value={cutoffDate} onChange={e => setCutoffDate(e.target.value)} className={fieldCls + " pl-9"} />
                                    </div>
                                </div>
                                {fractionalCalculation && (
                                    <>
                                        <CalcRow label="Meses trabajados" formula={`Desde ${formatDate(fractionalCalculation.periodStart)}`}
                                            value={`${fractionalCalculation.monthsWorked} meses`} dim />
                                        <CalcRow label="Días proporcionales" formula={`⌈ ${fractionalCalculation.profitSharingDays}d / 12m × ${fractionalCalculation.monthsWorked}m ⌉`}
                                            value={`${fractionalCalculation.fractionalDays} días`} dim />
                                        <Hr />
                                        <SectionHeader label="Utilidades Fracc." color="amber" />
                                        <CalcRow label="Monto"
                                            formula={`${fractionalCalculation.fractionalDays}d × ${formatNumber(fractionalCalculation.dailySalary)} Bs./día`}
                                            value={formatCurrency(fractionalCalculation.amount)} accent="amber" />
                                        <Hr />
                                        <div className="flex items-baseline justify-between pt-1">
                                            <span className="font-mono text-[12px] font-bold uppercase tracking-[0.18em] text-[var(--text-secondary)]">Total</span>
                                            <span className="font-mono text-[20px] font-black tabular-nums text-amber-500">{formatCurrency(fractionalCalculation.amount)}</span>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                    {/* Totals + export */}
                    <div className="p-5 border-t border-border-light space-y-4 mt-auto bg-surface-2/[0.03]">
                        {calculationResults.length > 0 && (
                            <div className="space-y-2 mb-4 bg-surface-2/40 rounded-xl p-4 border border-border-light/50">
                                <div className="flex justify-between font-mono text-[11px] uppercase tracking-wider">
                                    <span className="text-[var(--text-tertiary)]">Empleados</span>
                                    <span className="text-foreground font-bold">{calculationResults.length}</span>
                                </div>
                                
                                {calculationResults.filter(r => r.msg).length > 0 && (
                                    <div className="flex justify-between font-mono text-[11px] uppercase tracking-wider">
                                        <span className="text-[var(--text-tertiary)]">Observaciones</span>
                                        <span className="text-amber-500 font-bold">{calculationResults.filter(r => r.msg).length}</span>
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
                            onClick={handleExportBatch}
                            isLoading={isExportingBatch}
                            disabled={calculationResults.length === 0 || calculationResults.every(r => !r.calc)}
                            leftIcon={<Download size={14} />}
                        >
                            {isExportingBatch ? "Generando…" : `Generar PDF (${calculationResults.filter(r => r.calc).length})`}
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
                    ) : calculationResults.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full gap-5 text-[var(--text-disabled)] max-w-sm mx-auto animate-in fade-in duration-500">
                            <div className="w-20 h-20 rounded-[1.5rem] bg-surface-1 border border-border-light flex items-center justify-center shadow-sm text-border-medium">
                                <Users strokeWidth={1.5} size={32} />
                            </div>
                            <div className="text-center space-y-2">
                                <p className="text-[14px] font-bold uppercase tracking-widest text-foreground">Sistema Listo</p>
                                <p className="text-[13px] font-medium text-[var(--text-secondary)] leading-relaxed">
                                    Selecciona un empleado de la lista y ajusta los parámetros de cálculo para previsualizar la constancia de utilidades.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="max-w-4xl mx-auto space-y-10 pb-12">
                            {calculationResults.map((result, i) => {
                                if (result.msg || !result.calc) return (
                                    <div key={result.emp.cedula} className="bg-surface-1 rounded-xl p-4 border border-border-light flex justify-between items-center opacity-70">
                                        <div>
                                            <p className="font-mono text-[13px] font-bold uppercase text-foreground">{result.emp.nombre}</p>
                                            <p className="font-mono text-[10px] text-[var(--text-tertiary)] uppercase">{result.emp.cargo}</p>
                                        </div>
                                        <span className="font-mono text-[10px] text-amber-500 uppercase border border-amber-500/20 px-2 py-0.5 rounded">{result.msg ?? "Error"}</span>
                                    </div>
                                );

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
