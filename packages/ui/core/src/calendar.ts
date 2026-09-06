/**
 * Parses a calendar date without interpreting it as an instant in UTC.
 * @param value - A complete YYYY-MM-DD date.
 * @returns A local noon Date, or null for missing/invalid calendar dates.
 */
export function calendarDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]),
    month = Number(match[2]),
    day = Number(match[3]);
  const date = new Date(2000, month - 1, day, 12);
  date.setFullYear(year);
  return year >= 1 &&
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? date
    : null;
}

/**
 * Serializes the calendar fields selected by a native date control.
 * @param date - A valid local date supplied by the renderer.
 * @returns YYYY-MM-DD with no timezone conversion.
 */
export function calendarValue(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Determines whether a complete month identifier is valid.
 * @param value - Candidate YYYY-MM value.
 * @returns Whether the year and month describe a calendar month.
 */
export function validPeriod(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value) && calendarDate(`${value}-01`) !== null;
}

/**
 * Checks a normalized ISO date or month against inclusive limits.
 * @param value - Normalized value to compare.
 * @param min - Optional inclusive lower bound in the same format.
 * @param max - Optional inclusive upper bound in the same format.
 * @returns Whether the candidate is inside the requested interval.
 */
export function withinBounds(
  value: string,
  min?: string,
  max?: string,
): boolean {
  return (!min || value >= min) && (!max || value <= max);
}

/**
 * Chooses the initial visible date without modifying a controlled selection.
 * @param value - Current selection; invalid or empty selections show today.
 * @param min - Optional lower date bound.
 * @param max - Optional upper date bound.
 * @returns A valid date clamped to the visible interval.
 */
export function initialDate(value: string, min?: string, max?: string): Date {
  const date = calendarDate(value) ?? new Date();
  const iso = calendarValue(date);
  if (min && iso < min) return calendarDate(min) ?? date;
  if (max && iso > max) return calendarDate(max) ?? date;
  return date;
}
