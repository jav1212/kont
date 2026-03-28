// ============================================================================
// PAYROLL TYPES — shared across all payroll components
// ============================================================================

export interface EarningRow {
    id:         string;
    label:      string;
    quantity:   string;  // days / units (string for controlled input)
    multiplier: string;  // weight factor e.g. "1.5" for sundays
    useDaily:   boolean; // true → qty × dailyRate × mult | false → qty = full VES
}

export interface DeductionRow {
    id:           string;
    label:        string;
    rate:         string;               // percentage string e.g. "4" — OR fixed VES amount when mode="fixed"
    base:         "weekly" | "monthly" | "integral" | "weekly-capped"; // "weekly-capped" = min(weeklyBase, 10×salMin)
    mode?:        "rate" | "fixed";     // "rate" = % of base (default), "fixed" = flat VES amount
    // Period rule: "second-half" → row is excluded when computing first-half (Q1) payroll.
    // Enables the formal FAOV rule per REQ-005 without ad-hoc row editing.
    quincenaRule?: "always" | "second-half";
}

export interface BonusRow {
    id:     string;
    label:  string;
    amount: string; // USD amount (string for controlled input)
}

// ── Horas extras (Art. 118 LOTTT) ─────────────────────────────────────────

export type HorasExtrasTipo = "diurna" | "nocturna" | "feriado";

export interface HorasExtrasRow {
    id:    string;
    tipo:  HorasExtrasTipo;   // diurna 25% | nocturna 45% | feriado 100%
    hours: string;             // number of extra hours (string for controlled input)
}

// Multipliers per LOTTT Art. 118
export const HORAS_EXTRAS_MULTIPLIER: Record<HorasExtrasTipo, number> = {
    diurna:   1.25,
    nocturna: 1.45,
    feriado:  2.00,
};

// ── Computed variants — same shape + resolved numeric value ────────────────

export interface EarningValue   extends EarningRow   { computed: number }
export interface DeductionValue extends DeductionRow { computed: number }
export interface BonusValue     extends BonusRow     { computed: number }