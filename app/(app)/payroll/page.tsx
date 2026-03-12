"use client";

// ============================================================================
// PAYROLL CALCULATOR — page v3.0
// Quincena-aware: selects month/year + fortnight, auto-fills earning rows.
// ============================================================================

import { useState, useMemo, useCallback, useEffect } from "react";
import { accordionItemProps, BaseAccordion } from "@/src/shared/frontend/components/base-accordion";
import { calculateWeeklyFactor } from "@/src/modules/payroll/frontend/utils/payroll-helper";
import { ParamsSection, EarningsSection, DeductionsSection, BonusesSection } from "@/src/modules/payroll/frontend/components/payroll-accordion-sections";
import { PayrollEmployeeTable } from "@/src/modules/payroll/frontend/components/payroll-employee-table";
import { EarningRow, DeductionRow, BonusRow, EarningValue, DeductionValue, BonusValue } from "@/src/modules/payroll/frontend/types/payroll-types";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useEmployee } from "@/src/modules/payroll/frontend/hooks/use-employee";

// ============================================================================
// QUINCENA UTILS
// ============================================================================

type Quincena = 1 | 2;

interface QuincenaInfo {
    /** Lun–Vie count */
    weekdays:  number;
    /** Saturday count */
    saturdays: number;
    /** Sunday count */
    sundays:   number;
    /** Monday count (for weekly deduction base) */
    mondays:   number;
    /** ISO date of first day (used as payrollDate) */
    startDate: string;
    /** ISO date of last day */
    endDate:   string;
    /** Human label e.g. "1 – 15 de Marzo 2026" */
    label:     string;
}

