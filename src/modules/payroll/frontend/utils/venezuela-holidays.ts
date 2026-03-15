// ============================================================================
// VENEZUELA NATIONAL HOLIDAYS
// Art. 190 LOTTT + Decreto de Feriados
// ============================================================================

export interface Holiday {
    date: string; // ISO "YYYY-MM-DD"
    name: string;
}

// ── Fixed holidays (same date every year) ────────────────────────────────────

const FIXED: { mm: number; dd: number; name: string }[] = [
    { mm: 1,  dd: 1,  name: "Año Nuevo"                          },
    { mm: 4,  dd: 19, name: "19 de Abril"                        },
    { mm: 5,  dd: 1,  name: "Día del Trabajador"                 },
    { mm: 6,  dd: 24, name: "Batalla de Carabobo"                },
    { mm: 7,  dd: 5,  name: "Día de la Independencia"            },
    { mm: 7,  dd: 24, name: "Natalicio de Simón Bolívar"         },
    { mm: 10, dd: 12, name: "Día de la Resistencia Indígena"     },
    { mm: 12, dd: 25, name: "Navidad"                            },
];

// ── Easter (Gregorian) — Anonymous algorithm ──────────────────────────────────

function easterSunday(year: number): Date {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31); // 1-indexed
    const day   = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
}

function addDays(d: Date, n: number): Date {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
}

function toISO(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ── Variable holidays (relative to Easter) ───────────────────────────────────

function variableHolidays(year: number): Holiday[] {
    const easter = easterSunday(year);
    return [
        { date: toISO(addDays(easter, -48)), name: "Lunes de Carnaval"  },
        { date: toISO(addDays(easter, -47)), name: "Martes de Carnaval" },
        { date: toISO(addDays(easter,  -3)), name: "Jueves Santo"       },
        { date: toISO(addDays(easter,  -2)), name: "Viernes Santo"      },
    ];
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Returns all Venezuelan national holidays for the given year. */
export function getHolidaysForYear(year: number): Holiday[] {
    const fixed: Holiday[] = FIXED.map(({ mm, dd, name }) => ({
        date: `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`,
        name,
    }));
    return [...fixed, ...variableHolidays(year)].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Returns holidays that fall within [startISO, endISO] (inclusive).
 * Only returns holidays on weekdays (Mon–Fri) by default — set `allDays=true`
 * to include weekend holidays too.
 */
export function getHolidaysInRange(
    startISO: string,
    endISO:   string,
    allDays = false,
): Holiday[] {
    // Determine which years to check (a range can span year boundaries)
    const startYear = parseInt(startISO.slice(0, 4), 10);
    const endYear   = parseInt(endISO.slice(0, 4),   10);

    const holidays: Holiday[] = [];
    for (let y = startYear; y <= endYear; y++) {
        holidays.push(...getHolidaysForYear(y));
    }

    return holidays.filter(({ date }) => {
        if (date < startISO || date > endISO) return false;
        if (!allDays) {
            const dow = new Date(date + "T00:00:00").getDay(); // 0=Sun, 6=Sat
            if (dow === 0 || dow === 6) return false;          // skip weekend holidays
        }
        return true;
    });
}
