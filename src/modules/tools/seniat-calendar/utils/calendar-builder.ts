// ============================================================================
// Calendar Builder — generates CalendarEntry[] for a given year + digit + type
// ============================================================================

import type { CalendarEntry, CalendarYear, ObligationCategory, TaxpayerType } from "../data/types";
import { CALENDAR_2026 } from "../data/calendar-2026";
import { toLocalIso, rollToNextBusinessDay } from "./date-helpers";

const CALENDARS: Record<number, CalendarYear> = {
    2026: CALENDAR_2026,
};

export const AVAILABLE_YEARS = Object.keys(CALENDARS).map(Number).sort();

interface BuildCalendarOptions {
    year: number;
    lastDigit: number;          // 0-9, the RIF verificador digit
    taxpayerType: TaxpayerType;
    categoryFilter?: ObligationCategory[];
}

/**
 * Builds the full list of CalendarEntry for a given year, RIF digit, and taxpayer type.
 * Entries are sorted ascending by dueDate.
 */
export function buildCalendar({ year, lastDigit, taxpayerType, categoryFilter }: BuildCalendarOptions): CalendarEntry[] {
    const cal = CALENDARS[year];
    if (!cal) return [];

    const digitKey = String(lastDigit);
    const entries: CalendarEntry[] = [];

    const applicableObligation = cal.obligations.filter((o) => {
        if (!o.appliesTo.includes(taxpayerType)) return false;
        if (categoryFilter && categoryFilter.length > 0 && !categoryFilter.includes(o.category)) return false;
        return true;
    });

    for (const obligation of applicableObligation) {
        if (taxpayerType === "especial") {
            const schedule = cal.especialSchedule[obligation.id];
            if (!schedule) continue;

            for (const monthStr of Object.keys(schedule)) {
                const month = parseInt(monthStr, 10);
                const monthEntry = schedule[month];
                if (!monthEntry) continue;

                const days = monthEntry.byLastDigit[digitKey] ?? monthEntry.byLastDigit["0"] ?? [];

                for (const day of days) {
                    // IMPORTANT: Use local Date constructor to avoid UTC shift
                    const rawDate = new Date(year, month - 1, day);
                    const rolledDate = rollToNextBusinessDay(rawDate, cal.holidays);

                    const originalIso = toLocalIso(rawDate);
                    const dueIso = toLocalIso(rolledDate);
                    const rolled = originalIso !== dueIso;

                    // Determine period label.
                    // 2da quincena: el período retenido es el mes ANTERIOR al de declaración.
                    // IVA Mensual Especial: el período declarado es el mes ANTERIOR.
                    const isSecondQuincena = obligation.id.endsWith("-2da");
                    const isMonthlyPeriodPrev =
                        isSecondQuincena ||
                        obligation.id === "iva-mensual-especial" ||
                        obligation.id === "islr-retenciones";
                    const periodMonth = isMonthlyPeriodPrev
                        ? month === 1 ? 12 : month - 1
                        : month;
                    const periodYear = isMonthlyPeriodPrev && month === 1 ? year - 1 : year;

                    let period: string;
                    if (obligation.periodicity === "quincenal") {
                        const q = obligation.id.includes("2da") ? "2da" : "1ra";
                        period = `${q}-quincena-${String(periodMonth).padStart(2, "0")}-${periodYear}`;
                    } else if (obligation.periodicity === "anual") {
                        period = String(year);
                    } else {
                        period = `${String(periodMonth).padStart(2, "0")}-${periodYear}`;
                    }

                    entries.push({
                        obligationId: obligation.id,
                        category: obligation.category,
                        title: obligation.title,
                        shortTitle: obligation.shortTitle,
                        dueDate: dueIso,
                        originalDate: originalIso,
                        rolled,
                        period,
                        colorToken: obligation.colorToken,
                        legalBasis: obligation.legalBasis,
                    });
                }
            }
        } else {
            // Ordinario — no digit dependency
            const schedule = cal.ordinarioSchedule[obligation.id];
            if (!schedule) continue;

            for (const monthStr of Object.keys(schedule)) {
                const month = parseInt(monthStr, 10);
                const days = schedule[month];
                if (!days) continue;

                for (const day of days) {
                    const rawDate = new Date(year, month - 1, day);
                    const rolledDate = rollToNextBusinessDay(rawDate, cal.holidays);

                    const originalIso = toLocalIso(rawDate);
                    const dueIso = toLocalIso(rolledDate);
                    const rolled = originalIso !== dueIso;

                    let period: string;
                    if (obligation.periodicity === "anual") {
                        period = String(year);
                    } else {
                        // For IVA ordinario, the period is the previous month
                        const periodMonth = month === 1 ? 12 : month - 1;
                        const periodYear = month === 1 ? year - 1 : year;
                        period = `${String(periodMonth).padStart(2, "0")}-${periodYear}`;
                    }

                    entries.push({
                        obligationId: obligation.id,
                        category: obligation.category,
                        title: obligation.title,
                        shortTitle: obligation.shortTitle,
                        dueDate: dueIso,
                        originalDate: originalIso,
                        rolled,
                        period,
                        colorToken: obligation.colorToken,
                        legalBasis: obligation.legalBasis,
                    });
                }
            }
        }
    }

    // Filter out entries outside the target year
    const yearStr = String(year);
    const filtered = entries.filter((e) => e.dueDate.startsWith(yearStr));

    // Sort ascending by dueDate
    filtered.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    return filtered;
}

/**
 * Returns the next upcoming obligation from a list of entries, relative to today.
 */
export function getNextUpcoming(entries: CalendarEntry[], todayIso: string): CalendarEntry | null {
    const upcoming = entries.filter((e) => e.dueDate >= todayIso);
    return upcoming[0] ?? null;
}

/**
 * Groups entries by month number (1-12).
 */
export function groupByMonth(entries: CalendarEntry[]): Map<number, CalendarEntry[]> {
    const map = new Map<number, CalendarEntry[]>();
    for (let m = 1; m <= 12; m++) {
        map.set(m, []);
    }
    for (const entry of entries) {
        const month = parseInt(entry.dueDate.split("-")[1], 10);
        const existing = map.get(month) ?? [];
        existing.push(entry);
        map.set(month, existing);
    }
    return map;
}
