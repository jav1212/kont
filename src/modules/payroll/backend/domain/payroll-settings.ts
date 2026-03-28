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

// ── Overtime defaults ─────────────────────────────────────────────────────────

// Company-level defaults for overtime calculation (REQ-008).
// Employee-level overrides can still supersede these per quincena.
export interface OvertimeDefaults {
    dayOvertimeEnabled:   boolean;   // H.E. Diurnas enabled by default
    nightOvertimeEnabled: boolean;   // H.E. Nocturnas enabled by default
}

// ── PDF visibility ────────────────────────────────────────────────────────────

// Controls which segments appear in the generated payroll PDF.
// Visibility is presentation-only — never affects calculation totals.
export interface PdfVisibility {
    showEarnings:          boolean;
    showDeductions:        boolean;
    showBonuses:           boolean;
    showOvertime:          boolean;   // H.E. Diurnas / Nocturnas / Feriado lines
    showNightShiftBonus:   boolean;   // Bono Nocturno line (Art. 117)
    showAlicuotaBreakdown: boolean;   // integral salary breakdown in employee card
}

// ── Main settings type ────────────────────────────────────────────────────────

export interface PayrollSettings {
    earningRowDefs:      PayrollEarningRowDef[];
    deductionRowDefs:    PayrollDeductionRowDef[];
    bonusRowDefs:        PayrollBonusRowDef[];
    diasUtilidades:      number;
    diasBonoVacacional:  number;
    salaryMode:          "mensual" | "integral";
    cestaTicketUSD:      number;
    bonoNocturnoEnabled: boolean;
    salarioMinimoRef:    number;   // reference minimum salary for SSO cap (10× multiplier)
    overtimeDefaults:    OvertimeDefaults;
    pdfVisibility:       PdfVisibility;
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
        diasUtilidades:      15,
        diasBonoVacacional:  15,
        salaryMode:          "mensual",
        cestaTicketUSD:      40,
        bonoNocturnoEnabled: false,
        salarioMinimoRef:    0,
        overtimeDefaults: {
            dayOvertimeEnabled:   false,
            nightOvertimeEnabled: false,
        },
        pdfVisibility: {
            showEarnings:          true,
            showDeductions:        true,
            showBonuses:           true,
            showOvertime:          true,
            showNightShiftBonus:   true,
            showAlicuotaBreakdown: true,
        },
    };
}

// Safe merge — partial stored value is filled with defaults for missing keys.
export function mergePayrollSettings(stored: Partial<PayrollSettings>): PayrollSettings {
    const def = defaultPayrollSettings();
    return {
        earningRowDefs:      stored.earningRowDefs      ?? def.earningRowDefs,
        deductionRowDefs:    stored.deductionRowDefs    ?? def.deductionRowDefs,
        bonusRowDefs:        stored.bonusRowDefs        ?? def.bonusRowDefs,
        diasUtilidades:      stored.diasUtilidades      ?? def.diasUtilidades,
        diasBonoVacacional:  stored.diasBonoVacacional  ?? def.diasBonoVacacional,
        salaryMode:          stored.salaryMode          ?? def.salaryMode,
        cestaTicketUSD:      stored.cestaTicketUSD      ?? def.cestaTicketUSD,
        bonoNocturnoEnabled: stored.bonoNocturnoEnabled ?? def.bonoNocturnoEnabled,
        salarioMinimoRef:    stored.salarioMinimoRef    ?? def.salarioMinimoRef,
        overtimeDefaults: {
            ...def.overtimeDefaults,
            ...(stored.overtimeDefaults ?? {}),
        },
        pdfVisibility: {
            ...def.pdfVisibility,
            ...(stored.pdfVisibility ?? {}),
        },
    };
}
