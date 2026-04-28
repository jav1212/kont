// Quincena / weekly period helpers shared between the legacy payroll calculator
// and the experimental guided wizard. Pure functions: same input → same output,
// no side effects.

import { getHolidaysInRange } from "./venezuela-holidays";
import type { Holiday } from "./venezuela-holidays";

export type Quincena = 1 | 2;
export type PeriodoMode = "quincenal" | "semanal";

export interface QuincenaInfo {
    weekdays: number;
    saturdays: number;
    sundays: number;
    mondays: number;
    holidays: number;
    holidayList: Holiday[];
    startDate: string;
    endDate: string;
    label: string;
}

export interface WeekInfo {
    weekdays: number;
    saturdays: number;
    sundays: number;
    mondays: number;
    holidays: number;
    holidayList: Holiday[];
    startDate: string;
    endDate: string;
    label: string;
}

export const MONTH_NAMES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const pad2 = (n: number) => String(n).padStart(2, "0");
const toISO = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export function getMondaysOfMonth(year: number, month: number): string[] {
    const mondays: string[] = [];
    const d = new Date(year, month - 1, 1);
    while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
    while (d.getMonth() === month - 1) {
        mondays.push(toISO(d));
        d.setDate(d.getDate() + 7);
    }
    return mondays;
}

export function getWeekInfo(mondayISO: string): WeekInfo {
    const start = new Date(mondayISO + "T00:00:00");
    const end = new Date(start);
    end.setDate(end.getDate() + 6);

    const startISO = toISO(start);
    const endISO = toISO(end);

    const holidayList = getHolidaysInRange(startISO, endISO);
    const holidayDates = new Set(holidayList.map((h) => h.date));

    let weekdays = 0, saturdays = 0, sundays = 0;
    const cur = new Date(start);
    while (cur <= end) {
        const iso = toISO(cur);
        const wd = cur.getDay();
        if (wd === 0) sundays++;
        else if (wd === 6) saturdays++;
        else if (!holidayDates.has(iso)) weekdays++;
        cur.setDate(cur.getDate() + 1);
    }

    const startFmt = start.toLocaleDateString("es-VE", { day: "2-digit", month: "short" });
    const endFmt = end.toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" });

    return {
        weekdays, saturdays, sundays, mondays: 1,
        holidays: holidayList.length,
        holidayList,
        startDate: startISO,
        endDate: endISO,
        label: `Sem. ${startFmt} – ${endFmt}`,
    };
}

export function getQuincenaInfo(year: number, month: number, q: Quincena): QuincenaInfo {
    const startDay = q === 1 ? 1 : 16;
    const endDay = q === 1 ? 15 : new Date(year, month, 0).getDate();
    const start = new Date(year, month - 1, startDay);
    const end = new Date(year, month - 1, endDay);

    const startISO = toISO(start);
    const endISO = toISO(end);

    const holidayList = getHolidaysInRange(startISO, endISO);
    const holidayDates = new Set(holidayList.map((h) => h.date));

    let weekdays = 0, saturdays = 0, sundays = 0, mondays = 0;
    const cur = new Date(start);
    while (cur <= end) {
        const iso = toISO(cur);
        const wd = cur.getDay();
        if (wd === 0) sundays++;
        else if (wd === 6) saturdays++;
        else if (!holidayDates.has(iso)) weekdays++;
        if (wd === 1) mondays++;
        cur.setDate(cur.getDate() + 1);
    }

    return {
        weekdays, saturdays, sundays, mondays,
        holidays: holidayList.length,
        holidayList,
        startDate: startISO, endDate: endISO,
        label: `${startDay}–${endDay} de ${MONTH_NAMES[month - 1]} ${year}`,
    };
}