const MONTH_NAMES = [
    "Enero","Febrero","Marzo","Abril","Mayo","Junio",
    "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

function getQuincenaInfo(year: number, month: number, q: Quincena): QuincenaInfo {
    const startDay = q === 1 ? 1 : 16;
    const endDay   = q === 1 ? 15 : new Date(year, month, 0).getDate(); // month is 1-based here

    const start = new Date(year, month - 1, startDay);
    const end   = new Date(year, month - 1, endDay);

    let weekdays = 0, saturdays = 0, sundays = 0, mondays = 0;
    const cur = new Date(start);
    while (cur <= end) {
        const wd = cur.getDay(); // 0=Sun,1=Mon,...,6=Sat
        if (wd === 0)      sundays++;
        else if (wd === 6) saturdays++;
        else               weekdays++;
        if (wd === 1)      mondays++;
        cur.setDate(cur.getDate() + 1);
    }

    const pad  = (n: number) => String(n).padStart(2, "0");
    const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

    return {
        weekdays, saturdays, sundays, mondays,
        startDate: toISO(start),
        endDate:   toISO(end),
        label: `${startDay} – ${endDay} de ${MONTH_NAMES[month-1]} ${year}`,
    };
}

// ============================================================================
// DEFAULT ROWS (quantities will be overwritten by quincena auto-fill)
// ============================================================================

let _seq = 0;
const uid = (p: string) => `${p}_${++_seq}_${Date.now()}`;

const makeDefaultEarnings = (wd: number, sat: number, sun: number): EarningRow[] => [
    { id: uid("e"), label: "Dias Normales", quantity: String(wd),  multiplier: "1.0", useDaily: true },
    { id: uid("e"), label: "Sabados",       quantity: String(sat), multiplier: "1.0", useDaily: true },
    { id: uid("e"), label: "Domingos",      quantity: String(sun), multiplier: "1.5", useDaily: true },
];

const DEFAULT_DEDUCTIONS: DeductionRow[] = [
    { id: uid("d"), label: "S.S.O",   rate: "4",   base: "weekly"  },
    { id: uid("d"), label: "R.P.E",   rate: "0.5", base: "weekly"  },
    { id: uid("d"), label: "F.A.O.V", rate: "1",   base: "monthly" },
];

const DEFAULT_BONUSES: BonusRow[] = [
    { id: uid("b"), label: "Bono Alimentacion", amount: "40.00" },
    { id: uid("b"), label: "Bono Transporte",   amount: "20.00" },
];

// ============================================================================
// MONTH / QUINCENA SELECTOR COMPONENT
// ============================================================================

interface QuincenaSelectorProps {
    year:       number;
    month:      number;
    quincena:   Quincena;
    info:       QuincenaInfo;
    onYearChange:     (y: number) => void;
    onMonthChange:    (m: number) => void;
    onQuincenaChange: (q: Quincena) => void;
    onAutoFill:       () => void;
}

const inputCls = [
    "h-8 px-2 rounded-lg border border-border-light bg-surface-1 outline-none",
    "font-mono text-[12px] text-foreground",
    "focus:ring-2 focus:ring-primary-500/10 focus:border-primary-400",
    "hover:border-border-medium transition-colors duration-150",
].join(" ");

function QuincenaSelector({
    year, month, quincena, info,
    onYearChange, onMonthChange, onQuincenaChange, onAutoFill,
}: QuincenaSelectorProps) {
    const currentYear = new Date().getFullYear();
    const years = [currentYear - 1, currentYear, currentYear + 1];

    const qBtnCls = (active: boolean) => [
        "h-8 px-4 rounded-lg font-mono text-[10px] uppercase tracking-[0.18em] border transition-colors duration-150",
        active
            ? "bg-primary-500 border-primary-600 text-white"
            : "bg-surface-1 border-border-light text-foreground hover:border-border-medium hover:bg-surface-2",
    ].join(" ");

    return (
        <div className="space-y-4">
            {/* Row 1: Month + Year */}
            <div className="flex flex-wrap items-end gap-4">
                <div className="flex flex-col gap-1.5">
                    <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-neutral-400">Mes</span>
                    <select
                        value={month}
                        onChange={(e) => onMonthChange(Number(e.target.value))}
                        className={inputCls + " w-40"}
                    >
                        {MONTH_NAMES.map((name, i) => (
                            <option key={i+1} value={i+1}>{name}</option>
                        ))}
                    </select>
                </div>

                <div className="flex flex-col gap-1.5">
                    <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-neutral-400">Año</span>
                    <select
                        value={year}
                        onChange={(e) => onYearChange(Number(e.target.value))}
                        className={inputCls + " w-24"}
                    >
                        {years.map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                </div>

                {/* Quincena toggle */}
                <div className="flex flex-col gap-1.5">
                    <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-neutral-400">Quincena</span>
                    <div className="flex gap-2">
                        <button onClick={() => onQuincenaChange(1)} className={qBtnCls(quincena === 1)}>
                            1ra &nbsp;(1–15)
                        </button>
                        <button onClick={() => onQuincenaChange(2)} className={qBtnCls(quincena === 2)}>
                            2da &nbsp;(16–fin)
                        </button>
                    </div>
                </div>
            </div>

            {/* Row 2: Summary + auto-fill button */}
            <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-border-light bg-surface-2">
                {/* Day breakdown */}
                <div className="flex items-center gap-6">
                    <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-400">Periodo</span>
                        <span className="font-mono text-[11px] font-medium text-foreground">{info.label}</span>
                    </div>
                    <div className="w-px h-8 bg-border-light" />
                    <div className="flex items-center gap-5 tabular-nums">
                        <div className="flex flex-col items-center gap-0.5">
                            <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-400">Normales</span>
                            <span className="font-mono text-[16px] font-black text-foreground">{info.weekdays}</span>
                        </div>
                        <div className="flex flex-col items-center gap-0.5">
                            <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-400">Sabados</span>
                            <span className="font-mono text-[16px] font-black text-foreground">{info.saturdays}</span>
                        </div>
                        <div className="flex flex-col items-center gap-0.5">
                            <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-400">Domingos</span>
                            <span className="font-mono text-[16px] font-black text-foreground">{info.sundays}</span>
                        </div>
                        <div className="flex flex-col items-center gap-0.5">
                            <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-400">Lunes</span>
                            <span className="font-mono text-[16px] font-black text-neutral-400">{info.mondays}</span>
                        </div>
                    </div>
                </div>

                {/* Auto-fill button */}
                <button
                    onClick={onAutoFill}
                    className={[
                        "h-8 px-4 rounded-lg flex items-center gap-2",
                        "font-mono text-[10px] uppercase tracking-[0.18em]",
                        "bg-primary-500 text-white border border-primary-600",
                        "hover:bg-primary-600 active:bg-primary-700 transition-colors duration-150",
                    ].join(" ")}
                >
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 1h4M2 4h8M1 7h10M3 10h6" />
                    </svg>
                    Rellenar dias
                </button>
            </div>
        </div>
    );
}

// ============================================================================
// PAGE
// ============================================================================

export default function PayrollCalculator() {
    const { companyId, company, companies, loading: companyLoading, selectCompany } = useCompany();
    const { employees, loading: empLoading, error: empError, upsert } = useEmployee(companyId);

    const [expandedKeys, setExpandedKeys] = useState<any>(
        new Set(["params", "earnings", "deductions", "bonuses"])
    );

    // ── Quincena state ────────────────────────────────────────────────────
    const now = new Date();
    const [selYear,     setSelYear]     = useState(now.getFullYear());
    const [selMonth,    setSelMonth]    = useState(now.getMonth() + 1); // 1-based
    const [selQuincena, setSelQuincena] = useState<Quincena>(now.getDate() <= 15 ? 1 : 2);

    const quincenaInfo = useMemo(
        () => getQuincenaInfo(selYear, selMonth, selQuincena),
        [selYear, selMonth, selQuincena]
    );

    // payrollDate = last day of quincena (used for PDF date header)
    const payrollDate = quincenaInfo.endDate;

    // ── Base params ───────────────────────────────────────────────────────
    const [exchangeRate,  setExchangeRate]  = useState("79.59");
    const [monthlySalary, setMonthlySalary] = useState("130.00");

    // ── Dynamic row lists — pre-filled with current quincena ──────────────
    const [earningRows,   setEarningRows]   = useState<EarningRow[]>(() =>
        makeDefaultEarnings(quincenaInfo.weekdays, quincenaInfo.saturdays, quincenaInfo.sundays)
    );
    const [deductionRows, setDeductionRows] = useState<DeductionRow[]>(DEFAULT_DEDUCTIONS);
    const [bonusRows,     setBonusRows]     = useState<BonusRow[]>(DEFAULT_BONUSES);

    // ── Auto-fill handler: update quantities of the first 3 earning rows ──
    const handleAutoFill = useCallback(() => {
        setEarningRows((prev) => {
            const next = [...prev];
            const newQtys = [
                String(quincenaInfo.weekdays),
                String(quincenaInfo.saturdays),
                String(quincenaInfo.sundays),
            ];
            newQtys.forEach((qty, i) => {
                if (next[i]) next[i] = { ...next[i], quantity: qty };
            });
            return next;
        });
    }, [quincenaInfo]);

    // Auto-fill whenever quincena changes (convenience UX)
    useEffect(() => {
        handleAutoFill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selYear, selMonth, selQuincena]);

    // ── Derived scalars ───────────────────────────────────────────────────
    const mondaysInMonth = quincenaInfo.mondays;
    const dailyRate      = useMemo(() => (parseFloat(monthlySalary) || 0) / 30,                 [monthlySalary]);
    const weeklyRate     = useMemo(() => calculateWeeklyFactor(parseFloat(monthlySalary) || 0), [monthlySalary]);
    const bcvRate        = useMemo(() => parseFloat(exchangeRate) || 0,                         [exchangeRate]);
    const weeklyBase     = useMemo(() => weeklyRate * mondaysInMonth,                           [weeklyRate, mondaysInMonth]);

    // ── Computed row values ───────────────────────────────────────────────
    const earningValues = useMemo<EarningValue[]>(() =>
        earningRows.map((r) => ({
            ...r,
            computed: r.useDaily
                ? (parseFloat(r.quantity) || 0) * dailyRate * (parseFloat(r.multiplier) || 1)
                : parseFloat(r.quantity) || 0,
        })), [earningRows, dailyRate]);

    const deductionValues = useMemo<DeductionValue[]>(() =>
        deductionRows.map((r) => ({
            ...r,
            computed: (r.base === "weekly" ? weeklyBase : parseFloat(monthlySalary) || 0)
                * ((parseFloat(r.rate) || 0) / 100),
        })), [deductionRows, weeklyBase, monthlySalary]);

    const bonusValues = useMemo<BonusValue[]>(() =>
        bonusRows.map((r) => ({
            ...r,
            computed: (parseFloat(r.amount) || 0) * bcvRate,
        })), [bonusRows, bcvRate]);

    const totalEarnings   = useMemo(() => earningValues.reduce((s, r)   => s + r.computed, 0), [earningValues]);
    const totalDeductions = useMemo(() => deductionValues.reduce((s, r) => s + r.computed, 0), [deductionValues]);
    const totalBonuses    = useMemo(() => bonusValues.reduce((s, r)     => s + r.computed, 0), [bonusValues]);

    // ── Earning mutators ──────────────────────────────────────────────────
    const updateEarning = useCallback((id: string, u: EarningRow) =>
        setEarningRows((rs) => rs.map((r) => r.id === id ? u : r)), []);
    const removeEarning = useCallback((id: string) =>
        setEarningRows((rs) => rs.filter((r) => r.id !== id)), []);
    const addEarning    = useCallback((b: EarningRow) =>
        setEarningRows((rs) => [...rs, b]), []);

    // ── Deduction mutators ────────────────────────────────────────────────
    const updateDeduction = useCallback((id: string, u: DeductionRow) =>
        setDeductionRows((rs) => rs.map((r) => r.id === id ? u : r)), []);
    const removeDeduction = useCallback((id: string) =>
        setDeductionRows((rs) => rs.filter((r) => r.id !== id)), []);
    const addDeduction    = useCallback((b: DeductionRow) =>
        setDeductionRows((rs) => [...rs, b]), []);

    // ── Bonus mutators ────────────────────────────────────────────────────
    const updateBonus = useCallback((id: string, u: BonusRow) =>
        setBonusRows((rs) => rs.map((r) => r.id === id ? u : r)), []);
    const removeBonus = useCallback((id: string) =>
        setBonusRows((rs) => rs.filter((r) => r.id !== id)), []);
    const addBonus    = useCallback((b: BonusRow) =>
        setBonusRows((rs) => [...rs, b]), []);

    // ── Render ────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-surface-2 p-8 font-mono">
            <div className="max-w-[1400px] mx-auto space-y-6">

                <header className="pb-4 border-b border-border-light text-foreground">
                    <nav className="text-[10px] uppercase text-neutral-400 mb-1 tracking-widest">
                        Nomina / Calculadora / v3.0
                    </nav>
                    <div className="flex items-end justify-between">
                        <h1 className="text-xl font-bold uppercase tracking-tighter">
                            Panel de Configuracion
                        </h1>
                        {companyLoading ? (
                            <span className="font-mono text-[10px] text-neutral-400 uppercase tracking-widest animate-pulse">
                                Cargando empresa...
                            </span>
                        ) : companies.length > 1 ? (
                            <select
                                value={companyId ?? ""}
                                onChange={(e) => selectCompany(e.target.value)}
                                className={[
                                    "h-8 px-3 rounded-lg border border-border-light bg-surface-1",
                                    "hover:border-border-medium focus:border-primary-400 focus:ring-2 focus:ring-primary-500/10",
                                    "font-mono text-[10px] uppercase tracking-[0.18em] text-foreground",
                                    "outline-none transition-colors duration-150",
                                ].join(" ")}
                            >
                                {companies.map((c) => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        ) : company ? (
                            <span className="font-mono text-[10px] text-neutral-400 uppercase tracking-widest">
                                {company.name}
                            </span>
                        ) : null}
                    </div>
                </header>

                <BaseAccordion.Root selectedKeys={expandedKeys} onSelectionChange={setExpandedKeys}>

                    <BaseAccordion.Item key="params"
                        {...accordionItemProps({ title: "01. Parametros Generales", subtitle: "Quincena, tasa BCV y salario base" })}
                    >
                        <div className="space-y-6">
                            <QuincenaSelector
                                year={selYear}
                                month={selMonth}
                                quincena={selQuincena}
                                info={quincenaInfo}
                                onYearChange={setSelYear}
                                onMonthChange={setSelMonth}
                                onQuincenaChange={setSelQuincena}
                                onAutoFill={handleAutoFill}
                            />

                            <ParamsSection
                                payrollDate={payrollDate}
                                exchangeRate={exchangeRate}
                                monthlySalary={monthlySalary}
                                dailyRate={dailyRate}
                                weeklyRate={weeklyRate}
                                mondaysInMonth={mondaysInMonth}
                                onDateChange={() => {}}
                                onExchangeRateChange={setExchangeRate}
                                onMonthlySalaryChange={setMonthlySalary}
                            />
                        </div>
                    </BaseAccordion.Item>

                    <BaseAccordion.Item key="earnings"
                        {...accordionItemProps({ title: "02. Asignaciones", subtitle: `${quincenaInfo.weekdays}d norm / ${quincenaInfo.saturdays}d sab / ${quincenaInfo.sundays}d dom — auto-calculado` })}
                    >
                        <EarningsSection
                            rows={earningRows}
                            values={earningValues}
                            total={totalEarnings}
                            dailyRate={dailyRate}
                            weeklyRate={weeklyRate}
                            mondaysInMonth={mondaysInMonth}
                            onUpdate={updateEarning}
                            onRemove={removeEarning}
                            onAdd={addEarning}
                        />
                    </BaseAccordion.Item>

                    <BaseAccordion.Item key="deductions"
                        {...accordionItemProps({ title: "03. Deducciones", subtitle: "Configuracion de retenciones" })}
                    >
                        <DeductionsSection
                            rows={deductionRows}
                            values={deductionValues}
                            total={totalDeductions}
                            weeklyBase={weeklyBase}
                            weeklyRate={weeklyRate}
                            mondaysInMonth={mondaysInMonth}
                            monthlySalary={monthlySalary}
                            onUpdate={updateDeduction}
                            onRemove={removeDeduction}
                            onAdd={addDeduction}
                        />
                    </BaseAccordion.Item>

                    <BaseAccordion.Item key="bonuses"
                        {...accordionItemProps({ title: "04. Bonos y Extras", subtitle: "Pagos indexados a la tasa BCV" })}
                    >
                        <BonusesSection
                            rows={bonusRows}
                            values={bonusValues}
                            total={totalBonuses}
                            bcvRate={bcvRate}
                            onUpdate={updateBonus}
                            onRemove={removeBonus}
                            onAdd={addBonus}
                        />
                    </BaseAccordion.Item>

                </BaseAccordion.Root>

                <PayrollEmployeeTable
                    employees={employees}
                    empLoading={empLoading}
                    empError={empError}
                    onUpsert={upsert}
                    earningRows={earningRows}
                    deductionRows={deductionRows}
                    bonusRows={bonusRows}
                    mondaysInMonth={mondaysInMonth}
                    bcvRate={bcvRate}
                    companyName={company?.name ?? ""}
                    companyId={company?.id ?? ""}
                    payrollDate={payrollDate}
                />

            </div>
        </div>
    );
}
