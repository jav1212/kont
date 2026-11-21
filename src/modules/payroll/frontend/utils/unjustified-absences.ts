// Unjustified absences reduce profit sharing to the time actually worked
// (Art. 131 LOTTT: when the worker did not work the whole year, the benefit is
// reduced proportionally). Justified absences (medical rest, permits, leaves)
// must not be entered here: they do not reduce the entitlement.

/**
 * Parses a typed absence-day count into a non-negative whole number.
 * @param value - Raw input text; empty or invalid text counts as no absences.
 * @returns The absence days, truncated to an integer and floored at 0.
 */
export function parseAbsenceDays(value: string | undefined): number {
    const days = Math.trunc(Number(value));
    return Number.isFinite(days) && days > 0 ? days : 0;
}

/**
 * Removes unjustified absences from the days of a service period.
 * @param periodDays - Calendar days the benefit is prorated over.
 * @param absenceDays - Unjustified absence days inside that period.
 * @returns The absences actually applied (capped at the period length) and the
 * remaining effective days, never negative.
 */
export function discountUnjustifiedAbsences(
    periodDays: number,
    absenceDays: number,
): { appliedAbsenceDays: number; effectiveDays: number } {
    const period = Math.max(0, periodDays);
    const appliedAbsenceDays = Math.min(Math.max(0, absenceDays), period);
    return { appliedAbsenceDays, effectiveDays: period - appliedAbsenceDays };
}
