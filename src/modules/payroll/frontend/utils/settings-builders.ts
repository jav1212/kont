// Builders that translate between persisted PayrollSettings (defs without
// runtime ids/quantities) and the runtime row shapes used by the calculator
// (with auto-filled calendar quantities and stable ids for React keys).
//
// Shared by the legacy /payroll calculator and the experimental
// /payroll-guided wizard.

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
                id: uid("e"),
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

export function makeDeductionsFromDefs(defs: PayrollDeductionRowDef[]): DeductionRow[] {
    return defs.map((d) => ({
        id: uid("d"),
        label: d.label,
        rate: d.rate,
        base: d.base,
        mode: d.mode,
        quincenaRule: d.quincenaRule,
    }));
}

export function makeBonusesFromDefs(defs: PayrollBonusRowDef[]): BonusRow[] {
    return defs.map((b) => ({ id: uid("b"), label: b.label, amount: b.amount }));
}

export function makeHorasExtrasFromDefs(defs: PayrollHorasExtrasGlobalDef[]): HorasExtrasRow[] {
    return defs.map((d) => ({ id: uid("xhg"), tipo: d.tipo, hours: d.hours, active: d.active }));
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
            quincenaRule: r.quincenaRule ?? "always",
        })),
        bonusRowDefs: bonusRows.map((r) => ({ label: r.label, amount: r.amount })),
        diasUtilidades,
        diasBonoVacacional: diasBono,
        salaryMode,
        cestaTicketUSD,
        salarioMinimoRef: salarioMinimo,
        horasExtrasGlobalRows: extractHorasExtrasDefs(horasExtrasGlobal),
        pdfVisibility,
    };
}
