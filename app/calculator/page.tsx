"use client";

import { BaseTable, Column } from "@/src/components/base-table";
import { BaseButton } from "@/src/components/base-button";
import { useState, useMemo, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

// ============================================================================
// TYPES
// ============================================================================

export type PayPeriod = "weekly" | "biweekly" | "monthly";
export type Fortnight = "first" | "second"; // IQ / IIQ

/** Custom concept added by the user — extra assignment or deduction */
export interface CustomConcept {
    id:        string;
    label:     string;
    amount:    number;   // Bs. per period (fixed)
    type:      "assignment" | "deduction";
    /** If true, excluded from taxable base (only applies to assignments) */
    nonSalary?: boolean;
}

export interface Employee {
    id:              string;
    idNumber:        string;   // cédula
    fullName:        string;
    position:        string;   // cargo
    monthlySalary:   number;   // Bs. — base for daily salary calculation
    foodBonus:       number;   // Bs./month — BSEA, non-salary
    transportBonus:  number;   // Bs./month — non-salary
    personalBonus:   number;   // Bs./month — salary component
    status:          "active" | "inactive" | "vacation";
    extraConcepts?:  CustomConcept[];
}

/** Variable inputs for the period */
export interface PeriodData {
    workdays:            number;  // weekday working days in the period
    saturdays:           number;  // saturday count
    sundays:             number;  // sunday count
    holidays:            number;  // public holidays (feriados)
    overtimeDay:         number;  // daytime overtime hours (7am–7pm)
    overtimeNight:       number;  // nighttime overtime hours (7pm–7am)
    absences:            number;  // absent days (unpaid)
}

/** Active deductions config */
export interface DeductionConfig {
    sso:              boolean;   // 4%
    spf:              boolean;   // 0.5%
    faov:             boolean;   // 1%
    inces:            boolean;   // 0.5%
    absenceDeduction: boolean;
}

/**
 * Multipliers for rest days and overtime surcharges.
 * These default to Venezuelan legal minimums but are user-configurable.
 */
export interface PayRates {
    /** Saturday factor over daily salary (default: 1.5 per LOTTT Art. 173) */
    saturdayMultiplier:  number;
    /** Sunday factor over daily salary (default: 1.5 per LOTTT Art. 173) */
    sundayMultiplier:    number;
    /** Holiday surcharge factor over daily salary (default: 1.0 extra = double pay) */
    holidayMultiplier:   number;
    /** Daytime OT surcharge rate on top of base hour (default: 0.25 = 25%) */
    overtimeDaySurcharge:   number;
    /** Nighttime OT surcharge rate on top of base hour (default: 0.75 = 75%) */
    overtimeNightSurcharge: number;
}

export interface PayrollResult {
    employee:    Employee;
    period:      PayPeriod;
    fortnight?:  Fortnight;
    from:        string;
    to:          string;
    // ── Salary components (taxable base) ─────────────────────────────────────
    basePay:           number;  // workdays × daily salary
    saturdayPay:       number;  // saturdays × daily salary × multiplier
    sundayPay:         number;  // sundays × daily salary × multiplier
    holidayPay:        number;  // holidays × daily salary × multiplier
    overtimeDayPay:    number;  // daytime OT hours × hourly rate × (1 + surcharge)
    overtimeNightPay:  number;  // nighttime OT hours × hourly rate × (1 + surcharge)
    personalBonusProp: number;  // personal bonus prorated to period
    salarySubtotal:    number;  // sum of all salary components
    // ── Non-salary components (excluded from taxable base) ───────────────────
    foodBonusProp:      number;
    transportBonusProp: number;
    // ── Custom concepts ───────────────────────────────────────────────────────
    customAssignments: { label: string; amount: number; isSalary: boolean }[];
    totalAssignments:  number;
    // ── Legal deductions ──────────────────────────────────────────────────────
    sso:              number;
    spf:              number;
    faov:             number;
    inces:            number;
    absenceDiscount:  number;
    // ── Custom deductions ─────────────────────────────────────────────────────
    customDeductions: { label: string; amount: number }[];
    totalDeductions:  number;
    // ── Net ───────────────────────────────────────────────────────────────────
    netPay:    number;
    netPayUSD: number;
}

// ============================================================================
// LEGAL CONSTANTS — LOTTT, Ley del Seguro Social, INCES
// ============================================================================

/** LOTTT Art. 104 — fixed divisor for daily salary regardless of month length */
const LEGAL_DAYS_PER_MONTH = 30;

/** LOTTT Art. 173 — standard daytime shift: 8 hours */
const DAILY_HOURS = 8;

/** Default legal minimum rates — users can override these via PayRates */
const DEFAULT_PAY_RATES: PayRates = {
    saturdayMultiplier:     1.5,  // LOTTT Art. 173 — descanso semanal compensatorio
    sundayMultiplier:       1.5,  // LOTTT Art. 173 — descanso semanal obligatorio
    holidayMultiplier:      1.0,  // LOTTT Art. 192 — recargo adicional (doble en total)
    overtimeDaySurcharge:   0.25, // LOTTT Art. 118 — recargo mínimo 25%
    overtimeNightSurcharge: 0.75, // LOTTT Art. 118 — recargo mínimo 75%
};

const LEGAL_RATES = {
    sso:   0.04,   // Ley del Seguro Social — trabajador 4%
    spf:   0.005,  // Ley del Régimen Prestacional de Empleo — 0.5%
    faov:  0.01,   // Ley del Régimen Prestacional de Vivienda — 1%
    inces: 0.005,  // Ley del INCES — 0.5%
} as const;

const PERIOD_DAYS: Record<PayPeriod, number> = {
    weekly: 7, biweekly: 15, monthly: 30,
};

const PERIOD_LABEL: Record<PayPeriod, string> = {
    weekly: "Weekly", biweekly: "Biweekly", monthly: "Monthly",
};

// ============================================================================
// PAYROLL ENGINE
// ============================================================================

export const calculatePayroll = (
    employee:  Employee,
    data:      PeriodData,
    config: {
        period:    PayPeriod;
        fortnight?: Fortnight;
        from:      string;
        to:        string;
        bcvRate:   number;
        deductions: DeductionConfig;
        rates?:    Partial<PayRates>;
        globalConcepts?: CustomConcept[];
    }
): PayrollResult => {
    const { period, bcvRate, deductions } = config;
    const rates: PayRates = { ...DEFAULT_PAY_RATES, ...config.rates };

    const periodDays   = PERIOD_DAYS[period];
    const periodFactor = periodDays / LEGAL_DAYS_PER_MONTH;

    // Daily salary — LOTTT Art. 104
    const dailySalary  = employee.monthlySalary / LEGAL_DAYS_PER_MONTH;
    const hourlyRate   = dailySalary / DAILY_HOURS;

    // ── Salary components ────────────────────────────────────────────────────

    // Base pay: effective workdays (minus absences) × daily salary
    const effectiveDays = Math.max(0, data.workdays - data.absences);
    const basePay       = effectiveDays * dailySalary;

    // Saturday pay: LOTTT Art. 173 — compensatory rest day
    const saturdayPay = data.saturdays * dailySalary * rates.saturdayMultiplier;

    // Sunday pay: LOTTT Art. 173 — mandatory weekly rest
    const sundayPay   = data.sundays   * dailySalary * rates.sundayMultiplier;

    // Holiday pay: LOTTT Art. 192 — surcharge on top of normal day
    const holidayPay  = data.holidays  * dailySalary * rates.holidayMultiplier;

    // Daytime OT: LOTTT Art. 118 — hourly rate × (1 + surcharge)
    const overtimeDayPay   = data.overtimeDay   * hourlyRate * (1 + rates.overtimeDaySurcharge);

    // Nighttime OT: LOTTT Art. 118 — hourly rate × (1 + surcharge)
    const overtimeNightPay = data.overtimeNight * hourlyRate * (1 + rates.overtimeNightSurcharge);

    // Personal bonus: salary component, prorated to period
    const personalBonusProp = employee.personalBonus * periodFactor;

    const salarySubtotal =
        basePay + saturdayPay + sundayPay + holidayPay +
        overtimeDayPay + overtimeNightPay + personalBonusProp;

    // ── Non-salary components ────────────────────────────────────────────────

    // BSEA (Bono Socio-Económico de Alimentación): non-salary, prorated
    const foodBonusProp      = employee.foodBonus      * periodFactor;
    const transportBonusProp = employee.transportBonus * periodFactor;

    // ── Custom concepts ───────────────────────────────────────────────────────
    const allConcepts = [
        ...(config.globalConcepts  ?? []),
        ...(employee.extraConcepts ?? []),
    ];

    const customAssignments = allConcepts
        .filter(c => c.type === "assignment")
        .map(c => ({ label: c.label, amount: c.amount, isSalary: !(c.nonSalary ?? false) }));

    const customDeductions = allConcepts
        .filter(c => c.type === "deduction")
        .map(c => ({ label: c.label, amount: c.amount }));

    const customSalaryBase    = customAssignments.filter(c => c.isSalary).reduce((a, c) => a + c.amount, 0);
    const totalCustomAssigned = customAssignments.reduce((a, c) => a + c.amount, 0);
    const totalCustomDeducted = customDeductions.reduce((a, c) => a + c.amount, 0);

    const totalAssignments =
        salarySubtotal + foodBonusProp + transportBonusProp + totalCustomAssigned;

    // ── Legal deductions ──────────────────────────────────────────────────────
    // Taxable base: salary components only — non-salary bonuses are excluded
    const taxableBase = salarySubtotal + customSalaryBase;

    const ssoDeduction   = deductions.sso   ? taxableBase * LEGAL_RATES.sso   : 0;
    const spfDeduction   = deductions.spf   ? taxableBase * LEGAL_RATES.spf   : 0;
    const faovDeduction  = deductions.faov  ? taxableBase * LEGAL_RATES.faov  : 0;
    const incesDeduction = deductions.inces ? taxableBase * LEGAL_RATES.inces : 0;
    const absenceDiscount = deductions.absenceDeduction ? data.absences * dailySalary : 0;

    const totalDeductions =
        ssoDeduction + spfDeduction + faovDeduction + incesDeduction +
        absenceDiscount + totalCustomDeducted;

    const netPay    = totalAssignments - totalDeductions;
    const netPayUSD = bcvRate > 0 ? netPay / bcvRate : 0;

    return {
        employee,
        period,
        fortnight: config.fortnight,
        from:      config.from,
        to:        config.to,
        basePay,
        saturdayPay,
        sundayPay,
        holidayPay,
        overtimeDayPay,
        overtimeNightPay,
        personalBonusProp,
        salarySubtotal,
        foodBonusProp,
        transportBonusProp,
        customAssignments,
        totalAssignments,
        sso:   ssoDeduction,
        spf:   spfDeduction,
        faov:  faovDeduction,
        inces: incesDeduction,
        absenceDiscount,
        customDeductions,
        totalDeductions,
        netPay,
        netPayUSD,
    };
};

// ============================================================================
// SAMPLE DATA
// ============================================================================

const SAMPLE_EMPLOYEES: Employee[] = [
    { id:"1", idNumber:"V-19998667", fullName:"PEREZ APONTE KAREN YALINEY",    position:"AUXILIAR",   monthlySalary:130, foodBonus:6566.175, transportBonus:994.875, personalBonus:1989.75, status:"active"   },
    { id:"2", idNumber:"V-12983113", fullName:"BLANCO FERRER MARIA ELISA",     position:"AUXILIAR",   monthlySalary:130, foodBonus:6566.175, transportBonus:994.875, personalBonus:1989.75, status:"active"   },
    { id:"3", idNumber:"V-10203001", fullName:"DA SILVA CRAVO AFRICA ZUZETTY", position:"AUXILIAR",   monthlySalary:130, foodBonus:6566.175, transportBonus:994.875, personalBonus:1989.75, status:"active"   },
    { id:"4", idNumber:"V-20190242", fullName:"NIETO CHIRINOS GERALDINE",      position:"AUXILIAR",   monthlySalary:130, foodBonus:6566.175, transportBonus:994.875, personalBonus:1989.75, status:"inactive" },
    { id:"5", idNumber:"V-15834271", fullName:"PORRO ROMERO EDIBERTH ELLENA",  position:"AUXILIAR",   monthlySalary:130, foodBonus:6566.175, transportBonus:994.875, personalBonus:1989.75, status:"active"   },
    { id:"6", idNumber:"V-15758731", fullName:"HENRIQUE ANDRADE KELLYS",       position:"AUXILIAR",   monthlySalary:130, foodBonus:6566.175, transportBonus:994.875, personalBonus:1989.75, status:"vacation" },
    { id:"7", idNumber:"V-16085730", fullName:"MUJICA CANU JENNIFER",          position:"PHARMACIST", monthlySalary:200, foodBonus:6566.175, transportBonus:994.875, personalBonus:3000,    status:"active"   },
];

// ============================================================================
// HELPERS
// ============================================================================

const fmt  = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const defaultPeriodData = (p: PayPeriod): PeriodData => ({
    weekly:    { workdays:5,  saturdays:1, sundays:1, holidays:0, overtimeDay:0, overtimeNight:0, absences:0 },
    biweekly:  { workdays:11, saturdays:2, sundays:2, holidays:0, overtimeDay:0, overtimeNight:0, absences:0 },
    monthly:   { workdays:22, saturdays:4, sundays:4, holidays:0, overtimeDay:0, overtimeNight:0, absences:0 },
}[p]);

const getPeriodDates = (period: PayPeriod, fortnight: Fortnight): [string, string] => {
    if (period === "monthly")                          return ["2025-04-01", "2025-04-30"];
    if (period === "weekly")                           return ["2025-04-01", "2025-04-07"];
    if (period === "biweekly" && fortnight === "first") return ["2025-04-01", "2025-04-15"];
    return ["2025-04-16", "2025-04-30"];
};

let _uid = 0;
const uid = () => `c${++_uid}`;

// ============================================================================
// UI — ATOMS
// ============================================================================

const Sep = () => <span className="hidden sm:block w-px h-7 bg-border-light flex-shrink-0" />;

const SLabel = ({ children }: { children: React.ReactNode }) => (
    <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-neutral-400 dark:text-neutral-600 block mb-1">
        {children}
    </span>
);

const Stat = ({ label, value, sub, bold }: { label: string; value: string; sub?: string; bold?: boolean }) => (
    <div className="flex flex-col gap-0.5">
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-neutral-400 dark:text-neutral-600">{label}</span>
        <span className={["font-mono text-[13px] tabular-nums leading-none", bold ? "font-bold text-foreground" : "font-medium text-neutral-500 dark:text-neutral-400"].join(" ")}>
            {value}
        </span>
        {sub && <span className="font-mono text-[10px] text-neutral-400 tabular-nums">{sub}</span>}
    </div>
);

const Toggle = ({ label, rate, checked, onChange }: { label: string; rate: string; checked: boolean; onChange: (v: boolean) => void }) => (
    <label className="flex items-center gap-2 cursor-pointer select-none">
        <button type="button" onClick={() => onChange(!checked)}
            className={["w-7 h-[15px] rounded-full relative transition-colors duration-200 flex-shrink-0",
                checked ? "bg-primary-500" : "bg-neutral-200 dark:bg-neutral-700"].join(" ")}>
            <span className={["absolute top-[2px] w-[11px] h-[11px] rounded-full bg-white shadow-sm transition-transform duration-200",
                checked ? "translate-x-[14px]" : "translate-x-[2px]"].join(" ")} />
        </button>
        <span className="font-mono text-[11px] text-foreground flex-1">{label}</span>
        <span className="font-mono text-[10px] text-neutral-400">{rate}</span>
    </label>
);

const NumInput = ({ label, value, onChange, min = 0, max, step = 1, unit }: {
    label: string; value: number; onChange: (v: number) => void;
    min?: number; max?: number; step?: number; unit?: string;
}) => (
    <div className="flex flex-col gap-1">
        <SLabel>{label}{unit ? ` (${unit})` : ""}</SLabel>
        <input
            type="number" min={min} max={max} step={step} value={value}
            onChange={e => onChange(Math.max(min, Number(e.target.value)))}
            className={[
                "h-8 w-full px-2.5 rounded-lg",
                "font-mono text-[12px] tabular-nums text-foreground",
                "bg-surface-1 border border-border-light",
                "focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-500/10",
                "transition-all duration-150",
            ].join(" ")}
        />
    </div>
);

const TabBtn = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
    <button onClick={onPress} className={[
        "px-4 h-8 rounded-md font-mono text-[11px] uppercase tracking-[0.12em] border transition-colors duration-150",
        active
            ? "bg-primary-500 border-primary-500 text-white font-semibold"
            : "bg-surface-1 border-border-light text-neutral-500 hover:border-border-medium hover:text-foreground",
    ].join(" ")}>{label}</button>
);

