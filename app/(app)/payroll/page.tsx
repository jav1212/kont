"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { calculateWeeklyFactor } from "@/src/modules/payroll/frontend/utils/payroll-helper";
import { getHolidaysInRange } from "@/src/modules/payroll/frontend/utils/venezuela-holidays";
import type { Holiday } from "@/src/modules/payroll/frontend/utils/venezuela-holidays";
import { EarningsSection, DeductionsSection, BonusesSection } from "@/src/modules/payroll/frontend/components/payroll-accordion-sections";
import { PayrollEmployeeTable } from "@/src/modules/payroll/frontend/components/payroll-employee-table";
import type { EmployeeResult }  from "@/src/modules/payroll/frontend/components/payroll-employee-table";
import { EarningRow, DeductionRow, BonusRow, EarningValue, DeductionValue, BonusValue } from "@/src/modules/payroll/frontend/types/payroll-types";
import { useCompany }        from "@/src/modules/companies/frontend/hooks/use-companies";
import { useEmployee }       from "@/src/modules/payroll/frontend/hooks/use-employee";
import { usePayrollHistory } from "@/src/modules/payroll/frontend/hooks/use-payroll-history";
import { generateCestaTicketPdf } from "@/src/modules/payroll/frontend/utils/cesta-ticket-pdf";

// ============================================================================
// QUINCENA UTILS
// ============================================================================

type Quincena = 1 | 2;

interface QuincenaInfo {
    weekdays:  number;  // Mon–Fri excluding holidays
    saturdays: number;
    sundays:   number;
    mondays:   number;
    holidays:  number;  // weekday national holidays in period
    holidayList: Holiday[];
    startDate: string;
    endDate:   string;
    label:     string;
}

