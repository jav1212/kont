// Builders that translate between persisted PayrollSettings (defs without
// runtime ids/quantities) and the runtime row shapes used by the /payroll
// calculator (with auto-filled calendar quantities and stable ids for React keys).

import type {
    EarningRow,
    DeductionRow,
    BonusRow,
    HorasExtrasRow,
} from "../types/payroll-types";
import type {
    PayrollEarningRowDef,
    PayrollDeductionRowDef,
    PayrollBonusRowDef,
    PayrollHorasExtrasGlobalDef,
    PayrollSettings,
    PdfVisibility,
} from "../../backend/domain/payroll-settings";

let _seq = 0;
export const uid = (p: string) => `${p}_${++_seq}_${Date.now()}`;

// Deterministic ID derived from the row's label (or another stable token).
// Stable across regenerations of the same defs array, so per-employee
// `excluded.deductions[]` (and equivalents) survive a `setDeductionRows(...)`
// re-build triggered by `activePeriodInfo` / settings re-fetch.
//
// Within a single array, duplicate labels are tie-broken by appearance index
// (`d:prestamo`, `d:prestamo__1`, …) so each row still gets a unique key.
function slug(label: string): string {
    return label
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        || "row";
}

function makeSlugId(prefix: string) {
    const seen = new Map<string, number>();
    return (token: string): string => {
        const base = `${prefix}:${slug(token)}`;
        const count = seen.get(base) ?? 0;
        seen.set(base, count + 1);
        return count === 0 ? base : `${base}__${count}`;
    };
}

// Known calendar-based labels → quantity comes from the period calendar.
export const CALENDAR_QUANTITY: Record<
    string,
    (wd: number, sat: number, sun: number, hol: number) => number
> = {
    "Días Normales": (wd) => wd,
    "Sábados": (_, sat) => sat,
    "Domingos": (_, __, sun) => sun,
    "Feriados Nacionales": (_, __, ___, hol) => hol,
};

// Build EarningRow[] from saved defs + current period calendar values.
//
// When the period contains holidays but no "Feriados Nacionales" row is in
// the saved defs yet, we auto-inject one (multiplier 1.5, same pattern as
// Domingos). On the next save the row persists into defs; if a future period
// has zero holidays the bottom filter drops it from view automatically.
export function makeEarningsFromDefs(
    defs: PayrollEarningRowDef[],
    wd: number,
    sat: number,
    sun: number,
    hol = 0,
): EarningRow[] {
    const hasFeriadosRow = defs.some((d) => d.label === "Feriados Nacionales");
    const effectiveDefs: PayrollEarningRowDef[] =
        hol > 0 && !hasFeriadosRow
            ? [...defs, { label: "Feriados Nacionales", multiplier: "1.5", useDaily: true }]
            : defs;

    const nextId = makeSlugId("e");
    return effectiveDefs
        .map((def): EarningRow => {
            let qty: string;
            if (!def.useDaily) {
                qty = def.quantity ?? "0";
            } else {
                const calFn = CALENDAR_QUANTITY[def.label];
                qty = calFn ? String(calFn(wd, sat, sun, hol)) : "0";
            }
            return {
                id: nextId(def.label),
                label: def.label,
                quantity: qty,
                multiplier: def.multiplier,
                useDaily: def.useDaily,
            };
        })
        // Drop calendar-based rows whose quantity is "0" (e.g. no Saturdays in period)
        .filter(
            (row) =>
                !(
                    !Object.prototype.hasOwnProperty.call(CALENDAR_QUANTITY, row.label) === false &&
                    row.useDaily &&
                    row.quantity === "0"
                ),
        );
}

// Extract defs from current earning rows (strip quantities for calendar-based rows).
export function extractEarningDefs(rows: EarningRow[]): PayrollEarningRowDef[] {
    return rows.map((r) => ({
        label: r.label,
        multiplier: r.multiplier,
        useDaily: r.useDaily,
        ...(r.useDaily ? {} : { quantity: r.quantity }),
    }));
}

// Labels whose quincenaRule is forzado a "second-half" por convención venezolana,
// aun si lo guardado dice "always" (auto-corrección de filas tipeadas por el usuario).
const FORCED_SECOND_HALF = /^INCES$/i;

export function makeDeductionsFromDefs(defs: PayrollDeductionRowDef[]): DeductionRow[] {
    const nextId = makeSlugId("d");
    return defs.map((d) => ({
        id: nextId(d.label),
        label: d.label,
        rate: d.rate,
        base: d.base,
        mode: d.mode,
        quincenaRule: FORCED_SECOND_HALF.test(d.label) ? "second-half" : d.quincenaRule,
    }));
}

export function makeBonusesFromDefs(defs: PayrollBonusRowDef[]): BonusRow[] {
    const nextId = makeSlugId("b");
    return defs.map((b) => ({
        id:       nextId(b.label),
        label:    b.label,
        amount:   b.amount,
        currency: b.currency ?? "USD",
    }));
}

export function makeHorasExtrasFromDefs(defs: PayrollHorasExtrasGlobalDef[]): HorasExtrasRow[] {
    const nextId = makeSlugId("xhg");
    return defs.map((d) => ({ id: nextId(d.tipo), tipo: d.tipo, hours: d.hours, active: d.active }));
}

export function extractHorasExtrasDefs(rows: HorasExtrasRow[]): PayrollHorasExtrasGlobalDef[] {
    return rows
        .filter((r): r is HorasExtrasRow & { tipo: "diurna" | "nocturna" } => r.tipo === "diurna" || r.tipo === "nocturna")
        .map((r) => ({ tipo: r.tipo, hours: r.hours, active: r.active }));
}

// Build a PayrollSettings snapshot from current row state.
export function buildSettings(
    earningRows: EarningRow[],
    deductionRows: DeductionRow[],
    bonusRows: BonusRow[],
    diasUtilidades: number,
    diasBono: number,
    salaryMode: "mensual" | "integral",
    cestaTicketUSD: number,
    bonoGuerraUSD: number,
    salarioMinimo: number,
    horasExtrasGlobal: HorasExtrasRow[],
    pdfVisibility: PdfVisibility,
): PayrollSettings {
    return {
        earningRowDefs: extractEarningDefs(earningRows),
        deductionRowDefs: deductionRows.map((r) => ({
            label: r.label,
            rate: r.rate,
            base: r.base,
            mode: r.mode ?? "rate",
            quincenaRule: FORCED_SECOND_HALF.test(r.label) ? "second-half" : (r.quincenaRule ?? "always"),
        })),
        bonusRowDefs: bonusRows.map((r) => ({ label: r.label, amount: r.amount, currency: r.currency })),
        diasUtilidades,
        diasBonoVacacional: diasBono,
        salaryMode,
        cestaTicketUSD,
        bonoGuerraUSD,
        salarioMinimoRef: salarioMinimo,
        horasExtrasGlobalRows: extractHorasExtrasDefs(horasExtrasGlobal),
        pdfVisibility,
    };
}