const TabBtnSm = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
    <button onClick={onPress} className={[
        "px-3 h-7 rounded-md font-mono text-[10px] uppercase tracking-[0.12em] border transition-colors duration-150",
        active
            ? "bg-foreground border-foreground text-background"
            : "bg-surface-1 border-border-light text-neutral-400 hover:border-border-medium hover:text-foreground",
    ].join(" ")}>{label}</button>
);

const StatusBadge = ({ status }: { status: Employee["status"] }) => {
    const cfg = {
        active:   { label: "Active",   cls: "text-success bg-success/8 border-success/20" },
        inactive: { label: "Inactive", cls: "text-neutral-500 bg-neutral-100 dark:bg-neutral-800 border-border-light" },
        vacation: { label: "Vacation", cls: "text-warning bg-warning/8 border-warning/20" },
    };
    const { label, cls } = cfg[status];
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded border font-mono text-[10px] uppercase tracking-[0.12em] font-semibold ${cls}`}>
            {label}
        </span>
    );
};

// ── Period days panel ─────────────────────────────────────────────────────────
const PeriodDataPanel = ({ data, onChange, period }: {
    data: PeriodData; onChange: (d: PeriodData) => void; period: PayPeriod;
}) => {
    const max = PERIOD_DAYS[period];
    return (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <NumInput label="Workdays"     value={data.workdays}      onChange={v => onChange({ ...data, workdays: v })}      max={max} />
            <NumInput label="Saturdays"    value={data.saturdays}     onChange={v => onChange({ ...data, saturdays: v })}     max={max} />
            <NumInput label="Sundays"      value={data.sundays}       onChange={v => onChange({ ...data, sundays: v })}       max={max} />
            <NumInput label="Holidays"     value={data.holidays}      onChange={v => onChange({ ...data, holidays: v })}      max={max} />
            <NumInput label="Day OT" unit="h"   value={data.overtimeDay}    onChange={v => onChange({ ...data, overtimeDay: v })}    />
            <NumInput label="Night OT" unit="h" value={data.overtimeNight}  onChange={v => onChange({ ...data, overtimeNight: v })}  />
            <NumInput label="Absences"     value={data.absences}      onChange={v => onChange({ ...data, absences: v })}      max={max} />
        </div>
    );
};

// ── Pay rates panel ───────────────────────────────────────────────────────────
const PayRatesPanel = ({ rates, onChange }: {
    rates: PayRates; onChange: (r: PayRates) => void;
}) => {
    const RateInput = ({ label, field, isPercent = false }: {
        label: string; field: keyof PayRates; isPercent?: boolean;
    }) => (
        <div className="flex flex-col gap-1">
            <SLabel>{label}</SLabel>
            <div className="relative flex items-center">
                <input
                    type="number" min={0} step={0.05} value={isPercent ? rates[field] * 100 : rates[field]}
                    onChange={e => onChange({ ...rates, [field]: isPercent ? Number(e.target.value) / 100 : Number(e.target.value) })}
                    className={[
                        "h-8 w-full px-2.5 rounded-lg pr-7",
                        "font-mono text-[12px] tabular-nums text-foreground",
                        "bg-surface-1 border border-border-light",
                        "focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-500/10",
                        "transition-all duration-150",
                    ].join(" ")}
                />
                <span className="absolute right-2.5 font-mono text-[10px] text-neutral-400 pointer-events-none select-none">
                    {isPercent ? "%" : "×"}
                </span>
            </div>
        </div>
    );

    return (
        <div className="space-y-3">
            <p className="font-mono text-[11px] text-neutral-500">
                These multipliers default to Venezuelan legal minimums (LOTTT Art. 118 & 173). Adjust only if your company applies higher rates.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <RateInput label="Saturday ×"     field="saturdayMultiplier"     />
                <RateInput label="Sunday ×"       field="sundayMultiplier"        />
                <RateInput label="Holiday ×"      field="holidayMultiplier"       />
                <RateInput label="Day OT surplus"   field="overtimeDaySurcharge"   isPercent />
                <RateInput label="Night OT surplus" field="overtimeNightSurcharge" isPercent />
            </div>
        </div>
    );
};

// ── Custom concepts panel ─────────────────────────────────────────────────────
const CustomConceptsPanel = ({ concepts, onChange }: {
    concepts: CustomConcept[]; onChange: (c: CustomConcept[]) => void;
}) => {
    const add = (type: "assignment" | "deduction") =>
        onChange([...concepts, {
            id: uid(),
            label: type === "assignment" ? "New assignment" : "New deduction",
            amount: 0, type, nonSalary: false,
        }]);
    const remove = (id: string) => onChange(concepts.filter(c => c.id !== id));
    const update = (id: string, patch: Partial<CustomConcept>) =>
        onChange(concepts.map(c => c.id === id ? { ...c, ...patch } : c));

    const assignments = concepts.filter(c => c.type === "assignment");
    const deductions  = concepts.filter(c => c.type === "deduction");

    const inputCls = [
        "h-7 px-2 rounded-md font-mono text-[11px] text-foreground",
        "bg-surface-1 border border-border-light",
        "focus:outline-none focus:border-primary-400 transition-colors duration-150",
    ].join(" ");

    const Row = ({ c }: { c: CustomConcept }) => (
        <div className="flex items-center gap-2">
            <input value={c.label} onChange={e => update(c.id, { label: e.target.value })}
                placeholder="Label" className={`flex-1 ${inputCls}`} />
            <div className="relative flex items-center flex-shrink-0">
                <span className="absolute left-2 font-mono text-[10px] text-neutral-400 pointer-events-none select-none">Bs.</span>
                <input type="number" min={0} step={0.01} value={c.amount}
                    onChange={e => update(c.id, { amount: Number(e.target.value) })}
                    className={`w-28 pl-7 pr-2 ${inputCls}`} />
            </div>
            {c.type === "assignment" && (
                <label className="flex items-center gap-1 cursor-pointer flex-shrink-0">
                    <input type="checkbox" checked={!c.nonSalary}
                        onChange={e => update(c.id, { nonSalary: !e.target.checked })}
                        className="accent-primary-500 w-3 h-3" />
                    <span className="font-mono text-[9px] uppercase tracking-wide text-neutral-400">Salary</span>
                </label>
            )}
            <button onClick={() => remove(c.id)}
                className="w-6 h-6 flex items-center justify-center rounded text-neutral-400 hover:text-error hover:bg-error/8 transition-colors flex-shrink-0">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M1 1l8 8M9 1L1 9" />
                </svg>
            </button>
        </div>
    );

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <SLabel>Extra assignments</SLabel>
                    <button onClick={() => add("assignment")}
                        className="font-mono text-[9px] uppercase tracking-wide text-primary-500 hover:text-primary-600 transition-colors">
                        + Add
                    </button>
                </div>
                {assignments.length === 0
                    ? <p className="font-mono text-[11px] text-neutral-400 italic">No extra assignments</p>
                    : assignments.map(c => <Row key={c.id} c={c} />)
                }
            </div>
            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <SLabel>Extra deductions</SLabel>
                    <button onClick={() => add("deduction")}
                        className="font-mono text-[9px] uppercase tracking-wide text-error/70 hover:text-error transition-colors">
                        + Add
                    </button>
                </div>
                {deductions.length === 0
                    ? <p className="font-mono text-[11px] text-neutral-400 italic">No extra deductions</p>
                    : deductions.map(c => <Row key={c.id} c={c} />)
                }
            </div>
        </div>
    );
};

// ── Collapsible section ───────────────────────────────────────────────────────
const Collapsible = ({ label, children, defaultOpen = false }: {
    label: string; children: React.ReactNode; defaultOpen?: boolean;
}) => {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="bg-surface-1 border border-border-light rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,.04)]">
            <button onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-2 transition-colors duration-150">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500">{label}</span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
                    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
                    className={`text-neutral-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
                    <path d="M2 4.5L6 8L10 4.5" />
                </svg>
            </button>
            {open && (
                <div className="px-4 pb-4 border-t border-border-light pt-3">
                    {children}
                </div>
            )}
        </div>
    );
};

