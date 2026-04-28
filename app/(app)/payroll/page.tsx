"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { DesktopOnlyGuard } from "@/src/shared/frontend/components/desktop-only-guard";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { Receipt, TrendingUp, RefreshCw, ChevronDown, Calendar, CalendarDays } from "lucide-react";
import { calculateWeeklyFactor } from "@/src/modules/payroll/frontend/utils/payroll-helper";
import {
    getQuincenaInfo,
    getWeekInfo,
    getMondaysOfMonth,
    MONTH_NAMES,
    type Quincena,
    type PeriodoMode,
} from "@/src/modules/payroll/frontend/utils/period-info";
import {
    makeEarningsFromDefs,
    extractEarningDefs,
    makeDeductionsFromDefs,
    makeBonusesFromDefs,
    makeHorasExtrasFromDefs,
    buildSettings,
} from "@/src/modules/payroll/frontend/utils/settings-builders";
import { EarningsSection, DeductionsSection, BonusesSection } from "@/src/modules/payroll/frontend/components/payroll-accordion-sections";
import { HorasExtrasGlobalEditor } from "@/src/modules/payroll/frontend/components/payroll-row-editors";
import { PayrollEmployeeTable } from "@/src/modules/payroll/frontend/components/payroll-employee-table";
import type { EmployeeResult } from "@/src/modules/payroll/frontend/components/payroll-employee-table";
import { EarningRow, DeductionRow, BonusRow, EarningValue, DeductionValue, BonusValue, HorasExtrasRow } from "@/src/modules/payroll/frontend/types/payroll-types";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useEmployee } from "@/src/modules/payroll/frontend/hooks/use-employee";
import { usePayrollHistory } from "@/src/modules/payroll/frontend/hooks/use-payroll-history";
import { usePayrollSettings } from "@/src/modules/payroll/frontend/hooks/use-payroll-settings";
import { generateCestaTicketPdf } from "@/src/modules/payroll/frontend/utils/cesta-ticket-pdf";
import { getTodayIsoDate } from "@/src/shared/frontend/utils/local-date";
import type { PdfVisibility } from "@/src/modules/payroll/backend/domain/payroll-settings";

// ============================================================================
// LOCAL UI HELPERS
// ============================================================================

function SectionHeader({ label, color }: { label: string; color?: "green" | "amber" }) {
    const cls = color === "amber" ? "text-amber-500/70"
        : color === "green" ? "text-green-500/70"
            : "text-[var(--text-tertiary)]";
    return <p className={`font-mono text-[11px] uppercase tracking-[0.2em] mb-2 pt-1 ${cls}`}>{label}</p>;
}

// ============================================================================
// LEFT PANEL — collapsible section
// ============================================================================

function ConfigSection({
    title, badge, open, onToggle, children,
}: {
    title: string;
    badge?: string;
    open: boolean;
    onToggle: () => void;
    children: React.ReactNode;
}) {
    return (
        <div className="border-b border-border-light last:border-0">
            <button
                onClick={onToggle}
                className="w-full flex items-center justify-between px-5 py-3 hover:bg-foreground/[0.02] transition-colors duration-150"
            >
                <div className="flex items-center gap-3">
                    <span className="font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                        {title}
                    </span>
                    {badge && (
                        <span className="font-mono text-[11px] tabular-nums text-[var(--text-tertiary)]">
                            {badge}
                        </span>
                    )}
                </div>
                <svg
                    width="10" height="10" viewBox="0 0 10 10" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    className="text-[var(--text-tertiary)] transition-transform duration-200 flex-shrink-0"
                    style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
                >
                    <path d="M2 4l3 3 3-3" />
                </svg>
            </button>
            {open && (
                <div className="px-5 pb-4">
                    {children}
                </div>
            )}
        </div>
    );
}

// ============================================================================
// STAT CHIP — small metric inside the period card
// ============================================================================

