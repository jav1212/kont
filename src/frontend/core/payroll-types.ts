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
    id:    string;
    label: string;
    rate:  string;               // percentage string e.g. "4"
    base:  "weekly" | "monthly"; // which salary base to apply the rate to
}

export interface BonusRow {
    id:     string;
    label:  string;
    amount: string; // USD amount (string for controlled input)
}

// ── Computed variants — same shape + resolved numeric value ────────────────

export interface EarningValue   extends EarningRow   { computed: number }
export interface DeductionValue extends DeductionRow { computed: number }
export interface BonusValue     extends BonusRow     { computed: number }