// ============================================================================
// PAGE
// ============================================================================

export default function PayrollCalculatorPage() {
    const router       = useRouter();
    const pathname     = usePathname();
    const searchParams = useSearchParams();

    // ── URL sync ──────────────────────────────────────────────────────────────
    const searchValue = searchParams.get("q") ?? "";
    const searchCols  = useMemo(() => {
        const raw = searchParams.get("cols");
        return raw ? new Set<string | number>(raw.split(",").filter(Boolean)) : new Set<string | number>();
    }, [searchParams]);
    const updateParams = useCallback((overrides: Record<string, string | null>) => {
        const params = new URLSearchParams(searchParams.toString());
        for (const [k, v] of Object.entries(overrides)) { if (!v) params.delete(k); else params.set(k, v); }
        router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname, { scroll: false });
    }, [searchParams, router, pathname]);
    const handleSearchChange = useCallback((v: string) => updateParams({ q: v }), [updateParams]);
    const handleColsChange   = useCallback(
        (c: Set<string | number>) => updateParams({ cols: Array.from(c).join(",") || null }),
        [updateParams]
    );

    // ── State ─────────────────────────────────────────────────────────────────
    const [period,       setPeriod]       = useState<PayPeriod>("biweekly");
    const [fortnight,    setFortnight]    = useState<Fortnight>("first");
    const [bcvRate,      setBcvRate]      = useState(86.85);
    const [periodData,   setPeriodData]   = useState<PeriodData>(defaultPeriodData("biweekly"));
    const [payRates,     setPayRates]     = useState<PayRates>(DEFAULT_PAY_RATES);
    const [globalConcepts, setGlobalConcepts] = useState<CustomConcept[]>([]);
    const [selectedKeys, setSelectedKeys] = useState<Set<string | number>>(new Set());

    const [deductions, setDeductions] = useState<DeductionConfig>({
        sso: true, spf: true, faov: true, inces: false, absenceDeduction: true,
    });

    // ── Sort — using a flat key on the flattened row ──────────────────────────
    // We flatten results for sort/display so useSort works on direct keys
    const { sortDescriptor, setSortDescriptor, sortedData } =
        BaseTable.useSort<PayrollResult & { _name: string; _id: string }>("_name");

    // ── Calculation ───────────────────────────────────────────────────────────
    const results = useMemo<(PayrollResult & { _name: string; _id: string })[]>(() => {
        const [from, to] = getPeriodDates(period, fortnight);
        return SAMPLE_EMPLOYEES
            .filter(e => e.status !== "inactive")
            .map(emp => {
                const result = calculatePayroll(emp, periodData, {
                    period,
                    fortnight: period === "biweekly" ? fortnight : undefined,
                    from, to, bcvRate, deductions,
                    rates: payRates,
                    globalConcepts,
                });
                return {
                    ...result,
                    // Flat sortable/searchable keys
                    _name: emp.fullName,
                    _id:   emp.idNumber,
                };
            });
    }, [period, fortnight, periodData, bcvRate, deductions, payRates, globalConcepts]);

    const sorted = useMemo(() => sortedData(results), [sortedData, results]);

    // ── Totals ────────────────────────────────────────────────────────────────
    const totals = useMemo(() => ({
        count:        results.length,
        assignments:  results.reduce((a, r) => a + r.totalAssignments, 0),
        deductions:   results.reduce((a, r) => a + r.totalDeductions,  0),
        netPay:       results.reduce((a, r) => a + r.netPay,           0),
        netPayUSD:    results.reduce((a, r) => a + r.netPayUSD,        0),
    }), [results]);

    // ── Columns ───────────────────────────────────────────────────────────────
    type ResultRow = PayrollResult & { _name: string; _id: string };

    const columns: Column<ResultRow>[] = useMemo(() => [
        {
            key: "_name", label: "Employee", sortable: true, searchable: true,
            render: (_, r) => (
                <div className="flex flex-col min-w-0">
                    <span className="font-mono text-[12px] font-semibold text-foreground truncate leading-none">
                        {r.employee.fullName}
                    </span>
                    <span className="font-mono text-[10px] text-neutral-400 uppercase tracking-wider mt-[3px]">
                        {r.employee.position}
                    </span>
                </div>
            ),
        },
        {
            key: "_id", label: "ID", sortable: true, searchable: true, width: 136,
            render: (_, r) => (
                <span className="font-mono text-[12px] text-neutral-500 tabular-nums tracking-wide">
                    {r.employee.idNumber}
                </span>
            ),
        },
        {
            key: "salarySubtotal", label: "Salary", align: "end", sortable: true,
            render: v => <span className="font-mono text-[12px] text-neutral-600 dark:text-neutral-400 tabular-nums">{fmt(Number(v))}</span>,
        },
        {
            key: "foodBonusProp", label: "BSEA", align: "end", sortable: true,
            render: v => <span className="font-mono text-[12px] text-neutral-600 dark:text-neutral-400 tabular-nums">{fmt(Number(v))}</span>,
        },
        {
            key: "totalAssignments", label: "Total assign.", align: "end", sortable: true,
            render: v => <span className="font-mono text-[12px] text-neutral-600 dark:text-neutral-400 tabular-nums">{fmt(Number(v))}</span>,
        },
        {
            key: "totalDeductions", label: "Deductions", align: "end", sortable: true,
            render: v => <span className="font-mono text-[12px] text-error/70 tabular-nums">− {fmt(Number(v))}</span>,
        },
        {
            key: "netPay", label: "Net Bs.", align: "end", sortable: true,
            render: v => <span className="font-mono text-[13px] font-bold text-foreground tabular-nums">{fmt(Number(v))}</span>,
        },
        {
            key: "netPayUSD", label: "Net $", align: "end", sortable: true,
            render: v => <span className="font-mono text-[12px] text-neutral-500 tabular-nums">$ {fmt(Number(v))}</span>,
        },
        {
            key: "employee", label: "Status", align: "center",
            render: (_, r) => <StatusBadge status={r.employee.status} />,
        },
    ], []);

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-background px-6 py-8">
            <div className="max-w-7xl mx-auto space-y-4">

                {/* HEADER */}
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-1">
                    <div className="space-y-1">
                        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-neutral-400 dark:text-neutral-600">
                            Human Resources &nbsp;/&nbsp; Payroll
                        </p>
                        <h1 className="font-mono text-xl font-bold text-foreground leading-none">
                            Payroll Calculator
                        </h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <BaseButton.Root variant="outline" size="sm">Export</BaseButton.Root>
                        <BaseButton.Root variant="primary" size="sm">+ Employee</BaseButton.Root>
                    </div>
                </div>

                {/* MAIN CONTROLS */}
                <div className={[
                    "flex flex-wrap gap-x-5 gap-y-4 items-start",
                    "px-4 py-4 rounded-xl",
                    "bg-surface-1 border border-border-light",
                    "shadow-[0_1px_2px_rgba(0,0,0,.04)]",
                ].join(" ")}>

                    {/* Period type */}
                    <div className="flex flex-col gap-1.5">
                        <SLabel>Pay period</SLabel>
                        <div className="flex gap-1.5">
                            {(["weekly", "biweekly", "monthly"] as PayPeriod[]).map(p => (
                                <TabBtn key={p} label={PERIOD_LABEL[p]} active={period === p}
                                    onPress={() => { setPeriod(p); setPeriodData(defaultPeriodData(p)); }} />
                            ))}
                        </div>
                    </div>

                    {period === "biweekly" && (
                        <div className="flex flex-col gap-1.5">
                            <SLabel>Fortnight</SLabel>
                            <div className="flex gap-1.5">
                                <TabBtnSm label="IQ"  active={fortnight === "first"}  onPress={() => setFortnight("first")}  />
                                <TabBtnSm label="IIQ" active={fortnight === "second"} onPress={() => setFortnight("second")} />
                            </div>
                        </div>
                    )}

                    <Sep />

                    {/* BCV rate */}
                    <div className="flex flex-col gap-1.5 w-32">
                        <SLabel>BCV rate (Bs./$)</SLabel>
                        <input type="number" step="0.01" min="1" value={bcvRate}
                            onChange={e => setBcvRate(Number(e.target.value))}
                            className={[
                                "h-8 px-2.5 rounded-lg w-full",
                                "font-mono text-[12px] tabular-nums text-foreground",
                                "bg-surface-1 border border-border-light",
                                "focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-500/10",
                                "transition-all duration-150",
                            ].join(" ")} />
                    </div>

                    <Sep />

                    {/* Deductions */}
                    <div className="flex flex-col gap-1.5 flex-1 min-w-[240px]">
                        <SLabel>Legal deductions</SLabel>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-1.5">
                            <Toggle label="SSO"       rate="4%"   checked={deductions.sso}              onChange={v => setDeductions(d => ({ ...d, sso: v }))}              />
                            <Toggle label="SPF"       rate="0.5%" checked={deductions.spf}              onChange={v => setDeductions(d => ({ ...d, spf: v }))}              />
                            <Toggle label="FAOV"      rate="1%"   checked={deductions.faov}             onChange={v => setDeductions(d => ({ ...d, faov: v }))}             />
                            <Toggle label="INCES"     rate="0.5%" checked={deductions.inces}            onChange={v => setDeductions(d => ({ ...d, inces: v }))}            />
                            <Toggle label="Absences"  rate="days" checked={deductions.absenceDeduction} onChange={v => setDeductions(d => ({ ...d, absenceDeduction: v }))} />
                        </div>
                    </div>
                </div>

                {/* PERIOD DAYS */}
                <Collapsible label="Period days & hours" defaultOpen>
                    <PeriodDataPanel data={periodData} onChange={setPeriodData} period={period} />
                </Collapsible>

                {/* PAY RATES */}
                <Collapsible label="Pay rate multipliers — saturday, sunday, holidays & overtime">
                    <PayRatesPanel rates={payRates} onChange={setPayRates} />
                </Collapsible>

                {/* EXTRA CONCEPTS */}
                <Collapsible label="Additional concepts — applied to all employees this period">
                    <CustomConceptsPanel concepts={globalConcepts} onChange={setGlobalConcepts} />
                </Collapsible>

                {/* SUMMARY BAR */}
                <div className={[
                    "flex flex-wrap items-center gap-x-8 gap-y-3",
                    "px-5 py-3.5 rounded-xl",
                    "bg-surface-1 border border-border-light",
                    "shadow-[0_1px_2px_rgba(0,0,0,.04)]",
                ].join(" ")}>
                    <Stat label="Employees"   value={String(totals.count)}                 bold />
                    <Sep />
                    <Stat label="Assignments" value={`Bs. ${fmt(totals.assignments)}`}     bold />
                    <Stat label="Deductions"  value={`Bs. ${fmt(totals.deductions)}`}           />
                    <Stat label="Net total"   value={`Bs. ${fmt(totals.netPay)}`}          bold />
                    <Sep />
                    <Stat label="Net total $" value={`$ ${fmt(totals.netPayUSD)}`} sub={`@ Bs. ${fmt(bcvRate)}`} />
                    <Sep />
                    <Stat label="Period"
                        value={`${PERIOD_LABEL[period]}${period === "biweekly" ? ` — ${fortnight === "first" ? "IQ" : "IIQ"}` : ""}`}
                    />
                </div>

                {/* TABLE */}
                <BaseTable.Render
                    data={sorted}
                    columns={columns}
                    keyExtractor={r => r.employee.id}
                    enableSearch
                    title="payroll"
                    selectionMode="single"
                    selectedKeys={selectedKeys}
                    onSelectionChange={k => setSelectedKeys(k as Set<string | number>)}
                    sortDescriptor={sortDescriptor}
                    onSortChange={setSortDescriptor}
                    pagination={{ defaultPageSize: 10, pageSizeOptions: [5, 10, 25] }}
                    searchValue={searchValue}
                    onSearchChange={handleSearchChange}
                    searchColumns={searchCols}
                    onSearchColumnsChange={handleColsChange}
                />

            </div>
        </div>
    );
}