const MONTH_NAMES = [
    "Enero","Febrero","Marzo","Abril","Mayo","Junio",
    "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

function getQuincenaInfo(year: number, month: number, q: Quincena): QuincenaInfo {
    const startDay = q === 1 ? 1 : 16;
    const endDay   = q === 1 ? 15 : new Date(year, month, 0).getDate();
    const start    = new Date(year, month - 1, startDay);
    const end      = new Date(year, month - 1, endDay);

    const pad   = (n: number) => String(n).padStart(2, "0");
    const toISO = (d: Date)   => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

    const startISO = toISO(start);
    const endISO   = toISO(end);

    // Detect holidays that fall on weekdays within this period
    const holidayList = getHolidaysInRange(startISO, endISO);
    const holidayDates = new Set(holidayList.map((h) => h.date));

    let weekdays = 0, saturdays = 0, sundays = 0, mondays = 0;
    const cur = new Date(start);
    while (cur <= end) {
        const iso = toISO(cur);
        const wd  = cur.getDay();
        if (wd === 0)      sundays++;
        else if (wd === 6) saturdays++;
        else if (!holidayDates.has(iso)) weekdays++; // holidays excluded from normal weekdays
        if (wd === 1)      mondays++;
        cur.setDate(cur.getDate() + 1);
    }

    return {
        weekdays, saturdays, sundays, mondays,
        holidays: holidayList.length,
        holidayList,
        startDate: startISO, endDate: endISO,
        label: `${startDay}–${endDay} de ${MONTH_NAMES[month-1]} ${year}`,
    };
}

// ============================================================================
// DEFAULT ROWS
// ============================================================================

let _seq = 0;
const uid = (p: string) => `${p}_${++_seq}_${Date.now()}`;

const makeDefaultEarnings = (wd: number, sat: number, sun: number, hol = 0): EarningRow[] => {
    const rows: EarningRow[] = [
        { id: uid("e"), label: "Días Normales",        quantity: String(wd),  multiplier: "1.0", useDaily: true },
        { id: uid("e"), label: "Sábados",              quantity: String(sat), multiplier: "1.0", useDaily: true },
        { id: uid("e"), label: "Domingos",             quantity: String(sun), multiplier: "1.5", useDaily: true },
    ];
    if (hol > 0) {
        rows.push({ id: uid("e"), label: "Feriados Nacionales", quantity: String(hol), multiplier: "1.0", useDaily: true });
    }
    return rows;
};

const DEFAULT_DEDUCTIONS: DeductionRow[] = [
    { id: uid("d"), label: "S.S.O",   rate: "4",   base: "weekly-capped", mode: "rate" },
    { id: uid("d"), label: "R.P.E",   rate: "0.5", base: "weekly",        mode: "rate" },
    { id: uid("d"), label: "F.A.O.V", rate: "1",   base: "monthly",       mode: "rate" },
];

const DEFAULT_BONUSES: BonusRow[] = [
    { id: uid("b"), label: "Bono Alimentación", amount: "40.00" },
    { id: uid("b"), label: "Bono Transporte",   amount: "20.00" },
];

// ============================================================================
// LEFT PANEL — collapsible section
// ============================================================================

function ConfigSection({
    title, badge, open, onToggle, children,
}: {
    title:    string;
    badge?:   string;
    open:     boolean;
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
    const { confirm, runs } = usePayrollHistory(companyId);

    // ── Quincena ───────────────────────────────────────────────────────────
    const now = new Date();
    const [selYear,     setSelYear]     = useState(now.getFullYear());
    const [selMonth,    setSelMonth]    = useState(now.getMonth() + 1);
    const [selQuincena, setSelQuincena] = useState<Quincena>(now.getDate() <= 15 ? 1 : 2);

    const quincenaInfo = useMemo(
        () => getQuincenaInfo(selYear, selMonth, selQuincena),
        [selYear, selMonth, selQuincena]
    );

    // ── Global params ──────────────────────────────────────────────────────
    const [exchangeRate,  setExchangeRate]  = useState("79.59");
    const [monthlySalary, setMonthlySalary] = useState("130.00");

    // ── BCV fetch ──────────────────────────────────────────────────────────
    const [bcvDate,      setBcvDate]      = useState(() => new Date().toISOString().split("T")[0]);
    const [bcvLoading,   setBcvLoading]   = useState(false);
    const [bcvFetchError, setBcvFetchError] = useState<string | null>(null);
    const [bcvFetchedDate, setBcvFetchedDate] = useState<string | null>(null);

    const fetchBcvRate = useCallback(async () => {
        setBcvLoading(true);
        setBcvFetchError(null);
        setBcvFetchedDate(null);
        try {
            const res  = await fetch(`/api/bcv/rate?date=${bcvDate}`);
            const data = await res.json();
            if (!res.ok) { setBcvFetchError(data.error ?? "Error al consultar."); return; }
            setExchangeRate(String(data.rate));
            setBcvFetchedDate(data.date);
        } catch {
            setBcvFetchError("No se pudo conectar con la API BCV.");
        } finally {
            setBcvLoading(false);
        }
    }, [bcvDate]);

    // ── Row lists ──────────────────────────────────────────────────────────
    const [earningRows,   setEarningRows]   = useState<EarningRow[]>(() =>
        makeDefaultEarnings(quincenaInfo.weekdays, quincenaInfo.saturdays, quincenaInfo.sundays, quincenaInfo.holidays)
    );
    const [deductionRows, setDeductionRows] = useState<DeductionRow[]>(DEFAULT_DEDUCTIONS);
    const [bonusRows,     setBonusRows]     = useState<BonusRow[]>(DEFAULT_BONUSES);

    // ── Alícuotas ──────────────────────────────────────────────────────────
    const [diasUtilidades,     setDiasUtilidades]     = useState("15");
    const [diasBonoVacacional, setDiasBonoVacacional] = useState("15");

    // ── Salary mode ────────────────────────────────────────────────────────
    const [salaryMode, setSalaryMode] = useState<"mensual" | "integral">("mensual");

    // ── Cesta Ticket ───────────────────────────────────────────────────────
    const [cestaTicketUSD, setCestaTicketUSD] = useState("40.00");

    // ── Bono nocturno ──────────────────────────────────────────────────────
    const [bonoNocturnoEnabled,   setBonoNocturnoEnabled]   = useState(false);
    const [diasNocturnosInput,    setDiasNocturnosInput]    = useState("");

    // ── Salario mínimo (para tope SSO) ─────────────────────────────────────
    const [salarioMinimoInput, setSalarioMinimoInput] = useState("");

    // ── Left panel sections open/closed ────────────────────────────────────
    const [openSections, setOpenSections] = useState({
        nocturno:   false,
        alicuotas:  true,
        earnings:   true,
        deductions: true,
        bonuses:    true,
    });
    const toggleSection = (key: keyof typeof openSections) =>
        setOpenSections((s) => ({ ...s, [key]: !s[key] }));

    // ── Auto-fill days when quincena changes ───────────────────────────────
    const handleAutoFill = useCallback(() => {
        setEarningRows(() => makeDefaultEarnings(
            quincenaInfo.weekdays,
            quincenaInfo.saturdays,
            quincenaInfo.sundays,
            quincenaInfo.holidays,
        ));
    }, [quincenaInfo]);

    useEffect(() => { handleAutoFill(); }, [selYear, selMonth, selQuincena]); // eslint-disable-line
    useEffect(() => { fetchBcvRate(); }, []); // eslint-disable-line

    // ── Derived ────────────────────────────────────────────────────────────
    const mondaysInMonth = quincenaInfo.mondays;
    const dailyRate      = useMemo(() => (parseFloat(monthlySalary) || 0) / 30,                 [monthlySalary]);
    const weeklyRate     = useMemo(() => calculateWeeklyFactor(parseFloat(monthlySalary) || 0), [monthlySalary]);
    const bcvRate        = useMemo(() => parseFloat(exchangeRate) || 0,                         [exchangeRate]);
    const weeklyBase        = useMemo(() => weeklyRate * mondaysInMonth,                           [weeklyRate, mondaysInMonth]);
    const salarioMinimo     = useMemo(() => Math.max(0, parseFloat(salarioMinimoInput) || 0),     [salarioMinimoInput]);
    const cappedWeeklyBase  = useMemo(() => salarioMinimo > 0 ? Math.min(weeklyBase, 10 * salarioMinimo) : weeklyBase, [weeklyBase, salarioMinimo]);

    // Bono nocturno: días efectivos
    const diasNocturnosQuincena = useMemo(() => {
        const parsed = parseFloat(diasNocturnosInput);
        return isNaN(parsed) || diasNocturnosInput === "" ? quincenaInfo.weekdays : Math.max(0, parsed);
    }, [diasNocturnosInput, quincenaInfo.weekdays]);

    // Sprint 2: alícuotas para el salario de referencia (panel izquierdo)
    const diasUtilNum  = useMemo(() => Math.max(0, parseFloat(diasUtilidades)     || 15), [diasUtilidades]);
    const diasBonoNum  = useMemo(() => Math.max(0, parseFloat(diasBonoVacacional) || 15), [diasBonoVacacional]);
    const refSalary    = useMemo(() => parseFloat(monthlySalary) || 0, [monthlySalary]);
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
        deductionRows.map((r) => {
            if (r.mode === "fixed") return { ...r, computed: parseFloat(r.rate) || 0 };
            const base = r.base === "weekly-capped" ? cappedWeeklyBase
                       : r.base === "weekly"        ? weeklyBase
                       : r.base === "integral"      ? integralBase
                       : refSalary;
            return { ...r, computed: base * ((parseFloat(r.rate) || 0) / 100) };
        }), [deductionRows, weeklyBase, cappedWeeklyBase, integralBase, refSalary]);

    const bonusValues = useMemo<BonusValue[]>(() =>
        bonusRows.map((r) => ({
            ...r,
            computed: (parseFloat(r.amount) || 0) * bcvRate,
        })), [bonusRows, bcvRate]);

    const totalEarnings   = useMemo(() => earningValues.reduce((s, r)   => s + r.computed, 0), [earningValues]);
    const totalDeductions = useMemo(() => deductionValues.reduce((s, r) => s + r.computed, 0), [deductionValues]);
    const totalBonuses    = useMemo(() => bonusValues.reduce((s, r)     => s + r.computed, 0), [bonusValues]);

    // ── Row mutators ───────────────────────────────────────────────────────
    const updateEarning   = useCallback((id: string, u: EarningRow)   => setEarningRows((rs)   => rs.map((r) => r.id === id ? u : r)), []);
    const removeEarning   = useCallback((id: string)                   => setEarningRows((rs)   => rs.filter((r) => r.id !== id)), []);
    const addEarning      = useCallback((b: EarningRow)                => setEarningRows((rs)   => [...rs, b]), []);
    const updateDeduction = useCallback((id: string, u: DeductionRow) => setDeductionRows((rs) => rs.map((r) => r.id === id ? u : r)), []);
    const removeDeduction = useCallback((id: string)                   => setDeductionRows((rs) => rs.filter((r) => r.id !== id)), []);
    const addDeduction    = useCallback((b: DeductionRow)              => setDeductionRows((rs) => [...rs, b]), []);
    const updateBonus     = useCallback((id: string, u: BonusRow)     => setBonusRows((rs)     => rs.map((r) => r.id === id ? u : r)), []);
    const removeBonus     = useCallback((id: string)                   => setBonusRows((rs)     => rs.filter((r) => r.id !== id)), []);
    const addBonus        = useCallback((b: BonusRow)                  => setBonusRows((rs)     => [...rs, b]), []);

    // ── Duplicate period check ─────────────────────────────────────────────
    const periodAlreadyConfirmed = useMemo(
        () => runs.some(
            (r) => r.companyId === companyId &&
                   r.periodStart === quincenaInfo.startDate &&
                   r.periodEnd   === quincenaInfo.endDate,
        ),
        [runs, companyId, quincenaInfo],
    );

    // ── Confirm ────────────────────────────────────────────────────────────
    const handleConfirm = useCallback(async (results: EmployeeResult[]): Promise<string | null> => {
        if (!companyId) return "No hay empresa seleccionada";
        return confirm({
            run: {
                companyId,
                periodStart:  quincenaInfo.startDate,
                periodEnd:    quincenaInfo.endDate,
                exchangeRate: bcvRate,
            },
            receipts: results.map((r) => ({
                companyId,
                employeeId:      r.cedula,
                employeeCedula:  r.cedula,
                employeeNombre:  r.nombre,
                employeeCargo:   r.cargo,
                monthlySalary:   r.salarioMensual,
                totalEarnings:   r.totalEarnings,
                totalDeductions: r.totalDeductions,
                totalBonuses:    r.totalBonuses,
                netPay:          r.net,
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
        });
    }, [companyId, quincenaInfo, bcvRate, mondaysInMonth, diasUtilNum, diasBonoNum, confirm]);

    // ── Quincena buttons ───────────────────────────────────────────────────
    const qBtnCls = (active: boolean) => [
        "flex-1 h-8 rounded-lg font-mono text-[12px] uppercase tracking-[0.16em] border transition-colors duration-150",
        active
            ? "bg-primary-500 border-primary-600 text-white"
            : "bg-surface-1 border-border-light text-[var(--text-secondary)] hover:border-border-medium hover:text-foreground",
    ].join(" ");

    const fieldCls = [
        "w-full h-9 px-3 rounded-lg border border-border-light bg-surface-1 outline-none",
        "font-mono text-[13px] text-foreground tabular-nums",
        "focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150",
    ].join(" ");

    const labelCls = "font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] mb-1.5 block";

    // ── Render ─────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-1 bg-surface-2 font-mono overflow-hidden">

            {/* ══ LEFT PANEL — configuration ══════════════════════════════ */}
            <aside className="w-80 flex-shrink-0 flex flex-col border-r border-border-light bg-surface-1 overflow-y-auto">

                {/* Header */}
                <div className="px-5 py-4 border-b border-border-light">
                    <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--text-tertiary)] mb-0.5">
                        Nómina · Calculadora
                    </p>
                    <p className="font-mono text-[14px] font-black uppercase tracking-tight text-foreground leading-none">
                        Configuración
                    </p>
                </div>

                {/* ── Period selector ─────────────────────────────────── */}
                <div className="px-5 py-4 border-b border-border-light space-y-3">
                    <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
                        Período
                    </p>

                    {/* Month + Year */}
                    <div className="flex gap-2">
                        <div className="flex-1">
                            <label className={labelCls}>Mes</label>
                            <select
                                value={selMonth}
                                onChange={(e) => setSelMonth(Number(e.target.value))}
                                className={fieldCls}
                            >
                                {MONTH_NAMES.map((name, i) => (
                                    <option key={i+1} value={i+1}>{name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="w-20">
                            <label className={labelCls}>Año</label>
                            <select
                                value={selYear}
                                onChange={(e) => setSelYear(Number(e.target.value))}
                                className={fieldCls}
                            >
                                {[now.getFullYear()-1, now.getFullYear(), now.getFullYear()+1].map((y) => (
                                    <option key={y} value={y}>{y}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Quincena toggle */}
                    <div>
                        <label className={labelCls}>Quincena</label>
                        <div className="flex gap-1.5">
                            <button onClick={() => setSelQuincena(1)} className={qBtnCls(selQuincena === 1)}>1–15</button>
                            <button onClick={() => setSelQuincena(2)} className={qBtnCls(selQuincena === 2)}>16–fin</button>
                        </div>
                    </div>

                    {/* Day summary */}
                    <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-border-light bg-surface-2">
                        <DayStat label="Norm" value={quincenaInfo.weekdays} />
                        <div className="w-px h-6 bg-border-light" />
                        <DayStat label="Sáb"  value={quincenaInfo.saturdays} />
                        <div className="w-px h-6 bg-border-light" />
                        <DayStat label="Dom"  value={quincenaInfo.sundays} />
                        <div className="w-px h-6 bg-border-light" />
                        <DayStat label="Lun"  value={quincenaInfo.mondays} muted />
                        {quincenaInfo.holidays > 0 && (
                            <>
                                <div className="w-px h-6 bg-border-light" />
                                <DayStat label="Fer" value={quincenaInfo.holidays} />
                            </>
                        )}
                    </div>
                    {/* Holiday list */}
                    {quincenaInfo.holidayList.length > 0 && (
                        <div className="px-3 py-2 rounded-lg border border-primary-500/20 bg-primary-500/[0.04] space-y-1">
                            {quincenaInfo.holidayList.map((h) => (
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
                <div className="px-5 py-4 border-b border-border-light space-y-3">
                    <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
                        Tasa BCV (VES / USD)
                    </p>

                    {/* Date picker + fetch button */}
                    <div>
                        <label className={labelCls}>Fecha de consulta</label>
                        <div className="flex gap-1.5">
                            <input
                                type="date"
                                value={bcvDate}
                                max={new Date().toISOString().split("T")[0]}
                                onChange={(e) => { setBcvDate(e.target.value); setBcvFetchError(null); setBcvFetchedDate(null); }}
                                className={fieldCls + " flex-1"}
                            />
                            <button
                                onClick={fetchBcvRate}
                                disabled={bcvLoading || !bcvDate}
                                className={[
                                    "h-9 px-3 rounded-lg border flex items-center gap-1.5 shrink-0",
                                    "font-mono text-[12px] uppercase tracking-[0.16em] transition-colors duration-150",
                                    "border-primary-500/40 bg-primary-500/10 text-primary-500 hover:bg-primary-500/[0.16]",
                                    "disabled:opacity-40 disabled:cursor-not-allowed",
                                ].join(" ")}
                            >
                                {bcvLoading ? (
                                    <svg className="animate-spin" width="12" height="12" viewBox="0 0 12 12" fill="none">
                                        <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3" />
                                        <path d="M11 6A5 5 0 0 0 6 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                    </svg>
                                ) : (
                                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M10 6A4 4 0 1 1 6 2" /><path d="M10 2v4h-4" />
                                    </svg>
                                )}
                                {bcvLoading ? "…" : "Consultar"}
                            </button>
                        </div>
                        {bcvFetchError && (
                            <div className="mt-1.5 px-3 py-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.06]">
                                <p className="font-mono text-[12px] text-amber-500 leading-relaxed">
                                    No se pudo obtener la tasa BCV. Puedes introducirla manualmente en el campo de abajo.
                                </p>
                            </div>
                        )}
                        {bcvFetchedDate && !bcvFetchError && (
                            <p className="font-mono text-[12px] text-green-500 mt-1">
                                Tasa al {new Date(bcvFetchedDate + "T00:00:00").toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" })}
                            </p>
                        )}
                    </div>

                    {/* Manual rate input */}
                    <div>
                        <label className={labelCls}>Tasa (Bs. por USD)</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[12px] text-[var(--text-tertiary)] pointer-events-none select-none">
                                Bs.
                            </span>
                            <input
                                type="number"
                                step="0.01"
                                value={exchangeRate}
                                onChange={(e) => { setExchangeRate(e.target.value); setBcvFetchedDate(null); }}
                                className={fieldCls + " pl-9 text-right"}
                            />
                        </div>
                    </div>
                </div>

                {/* ── Cesta Ticket (solo 2ª quincena) ─────────────────── */}
                {selQuincena === 2 && (
                    <div className="px-5 py-4 border-b border-border-light space-y-3">
                        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
                            Cesta Ticket · 2ª Quincena
                        </p>
                        <div>
                            <label className={labelCls}>Monto por empleado (USD)</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[12px] text-[var(--text-tertiary)] pointer-events-none select-none">
                                    $
                                </span>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={cestaTicketUSD}
                                    onChange={(e) => setCestaTicketUSD(e.target.value)}
                                    className={fieldCls + " pl-7 text-right"}
                                />
                            </div>
                        </div>
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
                <div className="px-5 py-3 border-b border-border-light">
                    <label className={labelCls}>Salario mensual referencia (Bs.)</label>
                    <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[12px] text-[var(--text-tertiary)] pointer-events-none select-none">
                            Bs.
                        </span>
                        <input
                            type="number"
                            step="0.01"
                            value={monthlySalary}
                            onChange={(e) => setMonthlySalary(e.target.value)}
                            className={fieldCls + " pl-7 text-right"}
                        />
                    </div>
                    <p className="font-mono text-[12px] text-[var(--text-tertiary)] mt-1.5">
                        Usado para previsualizar fórmulas · cada empleado usa su propio salario
                    </p>
                </div>

                {/* ── Collapsible sections ─────────────────────────────── */}
                <div className="flex-1">
                    {/* Turno Nocturno */}
                    <ConfigSection
                        title="Turno Nocturno"
                        badge={bonoNocturnoEnabled ? `${diasNocturnosQuincena}d · 30%` : undefined}
                        open={openSections.nocturno}
                        onToggle={() => toggleSection("nocturno")}
                    >
                        <div className="py-3 space-y-3">
                            <p className="font-mono text-[12px] text-[var(--text-tertiary)] leading-relaxed">
                                Art. 117 LOTTT — recargo del 30% sobre el salario diario
                                por cada día trabajado en turno nocturno.
                            </p>
                            <div className="flex items-center justify-between">
                                <span className="font-mono text-[12px] text-[var(--text-secondary)] uppercase tracking-[0.14em]">Activar para esta nómina</span>
                                <button
                                    onClick={() => setBonoNocturnoEnabled((v) => !v)}
                                    className={[
                                        "h-7 px-3 rounded-md border font-mono text-[11px] uppercase tracking-[0.12em] transition-colors duration-150",
                                        bonoNocturnoEnabled
                                            ? "border-primary-500/40 bg-primary-500/10 text-primary-500"
                                            : "border-border-light bg-surface-1 text-[var(--text-tertiary)] hover:border-border-medium",
                                    ].join(" ")}
                                >
                                    {bonoNocturnoEnabled ? "Activo" : "Inactivo"}
                                </button>
                            </div>
                            {bonoNocturnoEnabled && (
                                <div>
                                    <label className={labelCls}>Días en turno nocturno</label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="1"
                                        placeholder={String(quincenaInfo.weekdays)}
                                        value={diasNocturnosInput}
                                        onChange={(e) => setDiasNocturnosInput(e.target.value)}
                                        className={fieldCls + " text-right"}
                                    />
                                    <p className="font-mono text-[12px] text-[var(--text-tertiary)] mt-1.5">
                                        Vacío = todos los días normales ({quincenaInfo.weekdays}d)
                                    </p>
                                    <div className="mt-2 px-3 py-2 rounded-lg border border-primary-500/20 bg-primary-500/[0.04]">
                                        <div className="flex justify-between font-mono text-[12px]">
                                            <span className="text-[var(--text-tertiary)]">Recargo por empleado</span>
                                            <span className="text-primary-500 tabular-nums">
                                                +{(diasNocturnosQuincena * (parseFloat(monthlySalary) || 0) / 30 * 0.30)
                                                    .toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </ConfigSection>

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
                                <div>
                                    <label className={labelCls}>Días Utilidades</label>
                                    <input
                                        type="number" min="15" step="1"
                                        value={diasUtilidades}
                                        onChange={(e) => setDiasUtilidades(e.target.value)}
                                        className={fieldCls + " text-right"}
                                    />
                                </div>
                                <div>
                                    <label className={labelCls}>Días Bono Vac.</label>
                                    <input
                                        type="number" min="15" step="1"
                                        value={diasBonoVacacional}
                                        onChange={(e) => setDiasBonoVacacional(e.target.value)}
                                        className={fieldCls + " text-right"}
                                    />
                                </div>
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
                            rows={earningRows}   values={earningValues} total={totalEarnings}
                            dailyRate={dailyRate}
                            onUpdate={updateEarning} onRemove={removeEarning} onAdd={addEarning}
                        />
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
                            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Tope SSO (10 × salario mínimo)</p>
                            <input
                                type="number"
                                step="0.01"
                                placeholder="Salario mínimo Bs."
                                value={salarioMinimoInput}
                                onChange={(e) => setSalarioMinimoInput(e.target.value)}
                                className={fieldCls + " text-right"}
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
                </div>

            </aside>

            {/* ══ RIGHT PANEL — results ════════════════════════════════════ */}
            <main className="flex-1 flex flex-col overflow-hidden">

                {/* Header bar */}
                <div className="flex items-center justify-between px-6 py-3.5 border-b border-border-light bg-surface-1 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="flex flex-col gap-0.5">
                            <p className="font-mono text-[11px] font-semibold text-foreground uppercase tracking-tight">
                                {quincenaInfo.label}
                            </p>
                            <div className="flex items-center gap-2">
                                <span className="font-mono text-[12px] uppercase tracking-widest text-[var(--text-tertiary)]">
                                    {employees.filter(e => e.estado === "activo").length} activos · {employees.length} total
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Cesta ticket button — only 2ª quincena */}
                        {selQuincena === 2 && (
                            <button
                                onClick={() => {
                                    const active = employees.filter((e) => e.estado === "activo");
                                    if (!active.length) return;
                                    generateCestaTicketPdf(
                                        active.map((e) => ({ cedula: e.cedula, nombre: e.nombre, cargo: e.cargo, estado: e.estado })),
                                        {
                                            companyName: company?.name ?? "",
                                            companyId:   company?.id,
                                            periodLabel: quincenaInfo.label,
                                            payrollDate: quincenaInfo.endDate,
                                            montoUSD:    parseFloat(cestaTicketUSD) || 40,
                                            bcvRate,
                                        }
                                    );
                                }}
                                className={[
                                    "h-8 px-3 rounded-lg border flex items-center gap-1.5",
                                    "font-mono text-[12px] uppercase tracking-[0.16em] transition-colors duration-150",
                                    "border-primary-500/40 bg-primary-500/10 text-primary-500 hover:bg-primary-500/[0.16]",
                                ].join(" ")}
                            >
                                Cesta Ticket
                            </button>
                        )}

                        {/* BCV badge */}
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-light bg-surface-2">
                            <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--text-tertiary)]">BCV</span>
                            <span className="font-mono text-[12px] font-semibold tabular-nums text-foreground">
                                {bcvRate.toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                            </span>
                        </div>

                        {company && (
                            <span className="font-mono text-[12px] text-[var(--text-tertiary)] uppercase tracking-widest">
                                {company.name}
                            </span>
                        )}
                    </div>
                </div>

                {/* Table area */}
                <div className="flex-1 overflow-y-auto p-6">
                    <PayrollEmployeeTable
                        employees={employees}
                        empLoading={empLoading}
                        empError={empError}
                        onConfirm={handleConfirm}
                        earningRows={earningRows}
                        deductionRows={deductionRows}
                        bonusRows={bonusRows}
                        mondaysInMonth={mondaysInMonth}
                        bcvRate={bcvRate}
                        diasUtilidades={diasUtilNum}
                        diasBonoVacacional={diasBonoNum}
                        bonoNocturnoEnabled={bonoNocturnoEnabled}
                        diasNocturnosQuincena={diasNocturnosQuincena}
                        salarioMinimo={salarioMinimo}
                        companyName={company?.name ?? ""}
                        companyId={company?.id ?? ""}
                        companyLogoUrl={company?.logoUrl}
                        showLogoInPdf={company?.showLogoInPdf}
                        payrollDate={quincenaInfo.endDate}
                        periodStart={quincenaInfo.startDate}
                        periodLabel={quincenaInfo.label}
                        periodAlreadyConfirmed={periodAlreadyConfirmed}
                        salaryMode={salaryMode}
                    />
                </div>

            </main>

        </div>
    );
}