function DayStat({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
    return (
        <div className="flex flex-col items-center gap-0.5">
            <span className={["font-mono text-[18px] font-black tabular-nums", muted ? "text-[var(--text-tertiary)]" : "text-foreground"].join(" ")}>
                {value}
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">{label}</span>
        </div>
    );
}

// ============================================================================
// PAGE
// ============================================================================

export default function PayrollCalculator() {
    const { companyId, company } = useCompany();
    const { employees, loading: empLoading, error: empError } = useEmployee(companyId);
    const { confirm, saveDraft, runs } = usePayrollHistory(companyId);
    const { settings: savedSettings, loading: settingsLoading, loadedAt: settingsLoadedAt, save: saveSettings } = usePayrollSettings(companyId);

    // ── Quincena / Semanal ─────────────────────────────────────────────────
    const now = new Date();
    const [selYear,    setSelYear]    = useState(now.getFullYear());
    const [selMonth,   setSelMonth]   = useState(now.getMonth() + 1);
    const [selQuincena, setSelQuincena] = useState<Quincena>(now.getDate() <= 15 ? 1 : 2);
    const [periodoMode, setPeriodoMode] = useState<PeriodoMode>("quincenal");

    // Initialise selWeekMonday to the Monday of the current week.
    const [selWeekMonday, setSelWeekMonday] = useState<string>(() => {
        const d = new Date();
        const diff = d.getDay() === 0 ? -6 : 1 - d.getDay();
        d.setDate(d.getDate() + diff);
        const pad = (n: number) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    });

    const quincenaInfo = useMemo(
        () => getQuincenaInfo(selYear, selMonth, selQuincena),
        [selYear, selMonth, selQuincena]
    );

    const mondaysOfMonth = useMemo(() => getMondaysOfMonth(selYear, selMonth), [selYear, selMonth]);
    const weekInfo       = useMemo(() => getWeekInfo(selWeekMonday),           [selWeekMonday]);

    // When the user switches year/month while in semanal mode, reset to the
    // first Monday of the new month so the week stays in bounds.
    useEffect(() => {
        if (periodoMode !== "semanal") return;
        const mondays = getMondaysOfMonth(selYear, selMonth);
        if (mondays.length > 0 && !mondays.includes(selWeekMonday)) {
            setSelWeekMonday(mondays[0]);
        }
    }, [selYear, selMonth, periodoMode, selWeekMonday]);

    // Active period info — drives all downstream calculations.
    const activePeriodInfo = periodoMode === "quincenal" ? quincenaInfo : weekInfo;
    // For semanal mode every deduction applies (quincena "second-half" concept
    // does not exist in weekly payroll; the user can remove FAOV rows manually).
    const activeQuincena: 1 | 2 = periodoMode === "semanal" ? 2 : selQuincena;

    // Cesta ticket es un beneficio mensual: aparece en la 2ª quincena (modo
    // quincenal) o en la última semana del mes (modo semanal).
    const isLastWeekOfMonth = periodoMode === "semanal"
        && mondaysOfMonth.length > 0
        && selWeekMonday === mondaysOfMonth[mondaysOfMonth.length - 1];
    const showCestaTicket =
        (periodoMode === "quincenal" && selQuincena === 2) || isLastWeekOfMonth;

    // ── Global params ──────────────────────────────────────────────────────
    const [exchangeRate, setExchangeRate] = useState("79.59");
    const [monthlySalary, setMonthlySalary] = useState("130.00");

    // ── BCV fetch ──────────────────────────────────────────────────────────
    const [bcvDate, setBcvDate] = useState(() => getTodayIsoDate());
    const [bcvLoading, setBcvLoading] = useState(false);
    const [bcvFetchError, setBcvFetchError] = useState<string | null>(null);

    const fetchBcvRate = useCallback(async () => {
        setBcvLoading(true);
        setBcvFetchError(null);
        try {
            const res = await fetch(`/api/bcv/rate?date=${bcvDate}`);
            const data = await res.json();
            if (!res.ok) { setBcvFetchError(data.error ?? "Error al consultar."); return; }
            setExchangeRate(String(data.rate));
        } catch {
            setBcvFetchError("No se pudo conectar con la API BCV.");
        } finally {
            setBcvLoading(false);
        }
    }, [bcvDate]);

    // ── Row lists ──────────────────────────────────────────────────────────
    const [earningRows, setEarningRows] = useState<EarningRow[]>(() =>
        makeEarningsFromDefs(savedSettings.earningRowDefs, quincenaInfo.weekdays, quincenaInfo.saturdays, quincenaInfo.sundays, quincenaInfo.holidays)
    );
    const [deductionRows, setDeductionRows] = useState<DeductionRow[]>(() => makeDeductionsFromDefs(savedSettings.deductionRowDefs));
    const [bonusRows, setBonusRows] = useState<BonusRow[]>(() => makeBonusesFromDefs(savedSettings.bonusRowDefs));

    // ── Alícuotas ──────────────────────────────────────────────────────────
    const [diasUtilidades, setDiasUtilidades] = useState(String(savedSettings.diasUtilidades));
    const [diasBonoVacacional, setDiasBonoVacacional] = useState(String(savedSettings.diasBonoVacacional));

    // ── Salary mode ────────────────────────────────────────────────────────
    const [salaryMode, setSalaryMode] = useState<"mensual" | "integral">(savedSettings.salaryMode);

    // ── Cesta Ticket ───────────────────────────────────────────────────────
    const [cestaTicketUSD, setCestaTicketUSD] = useState(String(savedSettings.cestaTicketUSD));

    // ── Horas extras globales (Art. 118 LOTTT) ──────────────────────────────
    const [horasExtrasGlobal, setHorasExtrasGlobal] = useState<HorasExtrasRow[]>(
        () => makeHorasExtrasFromDefs(savedSettings.horasExtrasGlobalRows)
    );
    const updateHorasExtrasGlobal = useCallback(
        (id: string, u: HorasExtrasRow) =>
            setHorasExtrasGlobal((rs) => rs.map((r) => r.id === id ? u : r)),
        [],
    );

    // ── Salario mínimo (para tope SSO) ─────────────────────────────────────
    const [salarioMinimoInput, setSalarioMinimoInput] = useState(
        savedSettings.salarioMinimoRef > 0 ? String(savedSettings.salarioMinimoRef) : ""
    );

    // ── PDF visibility ─────────────────────────────────────────────────────
    const [pdfVisibility, setPdfVisibility] = useState<PdfVisibility>(savedSettings.pdfVisibility);

    // ── Mounted guard — prevents SSR/client disabled-attribute mismatch ────
    // companyId is read from localStorage on the client but is null during SSR,
    // so any button disabled={!companyId} would diverge. Gate on mounted instead.
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);

    // ── Settings save state ────────────────────────────────────────────────
    const [saveLoading, setSaveLoading] = useState(false);
    const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

    // ── Apply loaded settings when company or tenant changes ───────────────
    // Use settingsLoadedAt as the gate: each successful fetch or save increments
    // it, so switching A→B→A correctly re-applies Company A settings (REQ-008).
    // We also guard against applying while a fetch is still in flight.
    const appliedLoadRef = useRef(0);

    useEffect(() => {
        if (settingsLoading) return;
        if (settingsLoadedAt === 0) return;                     // no successful fetch yet
        if (settingsLoadedAt === appliedLoadRef.current) return; // already applied this load
        appliedLoadRef.current = settingsLoadedAt;

        setDiasUtilidades(String(savedSettings.diasUtilidades));
        setDiasBonoVacacional(String(savedSettings.diasBonoVacacional));
        setSalaryMode(savedSettings.salaryMode);
        setCestaTicketUSD(String(savedSettings.cestaTicketUSD));
        setSalarioMinimoInput(savedSettings.salarioMinimoRef > 0 ? String(savedSettings.salarioMinimoRef) : "");
        setHorasExtrasGlobal(makeHorasExtrasFromDefs(savedSettings.horasExtrasGlobalRows));
        setPdfVisibility(savedSettings.pdfVisibility);
        setDeductionRows(makeDeductionsFromDefs(savedSettings.deductionRowDefs));
        setBonusRows(makeBonusesFromDefs(savedSettings.bonusRowDefs));
        setEarningRows(makeEarningsFromDefs(
            savedSettings.earningRowDefs,
            activePeriodInfo.weekdays, activePeriodInfo.saturdays,
            activePeriodInfo.sundays, activePeriodInfo.holidays,
        ));
    }, [settingsLoadedAt, settingsLoading, savedSettings, activePeriodInfo]);

    // ── Left panel sections open/closed ────────────────────────────────────
    const [openSections, setOpenSections] = useState({
        alicuotas: true,
        earnings: true,
        deductions: true,
        bonuses: true,
        pdfVisibility: false,
    });
    const toggleSection = (key: keyof typeof openSections) =>
        setOpenSections((s) => ({ ...s, [key]: !s[key] }));

    // ── Auto-fill days when period changes ─────────────────────────────────
    // Rebuilds earning rows from current defs + new calendar values.
    const earningRowsRef = useRef(earningRows);
    earningRowsRef.current = earningRows;

    const handleAutoFill = useCallback(() => {
        setEarningRows(makeEarningsFromDefs(
            extractEarningDefs(earningRowsRef.current),
            activePeriodInfo.weekdays, activePeriodInfo.saturdays,
            activePeriodInfo.sundays, activePeriodInfo.holidays,
        ));
    }, [activePeriodInfo]);

    // handleAutoFill updates whenever activePeriodInfo changes (period/mode switches).
    useEffect(() => { handleAutoFill(); }, [handleAutoFill]);

    // Fetch BCV rate once on mount. A ref guards against re-runs when fetchBcvRate
    // changes (e.g. when bcvDate state changes), so the manual refresh button stays
    // the only trigger for subsequent fetches.
    const didInitialBcvFetch = useRef(false);
    useEffect(() => {
        if (didInitialBcvFetch.current) return;
        didInitialBcvFetch.current = true;
        void fetchBcvRate();
    }, [fetchBcvRate]);

    // ── Save settings handler ──────────────────────────────────────────────
    const handleSaveSettings = useCallback(async () => {
        if (!companyId) return;
        setSaveLoading(true);
        setSaveMsg(null);
        const diasUtilNum = Math.max(0, parseFloat(diasUtilidades) || 15);
        const diasBonoNum = Math.max(0, parseFloat(diasBonoVacacional) || 15);
        const err = await saveSettings(buildSettings(
            earningRows, deductionRows, bonusRows,
            diasUtilNum, diasBonoNum, salaryMode,
            parseFloat(cestaTicketUSD) || 40,
            Math.max(0, parseFloat(salarioMinimoInput) || 0),
            horasExtrasGlobal,
            pdfVisibility,
        ));
        setSaveLoading(false);
        setSaveMsg(err ? { ok: false, text: err } : { ok: true, text: "Configuración guardada" });
        setTimeout(() => setSaveMsg(null), 3000);
    }, [companyId, earningRows, deductionRows, bonusRows, diasUtilidades, diasBonoVacacional,
        salaryMode, cestaTicketUSD, salarioMinimoInput, horasExtrasGlobal,
        pdfVisibility, saveSettings]);

    // ── Derived ────────────────────────────────────────────────────────────
    const mondaysInMonth = activePeriodInfo.mondays;
    const dailyRate = useMemo(() => (parseFloat(monthlySalary) || 0) / 30, [monthlySalary]);
    const weeklyRate = useMemo(() => calculateWeeklyFactor(parseFloat(monthlySalary) || 0), [monthlySalary]);
    const bcvRate = useMemo(() => parseFloat(exchangeRate) || 0, [exchangeRate]);
    const weeklyBase = useMemo(() => weeklyRate * mondaysInMonth, [weeklyRate, mondaysInMonth]);
    const salarioMinimo = useMemo(() => Math.max(0, parseFloat(salarioMinimoInput) || 0), [salarioMinimoInput]);
    const cappedWeeklyBase = useMemo(() => salarioMinimo > 0 ? Math.min(weeklyBase, 10 * salarioMinimo) : weeklyBase, [weeklyBase, salarioMinimo]);


    // Sprint 2: alícuotas para el salario de referencia (panel izquierdo)
    const diasUtilNum = useMemo(() => Math.max(0, parseFloat(diasUtilidades) || 15), [diasUtilidades]);
    const diasBonoNum = useMemo(() => Math.max(0, parseFloat(diasBonoVacacional) || 15), [diasBonoVacacional]);
    const refSalary = useMemo(() => parseFloat(monthlySalary) || 0, [monthlySalary]);
    const alicuotaUtil = useMemo(() => (refSalary / 30) * (diasUtilNum / 360), [refSalary, diasUtilNum]);
    const alicuotaBono = useMemo(() => (refSalary / 30) * (diasBonoNum / 360), [refSalary, diasBonoNum]);
    const integralBase = useMemo(() => refSalary + alicuotaUtil + alicuotaBono, [refSalary, alicuotaUtil, alicuotaBono]);

    // ── Computed row values (for audit display) ────────────────────────────
    const earningValues = useMemo<EarningValue[]>(() =>
        earningRows.map((r) => ({
            ...r,
            computed: r.useDaily
                ? (parseFloat(r.quantity) || 0) * dailyRate * (parseFloat(r.multiplier) || 1)
                : parseFloat(r.quantity) || 0,
        })), [earningRows, dailyRate]);

    const deductionValues = useMemo<DeductionValue[]>(() =>
        deductionRows
            // FAOV rule: exclude "second-half" rows in first quincena (not applicable in semanal mode)
            .filter((r) => !(r.quincenaRule === "second-half" && activeQuincena === 1))
            .map((r) => {
                if (r.mode === "fixed") return { ...r, computed: parseFloat(r.rate) || 0 };
                const base = r.base === "weekly-capped" ? cappedWeeklyBase
                    : r.base === "weekly" ? weeklyBase
                        : r.base === "integral" ? integralBase
                            : refSalary;
                return { ...r, computed: base * ((parseFloat(r.rate) || 0) / 100) };
            }), [deductionRows, activeQuincena, weeklyBase, cappedWeeklyBase, integralBase, refSalary]);

    const bonusValues = useMemo<BonusValue[]>(() =>
        bonusRows.map((r) => ({
            ...r,
            computed: (parseFloat(r.amount) || 0) * bcvRate,
        })), [bonusRows, bcvRate]);

    const totalEarnings = useMemo(() => earningValues.reduce((s, r) => s + r.computed, 0), [earningValues]);
    const totalDeductions = useMemo(() => deductionValues.reduce((s, r) => s + r.computed, 0), [deductionValues]);
    const totalBonuses = useMemo(() => bonusValues.reduce((s, r) => s + r.computed, 0), [bonusValues]);

    // ── Row mutators ───────────────────────────────────────────────────────
    const updateEarning = useCallback((id: string, u: EarningRow) => setEarningRows((rs) => rs.map((r) => r.id === id ? u : r)), []);
    const removeEarning = useCallback((id: string) => setEarningRows((rs) => rs.filter((r) => r.id !== id)), []);
    const addEarning = useCallback((b: EarningRow) => setEarningRows((rs) => [...rs, b]), []);
    const updateDeduction = useCallback((id: string, u: DeductionRow) => setDeductionRows((rs) => rs.map((r) => r.id === id ? u : r)), []);
    const removeDeduction = useCallback((id: string) => setDeductionRows((rs) => rs.filter((r) => r.id !== id)), []);
    const addDeduction = useCallback((b: DeductionRow) => setDeductionRows((rs) => [...rs, b]), []);
    const updateBonus = useCallback((id: string, u: BonusRow) => setBonusRows((rs) => rs.map((r) => r.id === id ? u : r)), []);
    const removeBonus = useCallback((id: string) => setBonusRows((rs) => rs.filter((r) => r.id !== id)), []);
    const addBonus = useCallback((b: BonusRow) => setBonusRows((rs) => [...rs, b]), []);

    // ── Duplicate period check ─────────────────────────────────────────────
    // Sólo bloquea cuando hay una nómina **confirmada** para el período;
    // los borradores se sobrescriben en cada export.
    const periodAlreadyConfirmed = useMemo(
        () => runs.some(
            (r) => r.companyId === companyId &&
                r.periodStart === activePeriodInfo.startDate &&
                r.periodEnd === activePeriodInfo.endDate &&
                r.status === "confirmed",
        ),
        [runs, companyId, activePeriodInfo],
    );


    // ── Confirm / Save draft ───────────────────────────────────────────────
    const buildPayload = useCallback((results: EmployeeResult[]) => {
        if (!companyId) return null;
        return {
            run: {
                companyId,
                periodStart: activePeriodInfo.startDate,
                periodEnd: activePeriodInfo.endDate,
                exchangeRate: bcvRate,
            },
            receipts: results.map((r) => ({
                companyId,
                employeeId: r.cedula,
                employeeCedula: r.cedula,
                employeeNombre: r.nombre,
                employeeCargo: r.cargo,
                monthlySalary: r.salarioMensual,
                totalEarnings: r.totalEarnings,
                totalDeductions: r.totalDeductions,
                totalBonuses: r.totalBonuses,
                netPay: r.net,
                calculationData: {
                    gross: r.gross,
                    netUsd: r.netUSD,
                    mondaysInMonth,
                    diasUtilidades: diasUtilNum,
                    diasBonoVacacional: diasBonoNum,
                    alicuotaUtil: r.alicuotaUtil,
                    alicuotaBono: r.alicuotaBono,
                    salarioIntegral: r.salarioIntegral,
                },
            })),
        };
    }, [companyId, activePeriodInfo, bcvRate, mondaysInMonth, diasUtilNum, diasBonoNum]);

    const handleConfirm = useCallback(async (results: EmployeeResult[]): Promise<string | null> => {
        const payload = buildPayload(results);
        if (!payload) return "No hay empresa seleccionada";
        return confirm(payload);
    }, [buildPayload, confirm]);

    const handleSaveDraft = useCallback(async (results: EmployeeResult[]): Promise<{ runId: string | null; error: string | null }> => {
        const payload = buildPayload(results);
        if (!payload) return { runId: null, error: "No hay empresa seleccionada" };
        return saveDraft(payload);
    }, [buildPayload, saveDraft]);

    // ── Quincena buttons ───────────────────────────────────────────────────
    const qBtnCls = (active: boolean) => [
        "flex-1 h-8 rounded-lg font-mono text-[12px] uppercase tracking-[0.16em] border transition-colors duration-150",
        active
            ? "bg-primary-500 border-primary-600 text-white"
            : "bg-surface-1 border-border-light text-[var(--text-secondary)] hover:border-border-medium hover:text-foreground",
    ].join(" ");

    const fieldCls = [
        "w-full h-9 px-3 rounded-lg border border-border-light bg-surface-1 outline-none",
        "font-mono text-[13px] text-foreground tabular-nums appearance-none",
        "focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150",
    ].join(" ");

    const labelCls = "font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] mb-1.5 block";

    // ── Render ─────────────────────────────────────────────────────────────
    return (
        <DesktopOnlyGuard>
            <div className="flex flex-1 flex-col bg-surface-2 font-mono overflow-hidden">

                <PageHeader
                    title="Nómina"
                    subtitle={
                        <div className="flex items-center gap-2">
                            <span>{activePeriodInfo.label}</span>
                            <span className="text-border-light/40">•</span>
                            <span>{employees.filter(e => e.estado === "activo").length} activos</span>
                        </div>
                    }
                >
                    <div className="flex items-center gap-3">
                        {showCestaTicket && (
                            <BaseButton.Root
                                variant="secondary"
                                size="sm"
                                onClick={() => {
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
                                        }
                                    );
                                }}
                                leftIcon={<Receipt size={14} />}
                            >
                                Cesta Ticket
                            </BaseButton.Root>
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

                <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">

                    {/* ══ LEFT PANEL — configuration ══════════════════════════════ */}
                    <aside className="w-full lg:w-96 shrink-0 flex flex-col border-b lg:border-b-0 lg:border-r border-border-light bg-surface-1 overflow-y-auto">

                        <div className="px-5 py-4 border-b border-border-light bg-surface-2/[0.03]">
                            <p className="font-mono text-[13px] font-black uppercase tracking-widest text-foreground leading-none flex items-center gap-2">
                                <TrendingUp size={14} className="text-primary-500" />
                                Calculadora
                            </p>
                        </div>

                        {/* Header */}
                        <div className="px-5 py-4 border-b border-border-light">
                            <div className="flex items-center justify-between">
                                <p className="font-mono text-[14px] font-black uppercase tracking-tight text-foreground leading-none">
                                    Configuración
                                </p>
                                <button
                                    onClick={handleSaveSettings}
                                    disabled={!mounted || saveLoading || !companyId}
                                    className={[
                                        "h-7 px-2.5 rounded-md border font-mono text-[10px] uppercase tracking-[0.14em] transition-colors duration-150 flex items-center gap-1.5",
                                        saveMsg?.ok
                                            ? "border-green-500/40 bg-green-500/10 text-green-500"
                                            : saveMsg?.ok === false
                                                ? "border-red-500/40 bg-red-500/10 text-red-500"
                                                : "border-primary-500/40 bg-primary-500/10 text-primary-500 hover:bg-primary-500/[0.16]",
                                        "disabled:opacity-40 disabled:cursor-not-allowed",
                                    ].join(" ")}
                                >
                                    {saveLoading ? "…" : saveMsg ? saveMsg.text : "Guardar"}
                                </button>
                            </div>
                        </div>

                        {/* ── Period selector ─────────────────────────────────── */}
                        <div className="px-5 py-4 border-b border-border-light space-y-3">
                            <SectionHeader label="Período" />

                            {/* Periodo mode toggle */}
                            <div>
                                <label className={labelCls}>Modalidad</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button 
                                        onClick={() => setPeriodoMode("quincenal")} 
                                        className={[
                                            "flex items-center justify-center gap-2 h-9 rounded-lg border font-mono text-[11px] uppercase tracking-[0.1em] transition-all shadow-sm",
                                            periodoMode === "quincenal" 
                                                ? "bg-primary-500/10 border-primary-500/40 text-primary-600 font-bold" 
                                                : "bg-surface-1 border-border-light text-[var(--text-secondary)] hover:border-border-medium hover:text-foreground"
                                        ].join(" ")}
                                    >
                                        <CalendarDays size={14} /> Quincenal
                                    </button>
                                    <button 
                                        onClick={() => setPeriodoMode("semanal")}   
                                        className={[
                                            "flex items-center justify-center gap-2 h-9 rounded-lg border font-mono text-[11px] uppercase tracking-[0.1em] transition-all shadow-sm",
                                            periodoMode === "semanal" 
                                                ? "bg-primary-500/10 border-primary-500/40 text-primary-600 font-bold" 
                                                : "bg-surface-1 border-border-light text-[var(--text-secondary)] hover:border-border-medium hover:text-foreground"
                                        ].join(" ")}
                                    >
                                        <Calendar size={14} /> Semanal
                                    </button>
                                </div>
                            </div>

                            {/* Month + Year */}
                            <div className="flex gap-2 pt-1">
                                <div className="flex-1">
                                    <label className={labelCls}>Mes</label>
                                    <div className="relative">
                                        <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" size={14} />
                                        <select
                                            value={selMonth}
                                            onChange={(e) => setSelMonth(Number(e.target.value))}
                                            className={fieldCls + " pl-9 shadow-sm"}
                                        >
                                            {MONTH_NAMES.map((name, i) => (
                                                <option key={i + 1} value={i + 1}>{name}</option>
                                            ))}
                                        </select>
                                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
                                    </div>
                                </div>
                                <div className="w-24">
                                    <label className={labelCls}>Año</label>
                                    <div className="relative">
                                        <select
                                            value={selYear}
                                            onChange={(e) => setSelYear(Number(e.target.value))}
                                            className={fieldCls + " pr-9 shadow-sm"}
                                        >
                                            {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                                                <option key={y} value={y}>{y}</option>
                                            ))}
                                        </select>
                                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
                                    </div>
                                </div>
                            </div>

                            {/* Quincena toggle (quincenal mode only) */}
                            {periodoMode === "quincenal" && (
                                <div className="pt-1">
                                    <label className={labelCls}>Quincena Select</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button 
                                            onClick={() => setSelQuincena(1)} 
                                            className={[
                                                "flex items-center justify-center h-9 rounded-lg border font-mono text-[12px] uppercase tracking-[0.1em] transition-all shadow-sm",
                                                selQuincena === 1 
                                                    ? "bg-primary-500/10 border-primary-500/40 text-primary-600 font-bold" 
                                                    : "bg-surface-1 border-border-light text-[var(--text-secondary)] hover:border-border-medium hover:text-foreground"
                                            ].join(" ")}
                                        >
                                            1–15
                                        </button>
                                        <button 
                                            onClick={() => setSelQuincena(2)} 
                                            className={[
                                                "flex items-center justify-center h-9 rounded-lg border font-mono text-[12px] uppercase tracking-[0.1em] transition-all shadow-sm",
                                                selQuincena === 2 
                                                    ? "bg-primary-500/10 border-primary-500/40 text-primary-600 font-bold" 
                                                    : "bg-surface-1 border-border-light text-[var(--text-secondary)] hover:border-border-medium hover:text-foreground"
                                            ].join(" ")}
                                        >
                                            16–fin
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Week selector (semanal mode only) */}
                            {periodoMode === "semanal" && (
                                <div className="pt-1">
                                    <label className={labelCls}>Semanas del Mes (Inicio Lunes)</label>
                                    <div className="grid grid-cols-1 gap-2">
                                        {mondaysOfMonth.map((monday, i) => {
                                            const sun = new Date(monday + "T00:00:00");
                                            sun.setDate(sun.getDate() + 6);
                                            const endFmt = sun.toLocaleDateString("es-VE", { day: "2-digit", month: "short" });
                                            const startFmt = new Date(monday + "T00:00:00").toLocaleDateString("es-VE", { day: "2-digit", month: "short" });
                                            const isSel = selWeekMonday === monday;
                                            return (
                                                <button
                                                    key={monday}
                                                    onClick={() => setSelWeekMonday(monday)}
                                                    className={[
                                                        "flex items-center justify-between px-3 py-2.5 rounded-lg border font-mono transition-all duration-150 shadow-sm",
                                                        isSel 
                                                          ? "bg-primary-500/10 border-primary-500/40" 
                                                          : "bg-surface-1 border-border-light hover:border-border-medium"
                                                    ].join(" ")}
                                                >
                                                    <span className={["text-[12px] font-bold uppercase tracking-wider", isSel ? "text-primary-600" : "text-[var(--text-secondary)]"].join(" ")}>
                                                        Semana {i + 1}
                                                    </span>
                                                    <span className={["text-[11px] tabular-nums", isSel ? "text-primary-600/80" : "text-[var(--text-tertiary)]"].join(" ")}>
                                                        {startFmt} – {endFmt}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Day summary */}
                            <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-border-light bg-surface-2">
                                <DayStat label="Norm" value={activePeriodInfo.weekdays} />
                                <div className="w-px h-6 bg-border-light" />
                                <DayStat label="Sáb" value={activePeriodInfo.saturdays} />
                                <div className="w-px h-6 bg-border-light" />
                                <DayStat label="Dom" value={activePeriodInfo.sundays} />
                                <div className="w-px h-6 bg-border-light" />
                                <DayStat label="Lun" value={activePeriodInfo.mondays} muted />
                                {activePeriodInfo.holidays > 0 && (
                                    <>
                                        <div className="w-px h-6 bg-border-light" />
                                        <DayStat label="Fer" value={activePeriodInfo.holidays} />
                                    </>
                                )}
                            </div>
                            {/* Holiday list */}
                            {activePeriodInfo.holidayList.length > 0 && (
                                <div className="px-3 py-2 rounded-lg border border-primary-500/20 bg-primary-500/[0.04] space-y-1">
                                    {activePeriodInfo.holidayList.map((h) => (
                                        <div key={h.date} className="flex items-center justify-between">
                                            <span className="font-mono text-[12px] text-[var(--text-secondary)]">{h.name}</span>
                                            <span className="font-mono text-[12px] tabular-nums text-primary-500">
                                                {new Date(h.date + "T00:00:00").toLocaleDateString("es-VE", { day: "2-digit", month: "short" })}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* ── BCV Rate ────────────────────────────────────────── */}
                        <div className="px-5 py-4 border-b border-border-light space-y-1">
                            <div className="flex items-center justify-between items-start">
                                <SectionHeader label="Tasa BCV" />
                                <button
                                    onClick={fetchBcvRate}
                                    disabled={bcvLoading || !bcvDate}
                                    className="p-1.5 -mt-1.5 hover:bg-surface-2 rounded-md transition-colors text-[var(--text-tertiary)] hover:text-primary-500 disabled:opacity-40"
                                    title="Consultar BCV"
                                >
                                    <RefreshCw size={13} className={bcvLoading ? "animate-spin" : ""} />
                                </button>
                            </div>

                            <div className="flex flex-col gap-2">
                                <BaseInput.Field
                                    type="date"
                                    value={bcvDate}
                                    max={getTodayIsoDate()}
                                    onValueChange={(v) => { setBcvDate(v); setBcvFetchError(null); }}
                                    title="Fecha sugerida"
                                />
                                <BaseInput.Field
                                    type="number"
                                    step={0.01}
                                    value={exchangeRate}
                                    onValueChange={setExchangeRate}
                                    prefix="Bs."
                                    inputClassName="text-right"
                                    title="Tasa manual"
                                />
                            </div>
                            {bcvFetchError && <p className="font-mono text-[10px] text-red-400 mt-1">Error al consultar</p>}
                        </div>

                        {/* ── Cesta Ticket — 2ª quincena (quincenal) o última semana (semanal) ─── */}
                        {showCestaTicket && (
                            <div className="px-5 py-4 border-b border-border-light space-y-3">
                                <SectionHeader
                                    label={periodoMode === "semanal"
                                        ? "Cesta Ticket · Última Semana"
                                        : "Cesta Ticket · 2ª Quincena"}
                                />
                                <BaseInput.Field
                                    label="Monto por empleado (USD)"
                                    type="number"
                                    step={0.01}
                                    min={0}
                                    value={cestaTicketUSD}
                                    onValueChange={setCestaTicketUSD}
                                    prefix="$"
                                    inputClassName="text-right"
                                />

                                <div className="px-3 py-2 rounded-lg border border-primary-500/20 bg-primary-500/[0.04]">
                                    <div className="flex justify-between font-mono text-[12px]">
                                        <span className="text-[var(--text-tertiary)]">Equiv. por empleado</span>
                                        <span className="text-primary-500 tabular-nums">
                                            {((parseFloat(cestaTicketUSD) || 0) * bcvRate).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ── Reference salary ────────────────────────────────── */}
                        <div className="px-5 py-4 border-b border-border-light space-y-2">
                            <SectionHeader label="Referencia mensual" />
                            <BaseInput.Field
                                label="Salario mensual base (Bs.)"
                                type="number"
                                step={0.01}
                                value={monthlySalary}
                                onValueChange={setMonthlySalary}
                                prefix="Bs."
                                inputClassName="text-right"
                            />
                            <p className="font-mono text-[12px] text-[var(--text-tertiary)] mt-1.5 leading-relaxed">
                                Usado <span className="text-[var(--text-secondary)]">solo para previsualizar</span> fórmulas. Cada empleado usará el salario asignado en su ficha.
                            </p>
                        </div>

                        {/* ── Collapsible sections ─────────────────────────────── */}
                        <div className="flex-1">

                            {/* Alícuotas */}
                            <ConfigSection
                                title="Alícuotas"
                                badge={`Sal. Integral: ${integralBase.toLocaleString("es-VE", { maximumFractionDigits: 2 })} Bs`}
                                open={openSections.alicuotas}
                                onToggle={() => toggleSection("alicuotas")}
                            >
                                <div className="py-3 space-y-3">
                                    <p className="font-mono text-[12px] text-[var(--text-tertiary)] leading-relaxed">
                                        Base para prestaciones y algunas retenciones.<br />
                                        Salario integral = salario + alíc. util + alíc. bono vac.
                                    </p>
                                    {/* Salary mode toggle */}
                                    <div>
                                        <label className={labelCls}>Salario en el PDF</label>
                                        <div className="flex gap-1.5">
                                            <button
                                                onClick={() => setSalaryMode("mensual")}
                                                className={qBtnCls(salaryMode === "mensual")}
                                            >
                                                Normal
                                            </button>
                                            <button
                                                onClick={() => setSalaryMode("integral")}
                                                className={qBtnCls(salaryMode === "integral")}
                                            >
                                                Integral
                                            </button>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <BaseInput.Field
                                            label="Días Utilidades"
                                            type="number"
                                            min={15}
                                            step={1}
                                            value={diasUtilidades}
                                            onValueChange={setDiasUtilidades}
                                            inputClassName="text-right"
                                        />
                                        <BaseInput.Field
                                            label="Días Bono Vac."
                                            type="number"
                                            min={15}
                                            step={1}
                                            value={diasBonoVacacional}
                                            onValueChange={setDiasBonoVacacional}
                                            inputClassName="text-right"
                                        />
                                    </div>
                                    <div className="px-3 py-2.5 rounded-lg border border-amber-500/20 bg-amber-500/[0.05] space-y-1.5">
                                        {/* Resultado */}
                                        <div className="flex justify-between items-baseline font-mono">
                                            <span className="text-[12px] uppercase tracking-[0.16em] text-[var(--text-secondary)]">Sal. Integral</span>
                                            <span className="text-[13px] font-black tabular-nums text-foreground">
                                                {integralBase.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs
                                            </span>
                                        </div>
                                        <div className="border-t border-amber-500/20" />
                                        {/* Fórmula */}
                                        <div className="space-y-0.5 font-mono text-[12px] tabular-nums">
                                            <div className="flex justify-between">
                                                <span className="text-[var(--text-tertiary)]">=</span>
                                                <span className="text-[var(--text-secondary)]">{refSalary.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-[var(--text-tertiary)]">+ util <span className="text-[var(--text-disabled)]">({diasUtilNum}d / 360)</span></span>
                                                <span className="text-amber-500">{alicuotaUtil.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-[var(--text-tertiary)]">+ bono vac <span className="text-[var(--text-disabled)]">({diasBonoNum}d / 360)</span></span>
                                                <span className="text-amber-500">{alicuotaBono.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs</span>
                                            </div>
                                        </div>
                                    </div>
                                    <p className="font-mono text-[12px] text-[var(--text-disabled)]">
                                        En Deducciones usa la base <span className="text-amber-500">integral</span> para retenciones que apliquen sobre salario integral.
                                    </p>
                                </div>
                            </ConfigSection>

                            <ConfigSection
                                title="Asignaciones"
                                badge={totalEarnings > 0 ? `${totalEarnings.toLocaleString("es-VE", { maximumFractionDigits: 0 })} Bs` : undefined}
                                open={openSections.earnings}
                                onToggle={() => toggleSection("earnings")}
                            >
                                <EarningsSection
                                    rows={earningRows} values={earningValues} total={totalEarnings}
                                    dailyRate={dailyRate}
                                    onUpdate={updateEarning} onRemove={removeEarning} onAdd={addEarning}
                                />
                                <div className="mt-3 pt-3 border-t border-border-light space-y-2">
                                    <SectionHeader label="Horas extras — Art. 118 LOTTT" />
                                    <div className="space-y-2.5">
                                        {horasExtrasGlobal.map((row) => (
                                            <HorasExtrasGlobalEditor
                                                key={row.id}
                                                row={row}
                                                dailyRate={dailyRate}
                                                onChange={(u) => updateHorasExtrasGlobal(row.id, u)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </ConfigSection>

                            <ConfigSection
                                title="Deducciones"
                                badge={totalDeductions > 0 ? `-${totalDeductions.toLocaleString("es-VE", { maximumFractionDigits: 0 })} Bs` : undefined}
                                open={openSections.deductions}
                                onToggle={() => toggleSection("deductions")}
                            >
                                <DeductionsSection
                                    rows={deductionRows} values={deductionValues} total={totalDeductions}
                                    weeklyBase={weeklyBase} weeklyRate={weeklyRate} mondaysInMonth={mondaysInMonth}
                                    monthlySalary={monthlySalary} integralBase={integralBase}
                                    cappedWeeklyBase={cappedWeeklyBase}
                                    onUpdate={updateDeduction} onRemove={removeDeduction} onAdd={addDeduction}
                                />
                                {/* Salario mínimo para tope SSO */}
                                <div className="mt-3 pt-3 border-t border-border-light space-y-2">
                                    <SectionHeader label="Tope SSO (10 × salario mínimo)" />
                                    <BaseInput.Field
                                        type="number"
                                        step={0.01}
                                        placeholder="Salario mínimo Bs."
                                        value={salarioMinimoInput}
                                        onValueChange={setSalarioMinimoInput}
                                        inputClassName="text-right"
                                    />
                                    {salarioMinimo > 0 && (
                                        <p className="font-mono text-[12px] text-[var(--text-tertiary)]">
                                            Base SSO máx: <span className="text-red-400 tabular-nums">{(10 * salarioMinimo).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs</span>
                                            {cappedWeeklyBase < weeklyBase && (
                                                <span className="text-[var(--text-tertiary)]"> · tope activo</span>
                                            )}
                                        </p>
                                    )}
                                </div>
                            </ConfigSection>

                            <ConfigSection
                                title="Bonos y Extras"
                                badge={totalBonuses > 0 ? `${totalBonuses.toLocaleString("es-VE", { maximumFractionDigits: 0 })} Bs` : undefined}
                                open={openSections.bonuses}
                                onToggle={() => toggleSection("bonuses")}
                            >
                                {bonusRows.length > 0 && (
                                    <div className="flex justify-end pt-2">
                                        <button
                                            onClick={() => setBonusRows([])}
                                            className="font-mono text-[11px] uppercase tracking-[0.16em] text-red-400 hover:text-red-500 transition-colors duration-150"
                                        >
                                            Eliminar todas
                                        </button>
                                    </div>
                                )}
                                <BonusesSection
                                    rows={bonusRows} values={bonusValues} total={totalBonuses}
                                    bcvRate={bcvRate}
                                    onUpdate={updateBonus} onRemove={removeBonus} onAdd={addBonus}
                                />
                            </ConfigSection>

                            {/* PDF Visibility */}
                            <ConfigSection
                                title="Visibilidad PDF"
                                badge={Object.values(pdfVisibility).some((v) => !v) ? "personalizado" : undefined}
                                open={openSections.pdfVisibility}
                                onToggle={() => toggleSection("pdfVisibility")}
                            >
                                <div className="py-3 space-y-2">
                                    <p className="font-mono text-[12px] text-[var(--text-tertiary)] leading-relaxed">
                                        Controla qué secciones aparecen en el PDF generado.
                                        La visibilidad no afecta los cálculos ni los totales.
                                    </p>
                                    {(
                                        [
                                            ["showEarnings", "Asignaciones"],
                                            ["showDeductions", "Deducciones"],
                                            ["showBonuses", "Bonificaciones"],
                                            ["showOvertime", "Horas Extras"],
                                            ["showAlicuotaBreakdown", "Desglose Salario Integral"],
                                        ] as [keyof PdfVisibility, string][]
                                    ).map(([key, label]) => (
                                        <div key={key} className="flex items-center justify-between py-1">
                                            <span className="font-mono text-[12px] text-[var(--text-secondary)]">{label}</span>
                                            <button
                                                onClick={() => setPdfVisibility((v) => ({ ...v, [key]: !v[key] }))}
                                                className={[
                                                    "h-6 px-2.5 rounded border font-mono text-[10px] uppercase tracking-[0.14em] transition-colors duration-150",
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
                            </ConfigSection>
                        </div>

                    </aside>

                    {/* ══ RIGHT PANEL — results ════════════════════════════════════ */}
                    <main className="flex-1 flex flex-col overflow-hidden">

                        {/* Table area */}
                        <div className="flex-1 overflow-y-auto p-6">
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
                        </div>

                    </main>

                </div>
            </div>
        </DesktopOnlyGuard>
    );
}
