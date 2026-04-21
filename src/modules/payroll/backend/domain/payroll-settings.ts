// src/modules/payroll/backend/domain/payroll-settings.ts
//
// Domain types for company-scoped Payroll calculation settings (REQ-005/REQ-008).
// Persisted as JSONB in the companies.payroll_settings column.
//
// Architectural role:
//   - Single source of truth for what "Payroll defaults" mean per company.
//   - Passed to use cases; never references infrastructure directly.
//
// Invariant: always call mergePayrollSettings() when deserializing from storage
// to guard against partially-populated or empty JSONB values.

// ── Row definition types ──────────────────────────────────────────────────────

// Earning row template — quantities are auto-filled from the quincena calendar.
// For useDaily=false rows, `quantity` holds a fixed VES amount.
export interface PayrollEarningRowDef {
    label:      string;
    multiplier: string;   // e.g. "1.0" for weekdays, "1.5" for Sundays
    useDaily:   boolean;  // true → qty × dailyRate × mult | false → qty = fixed VES
    quantity?:  string;   // only stored for useDaily=false; calendar rows auto-fill
}

// Deduction row template.
// quincenaRule "second-half" → row is excluded when computing first-half payroll (FAOV rule).
export interface PayrollDeductionRowDef {
    label:        string;
    rate:         string;                                        // % string or flat VES
    base:         "weekly" | "monthly" | "integral" | "weekly-capped";
    mode:         "rate" | "fixed";
    quincenaRule: "always" | "second-half";                      // FAOV formal rule
}

// Bonus row template — amounts in USD, converted at BCV rate on compute.
export interface PayrollBonusRowDef {
    label:  string;
    amount: string;   // default USD amount
}

// ── Horas extras globales (Art. 118 LOTTT) ───────────────────────────────────

// Company-level overtime rows applied to every employee in a payroll.
// `active: false` → row is skipped in compute. `hours` is a string for controlled input.
export interface PayrollHorasExtrasGlobalDef {
    tipo:   "diurna" | "nocturna";
    hours:  string;
    active: boolean;
}

// ── PDF visibility ────────────────────────────────────────────────────────────

// Controls which segments appear in the generated payroll PDF.
// Visibility is presentation-only — never affects calculation totals.
export interface PdfVisibility {
    showEarnings:          boolean;
    showDeductions:        boolean;
    showBonuses:           boolean;
    showOvertime:          boolean;   // H.E. Diurnas / Nocturnas / Feriado lines
    showAlicuotaBreakdown: boolean;   // integral salary breakdown in employee card
}

// ── Main settings type ────────────────────────────────────────────────────────

export interface PayrollSettings {
    earningRowDefs:         PayrollEarningRowDef[];
    deductionRowDefs:       PayrollDeductionRowDef[];
    bonusRowDefs:           PayrollBonusRowDef[];
    diasUtilidades:         number;
    diasBonoVacacional:     number;
    salaryMode:             "mensual" | "integral";
    cestaTicketUSD:         number;
    salarioMinimoRef:       number;   // reference minimum salary for SSO cap (10× multiplier)
    horasExtrasGlobalRows:  PayrollHorasExtrasGlobalDef[];
    pdfVisibility:          PdfVisibility;
}

// ── Defaults ─────────────────────────────────────────────────────────────────

export function defaultPayrollSettings(): PayrollSettings {
    return {
        earningRowDefs: [
            { label: "Días Normales", multiplier: "1.0", useDaily: true },
            { label: "Sábados",       multiplier: "1.0", useDaily: true },
            { label: "Domingos",      multiplier: "1.5", useDaily: true },
        ],
        deductionRowDefs: [
            { label: "S.S.O",   rate: "4",   base: "weekly-capped", mode: "rate", quincenaRule: "always"      },
            { label: "R.P.E",   rate: "0.5", base: "weekly",        mode: "rate", quincenaRule: "always"      },
            { label: "F.A.O.V", rate: "1",   base: "monthly",       mode: "rate", quincenaRule: "second-half" },
        ],
        bonusRowDefs: [
            { label: "Bono Alimentación", amount: "40.00" },
            { label: "Bono Transporte",   amount: "20.00" },
        ],
        diasUtilidades:     15,
        diasBonoVacacional: 15,
        salaryMode:         "mensual",
        cestaTicketUSD:     40,
        salarioMinimoRef:   0,
        horasExtrasGlobalRows: [
            { tipo: "diurna",   hours: "0", active: false },
            { tipo: "nocturna", hours: "0", active: false },
        ],
        pdfVisibility: {
            showEarnings:          true,
            showDeductions:        true,
            showBonuses:           true,
            showOvertime:          true,
            showAlicuotaBreakdown: true,
        },
    };
}

// Safe merge — partial stored value is filled with defaults for missing keys.
// Unknown legacy keys (bonoNocturnoEnabled, overtimeDefaults, showNightShiftBonus)
// are silently ignored.
export function mergePayrollSettings(stored: Partial<PayrollSettings>): PayrollSettings {
    const def = defaultPayrollSettings();
    return {
        earningRowDefs:        stored.earningRowDefs        ?? def.earningRowDefs,
        deductionRowDefs:      stored.deductionRowDefs      ?? def.deductionRowDefs,
        bonusRowDefs:          stored.bonusRowDefs          ?? def.bonusRowDefs,
        diasUtilidades:        stored.diasUtilidades        ?? def.diasUtilidades,
        diasBonoVacacional:    stored.diasBonoVacacional    ?? def.diasBonoVacacional,
        salaryMode:            stored.salaryMode            ?? def.salaryMode,
        cestaTicketUSD:        stored.cestaTicketUSD        ?? def.cestaTicketUSD,
        salarioMinimoRef:      stored.salarioMinimoRef      ?? def.salarioMinimoRef,
        horasExtrasGlobalRows: stored.horasExtrasGlobalRows ?? def.horasExtrasGlobalRows,
        pdfVisibility: {
            ...def.pdfVisibility,
            ...(stored.pdfVisibility ?? {}),
        },
    };
}
