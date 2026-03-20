"use client";

import { useState, useMemo, useEffect } from "react";
import { useCompany }  from "@/src/modules/companies/frontend/hooks/use-companies";
import { useEmployee } from "@/src/modules/payroll/frontend/hooks/use-employee";
import type { Employee } from "@/src/modules/payroll/frontend/hooks/use-employee";
import { getHolidaysInRange } from "@/src/modules/payroll/frontend/utils/venezuela-holidays";
import { generateVacComplletasPdf, generateVacFraccionadasPdf } from "@/src/modules/payroll/frontend/utils/vacaciones-pdf";

// ============================================================================
// HELPERS
// ============================================================================

const fmt = (n: number) =>
    "Bs. " + n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtN = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fieldCls = [
    "w-full h-9 px-3 rounded-lg border border-border-light bg-surface-1 outline-none",
    "font-mono text-[13px] text-foreground tabular-nums",
    "focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150",
].join(" ");

const labelCls = "font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] mb-1.5 block";

function isoToday(): string { return new Date().toISOString().split("T")[0]; }

function addCalDays(iso: string, n: number): string {
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + n);
    return d.toISOString().split("T")[0];
}

function nextWorkingDay(iso: string): string {
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + 1);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
}

function calcAniosAt(fechaIngreso: string, refDate: string): number {
    if (!fechaIngreso || !refDate) return 0;
    const a = new Date(fechaIngreso + "T00:00:00");
    const b = new Date(refDate     + "T00:00:00");
    if (b <= a) return 0;
    return Math.floor((b.getTime() - a.getTime()) / (365.25 * 86400000));
}

/** n-th anniversary of fechaIngreso (handles Feb-29 edge case) */
function getAniversario(fechaIngreso: string, n: number): string {
    const [y, m, d] = fechaIngreso.split("-").map(Number);
    const date = new Date(y + n, m - 1, d);
    if (date.getDate() !== d) date.setDate(0); // overflow → last day of prev month
    return date.toISOString().split("T")[0];
}

/** Complete calendar months between two ISO dates */
function getMesesCompletos(desde: string, hasta: string): number {
    if (!desde || !hasta) return 0;
    const a = new Date(desde + "T00:00:00");
    const b = new Date(hasta + "T00:00:00");
    if (b <= a) return 0;
    let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
    if (b.getDate() < a.getDate()) m--;
    return Math.max(0, m);
}

/** Advance from fechaInicio counting only working days (Mon–Fri, no holidays) */
function calculateCulminacion(fechaInicio: string, diasHabilesNeeded: number): string {
    if (!fechaInicio || diasHabilesNeeded <= 0) return fechaInicio;
    const rangeEnd = addCalDays(fechaInicio, Math.ceil(diasHabilesNeeded * 2) + 20);
    const holidays = new Set(getHolidaysInRange(fechaInicio, rangeEnd).map(h => h.date));
    const cur = new Date(fechaInicio + "T00:00:00");
    let counted = 0;
    while (counted < diasHabilesNeeded) {
        const wd  = cur.getDay();
        const iso = cur.toISOString().split("T")[0];
        if (wd !== 0 && wd !== 6 && !holidays.has(iso)) counted++;
        if (counted < diasHabilesNeeded) cur.setDate(cur.getDate() + 1);
    }
    return cur.toISOString().split("T")[0];
}

function getDiasCalendario(inicio: string, fin: string): number {
    if (!inicio || !fin || inicio > fin) return 0;
    const a = new Date(inicio + "T00:00:00");
    const b = new Date(fin    + "T00:00:00");
    return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
}

interface PeriodStats { habiles: number; descanso: number; feriadoList: string[]; }
function getPeriodStats(inicio: string, culminacion: string): PeriodStats {
    if (!inicio || !culminacion || inicio > culminacion) return { habiles: 0, descanso: 0, feriadoList: [] };
    const holidays   = getHolidaysInRange(inicio, culminacion);
    const holSet     = new Set(holidays.map(h => h.date));
    let habiles = 0, descanso = 0;
    const cur = new Date(inicio     + "T00:00:00");
    const end = new Date(culminacion + "T00:00:00");
    while (cur <= end) {
        const wd = cur.getDay();
        const iso = cur.toISOString().split("T")[0];
        (wd === 0 || wd === 6 || holSet.has(iso)) ? descanso++ : habiles++;
        cur.setDate(cur.getDate() + 1);
    }
    return { habiles, descanso, feriadoList: holidays.map(h => h.name) };
}

function formatDateES(iso: string): string {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    const meses = ["enero","febrero","marzo","abril","mayo","junio",
                   "julio","agosto","septiembre","octubre","noviembre","diciembre"];
    return `${parseInt(d)} de ${meses[parseInt(m) - 1]} de ${y}`;
}

// ============================================================================
// CALCULATION ENGINES
// ============================================================================

// ── Vacaciones completas ─────────────────────────────────────────────────────

interface VacCalc {
    diasCalendario: number; diasHabiles: number; diasDescanso: number; feriadoList: string[];
    salarioVES: number; salarioDia: number; anios: number;
    diasLegalDisfrute: number; diasDisfrute: number; diasAdicDisfrute: number; montoDisfrute: number;
    diasLegalBono: number;     diasBono: number;     diasAdicBono: number;     montoBono: number;
    total: number;
}

function computeVac(salarioVES: number, fechaIngreso: string, fechaInicio: string, fechaCulminacion: string): VacCalc | null {
    if (!fechaInicio || !fechaCulminacion || fechaInicio > fechaCulminacion || salarioVES <= 0) return null;
    const { habiles, descanso, feriadoList } = getPeriodStats(fechaInicio, fechaCulminacion);
    const diasCalendario = getDiasCalendario(fechaInicio, fechaCulminacion);
    const anios          = calcAniosAt(fechaIngreso, fechaInicio);
    const diasAdicDisfrute  = anios >= 2 ? Math.min(anios - 1, 15) : 0;
    const diasLegalDisfrute = 15 + diasAdicDisfrute;
    const diasDisfrute      = Math.max(diasLegalDisfrute, habiles);
    const diasAdicBono      = anios >= 2 ? Math.min(anios - 1, 15) : 0;
    const diasLegalBono     = 15 + diasAdicBono;
    const diasBono          = diasLegalBono;
    const salarioDia        = salarioVES / 30;
    return {
        diasCalendario, diasHabiles: habiles, diasDescanso: descanso, feriadoList,
        salarioVES, salarioDia, anios,
        diasLegalDisfrute, diasDisfrute, diasAdicDisfrute, montoDisfrute: diasDisfrute * salarioDia,
        diasLegalBono,     diasBono,     diasAdicBono,     montoBono:     diasBono     * salarioDia,
        total: (diasDisfrute + diasBono) * salarioDia,
    };
}

// ── Vacaciones fraccionadas (Art. 196 LOTTT) ─────────────────────────────────

interface VacFracCalc {
    salarioVES:        number;
    salarioDia:        number;
    aniosCompletos:    number;
    ultimoAniversario: string;
    mesesFraccion:     number;
    // Entitlement for the current partial year
    diasAdicAnuales:   number;   // adicionales: min(aniosCompletos, 15)
    diasAnuales:       number;   // 15 + diasAdicAnuales
    // Fractional result
    fraccionDisfrute:  number;   // ceil(diasAnuales / 12 × meses)
    fraccionBono:      number;   // mismo
    montoDisfrute:     number;
    montoBono:         number;
    total:             number;
}

function computeVacFrac(salarioVES: number, fechaIngreso: string, fechaEgreso: string): VacFracCalc | null {
    if (!fechaIngreso || !fechaEgreso || salarioVES <= 0) return null;
    if (fechaEgreso <= fechaIngreso) return null;

    // Complete years at egreso
    const aniosCompletos     = calcAniosAt(fechaIngreso, fechaEgreso);
    const ultimoAniversario  = aniosCompletos > 0
        ? getAniversario(fechaIngreso, aniosCompletos)
        : fechaIngreso;

    // Months worked in the current partial year (from last anniversary to egreso)
    const mesesFraccion = getMesesCompletos(ultimoAniversario, fechaEgreso);

    // Annual entitlement for the year being prorated
    // Art. 196: proportional to what they'd earn at end of current year
    // Art. 190: year N+1 gives 15 + N adicionales (where N = aniosCompletos)
    const diasAdicAnuales = Math.min(aniosCompletos, 15);
    const diasAnuales     = 15 + diasAdicAnuales;

    // Fracción (Art. 196): ceil(diasAnuales / 12 × mesesCompletos)
    const fraccionDisfrute = Math.ceil((diasAnuales / 12) * mesesFraccion);
    const fraccionBono     = Math.ceil((diasAnuales / 12) * mesesFraccion);

    const salarioDia    = salarioVES / 30;
    const montoDisfrute = fraccionDisfrute * salarioDia;
    const montoBono     = fraccionBono     * salarioDia;

    return {
        salarioVES, salarioDia, aniosCompletos, ultimoAniversario,
        mesesFraccion, diasAdicAnuales, diasAnuales,
        fraccionDisfrute, fraccionBono,
        montoDisfrute, montoBono,
        total: montoDisfrute + montoBono,
    };
}

// ============================================================================
// SHARED UI ATOMS
// ============================================================================

function SectionHeader({ label, color }: { label: string; color?: "primary" | "amber" }) {
    const cls = color === "amber"   ? "text-amber-500/70"
              : color === "primary" ? "text-[var(--text-link)]"
              : "text-[var(--text-tertiary)]";
    return <p className={`font-mono text-[9px] uppercase tracking-[0.2em] mb-2 pt-1 ${cls}`}>{label}</p>;
}

function CalcRow({ label, formula, value, accent, dim }: {
    label: string; formula?: string; value: string;
    accent?: "primary" | "amber"; dim?: boolean;
}) {
    const valCls = dim ? "text-[var(--text-tertiary)]"
        : accent === "primary" ? "text-primary-500"
        : accent === "amber"   ? "text-amber-500"
        : "text-foreground";
    return (
        <div className="flex items-start justify-between gap-2 py-1.5 border-b border-border-light/60 last:border-0">
            <div className="min-w-0">
                <span className="font-mono text-[11px] text-[var(--text-secondary)] leading-snug">{label}</span>
                {formula && <div className="font-mono text-[9px] text-[var(--text-tertiary)] mt-0.5 tabular-nums">{formula}</div>}
            </div>
            <span className={`font-mono text-[12px] font-bold tabular-nums shrink-0 ${valCls}`}>{value}</span>
        </div>
    );
}

function Hr() { return <div className="border-t border-border-light my-2" />; }

// ============================================================================
// RIGHT PANEL — Constancia Completa  (PDF-faithful preview)
// ============================================================================

function ConstanciaCompleta({ calc, employeeName, employeeCedula, employeeCargo,
    companyName, fechaInicio, fechaCulminacion, fechaReintegro }: {
    calc: VacCalc; employeeName: string; employeeCedula: string; employeeCargo?: string;
    companyName: string; fechaInicio: string; fechaCulminacion: string; fechaReintegro: string;
}) {
    const handlePdf = () => generateVacComplletasPdf({
        companyName, employee: { nombre: employeeName, cedula: employeeCedula, cargo: employeeCargo, anios: calc.anios },
        fechaInicio, fechaCulminacion, fechaReintegro,
        salarioVES: calc.salarioVES, salarioDia: calc.salarioDia,
        diasCalendario: calc.diasCalendario, diasHabiles: calc.diasHabiles, diasDescanso: calc.diasDescanso,
        diasDisfrute: calc.diasDisfrute, diasBono: calc.diasBono,
        montoDisfrute: calc.montoDisfrute, montoBono: calc.montoBono, total: calc.total,
    });

    const emitido = new Date().toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();

    return (
        <div className="max-w-2xl mx-auto space-y-3">
            <div className="flex justify-end">
                <button onClick={handlePdf}
                    className="flex items-center gap-2 h-8 px-4 rounded-lg bg-[#0891b2] hover:bg-[#0e7490] text-white font-mono text-[11px] uppercase tracking-[0.12em] transition-colors duration-150">
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                        <path d="M3 12h10M8 2v8m-3-3 3 3 3-3"/>
                    </svg>
                    Descargar PDF
                </button>
            </div>

            {/* Document shell — same bg as PDF page */}
            <div className="bg-[#f6f6fa] rounded-xl overflow-hidden shadow-md border border-[#dadae2]">

                {/* ── HEADER ── */}
                <div className="bg-[#12121a] px-8 py-5 relative overflow-hidden">
                    <div className="absolute left-0 top-0 w-1 bottom-0.5 bg-[#0891b2]" />
                    <div className="absolute left-1 right-0 bottom-0 h-0.5 bg-[#22d3ee]" />
                    <div className="pl-3 flex items-start justify-between gap-4">
                        <div>
                            <p className="font-mono text-[17px] font-black uppercase text-white tracking-tight leading-none">{companyName}</p>
                            <p className="font-mono text-[10px] text-[#787884] mt-1.5 uppercase tracking-[0.2em]">Constancia de Vacaciones</p>
                            <p className="font-mono text-[9px] text-[#505064] mt-0.5">Arts. 190 · 192 LOTTT — Disfrute y Bono Vacacional</p>
                        </div>
                        <div className="text-right shrink-0">
                            <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-[#787884] mb-1">Período</p>
                            <p className="font-mono text-[11px] font-bold text-white leading-snug">{formatDateES(fechaInicio)}</p>
                            <p className="font-mono text-[11px] font-bold text-white leading-snug">al {formatDateES(fechaCulminacion)}</p>
                            <p className="font-mono text-[8px] text-[#787884] mt-1.5">Emitido: {emitido}</p>
                        </div>
                    </div>
                </div>

                {/* ── EMPLOYEE CARD ── */}
                <div className="mx-6 mt-5 bg-white border border-[#dadae2] rounded relative overflow-hidden">
                    <div className="absolute left-0 top-0 bottom-0 w-0.75 bg-[#0891b2]" />
                    <div className="pl-5 pr-5 py-3 flex items-start justify-between">
                        <div>
                            <p className="font-mono text-[14px] font-black uppercase text-[#32323c] tracking-tight">{employeeName || "—"}</p>
                            {employeeCargo && <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#787884] mt-0.5">{employeeCargo}</p>}
                        </div>
                        <div className="text-right">
                            <p className="font-mono text-[12px] font-bold text-[#32323c]">CI: {employeeCedula || "—"}</p>
                            <p className="font-mono text-[9px] text-[#787884] mt-0.5">{calc.anios} año{calc.anios !== 1 ? "s" : ""} de servicio</p>
                        </div>
                    </div>
                </div>

                {/* ── PARAMS STRIP ── */}
                <div className="mx-6 mt-3 bg-[#12121a] px-5 py-3 grid grid-cols-4 gap-3">
                    {[
                        { lbl: "Salario Mensual",  val: `Bs. ${fmtN(calc.salarioVES)}`,                                      cls: "text-white" },
                        { lbl: "Salario Diario",   val: `Bs. ${fmtN(calc.salarioDia)}`,                                      cls: "text-white" },
                        { lbl: "Reintegro",        val: formatDateES(fechaReintegro).toUpperCase(),                           cls: "text-[#96c8dc]" },
                        { lbl: "Cal · Háb · Desc", val: `${calc.diasCalendario} · ${calc.diasHabiles} · ${calc.diasDescanso}`, cls: "text-white" },
                    ].map(({ lbl, val, cls }) => (
                        <div key={lbl}>
                            <p className="font-mono text-[7px] uppercase tracking-[0.18em] text-[#787884] mb-1">{lbl}</p>
                            <p className={`font-mono text-[10px] font-bold tabular-nums leading-snug ${cls}`}>{val}</p>
                        </div>
                    ))}
                </div>

                {/* ── CONCEPT TABLE ── */}
                <div className="mx-6 mt-3">
                    {/* Header row */}
                    <div className="bg-[#12121a] px-5 py-2 flex justify-between">
                        <p className="font-mono text-[7px] uppercase tracking-[0.22em] text-[#787884]">Concepto</p>
                        <div className="flex gap-10">
                            <p className="font-mono text-[7px] uppercase tracking-[0.22em] text-[#787884]">Días</p>
                            <p className="font-mono text-[7px] uppercase tracking-[0.22em] text-[#787884]">Monto</p>
                        </div>
                    </div>
                    {/* Row 1: Disfrute */}
                    <div className="bg-white px-5 py-3 flex items-start justify-between border-b border-[#dadae2]">
                        <div>
                            <p className="font-mono text-[12px] font-bold text-[#32323c]">Disfrute Vacacional</p>
                            <p className="font-mono text-[8px] text-[#787884] mt-0.5 uppercase tracking-wide">
                                Art. 190 LOTTT · 15 días base{calc.diasAdicDisfrute > 0 ? ` + ${calc.diasAdicDisfrute} adicional${calc.diasAdicDisfrute !== 1 ? "es" : ""}` : ""}
                            </p>
                        </div>
                        <div className="flex items-center gap-10 text-right shrink-0">
                            <p className="font-mono text-[11px] tabular-nums text-[#787884]">{calc.diasDisfrute} d</p>
                            <p className="font-mono text-[13px] font-black tabular-nums text-[#0891b2]">Bs. {fmtN(calc.montoDisfrute)}</p>
                        </div>
                    </div>
                    {/* Row 2: Bono */}
                    <div className="bg-[#f0f0f5] px-5 py-3 flex items-start justify-between border-b border-[#dadae2]">
                        <div>
                            <p className="font-mono text-[12px] font-bold text-[#32323c]">Bono Vacacional</p>
                            <p className="font-mono text-[8px] text-[#787884] mt-0.5 uppercase tracking-wide">
                                Art. 192 LOTTT · 15 días base{calc.diasAdicBono > 0 ? ` + ${calc.diasAdicBono} adicional${calc.diasAdicBono !== 1 ? "es" : ""}` : ""}
                            </p>
                        </div>
                        <div className="flex items-center gap-10 text-right shrink-0">
                            <p className="font-mono text-[11px] tabular-nums text-[#787884]">{calc.diasBono} d</p>
                            <p className="font-mono text-[13px] font-black tabular-nums text-[#b4780a]">Bs. {fmtN(calc.montoBono)}</p>
                        </div>
                    </div>
                    {/* Total bar */}
                    <div className="bg-[#12121a] px-5 py-3 flex items-center justify-between relative">
                        <div className="absolute left-0 top-0 bottom-0 w-0.75 bg-[#22d3ee]" />
                        <p className="pl-3 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[#787884]">
                            Total · {calc.diasDisfrute + calc.diasBono} días
                        </p>
                        <p className="font-mono text-[16px] font-black tabular-nums text-[#22d3ee]">
                            Bs. {fmtN(calc.total)}
                        </p>
                    </div>
                </div>

                {/* ── FIRMAS ── */}
                <div className="mx-6 mt-6 mb-2">
                    <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-[#32323c] font-bold mb-3">Firmas de Conformidad</p>
                    <div className="grid grid-cols-2 gap-8">
                        {["Empleador", "Trabajador"].map(role => (
                            <div key={role} className="bg-white border border-[#dadae2] rounded overflow-hidden">
                                <div className="h-0.75 w-full bg-[#787884]" />
                                <div className="px-4 pt-4 pb-3">
                                    <div className="h-8 border-b border-[#afafb9] mb-2" />
                                    <p className="font-mono text-[8px] uppercase tracking-[0.22em] text-[#787884] text-center">{role}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* ── LEGAL NOTE ── */}
                <div className="mx-6 mb-5 mt-4 pt-3 border-t border-[#dadae2]">
                    <p className="font-mono text-[8px] text-[#787884] leading-relaxed">
                        La presente constancia certifica el disfrute del período vacacional de conformidad con los Arts. 190 y 192 de la Ley Orgánica del Trabajo, los Trabajadores y las Trabajadoras (LOTTT). Las firmas de ambas partes confirman el acuerdo sobre las fechas y montos indicados.
                    </p>
                </div>

                {/* ── FOOTER ── */}
                <div className="bg-[#12121a] px-8 py-2.5 relative">
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#22d3ee]" />
                    <p className="font-mono text-[7px] text-[#505064] text-center uppercase tracking-[0.2em]">
                        {companyName.toUpperCase()} · Constancia de Vacaciones · Documento Confidencial
                    </p>
                </div>

            </div>
        </div>
    );
}

// ============================================================================
// RIGHT PANEL — Constancia Fraccionada  (PDF-faithful preview)
// ============================================================================

function ConstanciaFraccionada({ calc, employeeName, employeeCedula, employeeCargo,
    companyName, fechaIngreso, fechaEgreso }: {
    calc: VacFracCalc; employeeName: string; employeeCedula: string; employeeCargo?: string;
    companyName: string; fechaIngreso: string; fechaEgreso: string;
}) {
    const handlePdf = () => generateVacFraccionadasPdf({
        companyName, employee: { nombre: employeeName, cedula: employeeCedula, cargo: employeeCargo },
        fechaIngreso, fechaEgreso,
        ultimoAniversario: calc.ultimoAniversario,
        aniosCompletos: calc.aniosCompletos, mesesFraccion: calc.mesesFraccion, diasAnuales: calc.diasAnuales,
        salarioVES: calc.salarioVES, salarioDia: calc.salarioDia,
        fraccionDisfrute: calc.fraccionDisfrute, fraccionBono: calc.fraccionBono,
        montoDisfrute: calc.montoDisfrute, montoBono: calc.montoBono, total: calc.total,
    });

    const emitido = new Date().toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();

    return (
        <div className="max-w-2xl mx-auto space-y-3">
            <div className="flex justify-end">
                <button onClick={handlePdf}
                    className="flex items-center gap-2 h-8 px-4 rounded-lg bg-[#b4780a] hover:bg-[#92600a] text-white font-mono text-[11px] uppercase tracking-[0.12em] transition-colors duration-150">
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                        <path d="M3 12h10M8 2v8m-3-3 3 3 3-3"/>
                    </svg>
                    Descargar PDF
                </button>
            </div>

            {/* Document shell */}
            <div className="bg-[#f6f6fa] rounded-xl overflow-hidden shadow-md border border-[#dadae2]">

                {/* ── HEADER — amber accent ── */}
                <div className="bg-[#12121a] px-8 py-5 relative overflow-hidden">
                    <div className="absolute left-0 top-0 w-1 bottom-0.5 bg-[#b4780a]" />
                    <div className="absolute left-1 right-0 bottom-0 h-0.5 bg-[#fde68a]" />
                    <div className="pl-3 flex items-start justify-between gap-4">
                        <div>
                            <p className="font-mono text-[17px] font-black uppercase text-white tracking-tight leading-none">{companyName}</p>
                            <p className="font-mono text-[10px] text-[#787884] mt-1.5 uppercase tracking-[0.2em]">Constancia de Vacaciones Fraccionadas</p>
                            <p className="font-mono text-[9px] text-[#505064] mt-0.5">Art. 196 LOTTT — Porción proporcional al período trabajado</p>
                        </div>
                        <div className="text-right shrink-0">
                            <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-[#787884] mb-1">Fecha de Egreso</p>
                            <p className="font-mono text-[11px] font-bold text-white leading-snug">{formatDateES(fechaEgreso)}</p>
                            <p className="font-mono text-[8px] text-[#787884] mt-1.5">Emitido: {emitido}</p>
                        </div>
                    </div>
                </div>

                {/* ── EMPLOYEE CARD ── */}
                <div className="mx-6 mt-5 bg-white border border-[#dadae2] rounded relative overflow-hidden">
                    <div className="absolute left-0 top-0 bottom-0 w-0.75 bg-[#b4780a]" />
                    <div className="pl-5 pr-5 py-3 flex items-start justify-between">
                        <div>
                            <p className="font-mono text-[14px] font-black uppercase text-[#32323c] tracking-tight">{employeeName || "—"}</p>
                            {employeeCargo && <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#787884] mt-0.5">{employeeCargo}</p>}
                        </div>
                        <div className="text-right">
                            <p className="font-mono text-[12px] font-bold text-[#32323c]">CI: {employeeCedula || "—"}</p>
                            <p className="font-mono text-[9px] text-[#787884] mt-0.5">
                                {calc.aniosCompletos} año{calc.aniosCompletos !== 1 ? "s" : ""} completo{calc.aniosCompletos !== 1 ? "s" : ""}
                            </p>
                        </div>
                    </div>
                </div>

                {/* ── PARAMS STRIP ── */}
                <div className="mx-6 mt-3 bg-[#12121a] px-5 py-3 grid grid-cols-4 gap-3">
                    {[
                        { lbl: "Fecha de Ingreso",     val: formatDateES(fechaIngreso).toUpperCase(),       cls: "text-white" },
                        { lbl: "Último Aniversario",   val: formatDateES(calc.ultimoAniversario).toUpperCase(), cls: "text-white" },
                        { lbl: "Meses Año en Curso",   val: `${calc.mesesFraccion} mes${calc.mesesFraccion !== 1 ? "es" : ""}`, cls: "text-[#96c8dc]" },
                        { lbl: "Días Anuales Base",    val: `${calc.diasAnuales} días`,                     cls: "text-white" },
                    ].map(({ lbl, val, cls }) => (
                        <div key={lbl}>
                            <p className="font-mono text-[7px] uppercase tracking-[0.18em] text-[#787884] mb-1">{lbl}</p>
                            <p className={`font-mono text-[10px] font-bold tabular-nums leading-snug ${cls}`}>{val}</p>
                        </div>
                    ))}
                </div>

                {/* ── FÓRMULA BOX ── */}
                <div className="mx-6 mt-3 bg-[#f0f0f5] border border-[#dadae2] px-5 py-2.5 rounded">
                    <p className="font-mono text-[8px] text-[#787884] uppercase tracking-widest mb-0.5">Fórmula (Art. 196)</p>
                    <p className="font-mono text-[11px] font-bold text-[#32323c]">
                        ⌈ {calc.diasAnuales} días / 12 meses × {calc.mesesFraccion} meses ⌉ = {calc.fraccionDisfrute} días
                    </p>
                </div>

                {/* ── CONCEPT TABLE ── */}
                <div className="mx-6 mt-3">
                    {/* Header row */}
                    <div className="bg-[#12121a] px-5 py-2 flex justify-between">
                        <p className="font-mono text-[7px] uppercase tracking-[0.22em] text-[#787884]">Concepto</p>
                        <div className="flex gap-10">
                            <p className="font-mono text-[7px] uppercase tracking-[0.22em] text-[#787884]">Días</p>
                            <p className="font-mono text-[7px] uppercase tracking-[0.22em] text-[#787884]">Monto</p>
                        </div>
                    </div>
                    {/* Row 1: Disfrute Fraccionado */}
                    <div className="bg-white px-5 py-3 flex items-start justify-between border-b border-[#dadae2]">
                        <div>
                            <p className="font-mono text-[12px] font-bold text-[#32323c]">Disfrute Fraccionado</p>
                            <p className="font-mono text-[8px] text-[#787884] mt-0.5 uppercase tracking-wide">
                                Art. 190 + 196 LOTTT · {calc.diasAnuales}d/12 × {calc.mesesFraccion} meses
                            </p>
                        </div>
                        <div className="flex items-center gap-10 text-right shrink-0">
                            <p className="font-mono text-[11px] tabular-nums text-[#787884]">{calc.fraccionDisfrute} d</p>
                            <p className="font-mono text-[13px] font-black tabular-nums text-[#b4780a]">Bs. {fmtN(calc.montoDisfrute)}</p>
                        </div>
                    </div>
                    {/* Row 2: Bono Fraccionado */}
                    <div className="bg-[#f0f0f5] px-5 py-3 flex items-start justify-between border-b border-[#dadae2]">
                        <div>
                            <p className="font-mono text-[12px] font-bold text-[#32323c]">Bono Vacacional Fraccionado</p>
                            <p className="font-mono text-[8px] text-[#787884] mt-0.5 uppercase tracking-wide">
                                Art. 192 + 196 LOTTT · {calc.diasAnuales}d/12 × {calc.mesesFraccion} meses
                            </p>
                        </div>
                        <div className="flex items-center gap-10 text-right shrink-0">
                            <p className="font-mono text-[11px] tabular-nums text-[#787884]">{calc.fraccionBono} d</p>
                            <p className="font-mono text-[13px] font-black tabular-nums text-[#b4780a]">Bs. {fmtN(calc.montoBono)}</p>
                        </div>
                    </div>
                    {/* Total bar — amber accent */}
                    <div className="bg-[#12121a] px-5 py-3 flex items-center justify-between relative">
                        <div className="absolute left-0 top-0 bottom-0 w-0.75 bg-[#fde68a]" />
                        <p className="pl-3 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[#787884]">
                            Total Fraccionado · {calc.fraccionDisfrute + calc.fraccionBono} días
                        </p>
                        <p className="font-mono text-[16px] font-black tabular-nums text-[#fde68a]">
                            Bs. {fmtN(calc.total)}
                        </p>
                    </div>
                </div>

                {/* ── SALARY STRIP ── */}
                <div className="mx-6 mt-3 bg-[#f0f0f5] border border-[#dadae2] px-5 py-2.5 rounded flex gap-8">
                    {[
                        { lbl: "Salario Mensual", val: `Bs. ${fmtN(calc.salarioVES)}` },
                        { lbl: "Salario Diario",  val: `Bs. ${fmtN(calc.salarioDia)} / día` },
                    ].map(({ lbl, val }) => (
                        <div key={lbl}>
                            <p className="font-mono text-[7px] uppercase tracking-[0.18em] text-[#787884] mb-0.5">{lbl}</p>
                            <p className="font-mono text-[11px] font-bold tabular-nums text-[#32323c]">{val}</p>
                        </div>
                    ))}
                </div>

                {/* ── FIRMAS ── */}
                <div className="mx-6 mt-6 mb-2">
                    <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-[#32323c] font-bold mb-3">Firmas de Conformidad</p>
                    <div className="grid grid-cols-2 gap-8">
                        {["Empleador", "Trabajador"].map(role => (
                            <div key={role} className="bg-white border border-[#dadae2] rounded overflow-hidden">
                                <div className="h-0.75 w-full bg-[#787884]" />
                                <div className="px-4 pt-4 pb-3">
                                    <div className="h-8 border-b border-[#afafb9] mb-2" />
                                    <p className="font-mono text-[8px] uppercase tracking-[0.22em] text-[#787884] text-center">{role}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* ── LEGAL NOTE ── */}
                <div className="mx-6 mb-5 mt-4 pt-3 border-t border-[#dadae2]">
                    <p className="font-mono text-[8px] text-[#787884] leading-relaxed">
                        La presente constancia certifica el pago de las vacaciones fraccionadas de conformidad con el Art. 196 de la Ley Orgánica del Trabajo, los Trabajadores y las Trabajadoras (LOTTT), correspondientes a la fracción del año de servicio no cubierta por el período completo. El cálculo se realiza sobre el salario normal (no integral) del trabajador.
                    </p>
                </div>

                {/* ── FOOTER ── */}
                <div className="bg-[#12121a] px-8 py-2.5 relative">
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#fde68a]" />
                    <p className="font-mono text-[7px] text-[#505064] text-center uppercase tracking-[0.2em]">
                        {companyName.toUpperCase()} · Constancia de Vacaciones Fraccionadas · Documento Confidencial
                    </p>
                </div>

            </div>
        </div>
    );
}

// ============================================================================
// SHARED LEFT PANEL — Employee + BCV inputs
// ============================================================================

function EmployeeSection({ employees, loading, selectedCedula, onSelect, selectedEmp,
    salarioOverride, setSalarioOverride, manualIngreso, setManualIngreso }: {
    employees: Employee[]; loading: boolean; selectedCedula: string; onSelect: (v: string) => void;
    selectedEmp?: Employee;
    salarioOverride: string; setSalarioOverride: (v: string) => void;
    manualIngreso: string; setManualIngreso: (v: string) => void;
}) {
    return (
        <div className="px-5 py-4 space-y-3 border-b border-border-light">
            <SectionHeader label="Empleado" />
            {!loading && employees.length > 0 && (
                <div>
                    <label className={labelCls}>Seleccionar</label>
                    <select value={selectedCedula} onChange={e => onSelect(e.target.value)} className={fieldCls}>
                        <option value="">— Manual —</option>
                        {employees.filter(e => e.estado === "activo").map(e => (
                            <option key={e.cedula} value={e.cedula}>{e.nombre}</option>
                        ))}
                    </select>
                </div>
            )}
            {selectedEmp && (
                <div className="px-3 py-2 rounded-lg border border-border-light bg-surface-2 space-y-1">
                    {[
                        { k: "Cédula",        v: selectedEmp.cedula },
                        { k: "Cargo",         v: selectedEmp.cargo || "—" },
                        { k: "Fecha ingreso", v: selectedEmp.fechaIngreso ?? "—" },
                    ].map(({ k, v }) => (
                        <div key={k} className="flex justify-between font-mono text-[10px]">
                            <span className="text-[var(--text-tertiary)]">{k}</span>
                            <span className="text-foreground tabular-nums">{v}</span>
                        </div>
                    ))}
                </div>
            )}
            {/* Salario siempre editable */}
            <div>
                <label className={labelCls}>
                    Salario mensual (Bs.)
                    {selectedEmp && <span className="ml-1 text-[var(--text-link)]">— editable</span>}
                </label>
                <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[12px] text-[var(--text-tertiary)] pointer-events-none select-none">Bs.</span>
                    <input type="number" step="0.01" min="0" value={salarioOverride}
                        onChange={e => setSalarioOverride(e.target.value)} placeholder="0.00"
                        className={fieldCls + " pl-9 text-right"} />
                </div>
                {selectedEmp?.moneda === "USD" && (
                    <p className="font-mono text-[9px] text-[var(--text-disabled)] mt-1">
                        Pre-cargado desde USD (convertido con tasa BCV)
                    </p>
                )}
            </div>
            {!selectedEmp && (
                <div>
                    <label className={labelCls}>Fecha de ingreso</label>
                    <input type="date" value={manualIngreso}
                        onChange={e => setManualIngreso(e.target.value)} className={fieldCls} />
                    <p className="font-mono text-[9px] text-[var(--text-disabled)] mt-1">Para calcular años de servicio y días adicionales</p>
                </div>
            )}
        </div>
    );
}

// ============================================================================
// PAGE
// ============================================================================

type Mode = "completas" | "fraccionadas";

export default function VacacionesPage() {
    const { companyId, company } = useCompany();
    const { employees, loading } = useEmployee(companyId);

    // ── Mode ────────────────────────────────────────────────────────────────
    const [mode, setMode] = useState<Mode>("completas");

    // ── Employee ────────────────────────────────────────────────────────────
    const [selectedCedula, setSelectedCedula] = useState<string>("");
    const selectedEmp = useMemo<Employee | undefined>(
        () => employees.find(e => e.cedula === selectedCedula),
        [employees, selectedCedula],
    );
    const [salarioOverride, setSalarioOverride] = useState("");
    const [manualIngreso,   setManualIngreso]   = useState("");

    // ── BCV ─────────────────────────────────────────────────────────────────
    const [bcvRate,    setBcvRate]    = useState(0);
    const [bcvLoading, setBcvLoading] = useState(true);
    const [bcvError,   setBcvError]   = useState<string | null>(null);

    useEffect(() => {
        fetch(`/api/bcv/rate?date=${isoToday()}`)
            .then(r => r.json())
            .then(data => { if (data.rate) { setBcvRate(data.rate); setBcvError(null); } else setBcvError("No disponible"); })
            .catch(() => setBcvError("Error al obtener tasa"))
            .finally(() => setBcvLoading(false));
    }, []);

    // Auto-populate salarioOverride from employee (overridable by user)
    useEffect(() => {
        if (selectedEmp) {
            const ves = selectedEmp.moneda === "USD"
                ? selectedEmp.salarioMensual * bcvRate
                : selectedEmp.salarioMensual;
            setSalarioOverride(ves.toFixed(2));
        } else {
            setSalarioOverride("");
        }
    }, [selectedEmp, bcvRate]);

    // ── Derived ─────────────────────────────────────────────────────────────
    const salarioVES = parseFloat(salarioOverride) || 0;

    const fechaIngreso = selectedEmp?.fechaIngreso ?? manualIngreso;

    // ── COMPLETAS state ──────────────────────────────────────────────────────
    const todayStr = isoToday();
    const [fechaInicio,      setFechaInicio]      = useState(todayStr);
    const [fechaCulminacion, setFechaCulminacion] = useState("");
    const [fechaReintegro,   setFechaReintegro]   = useState("");
    const [userEditedCulm,   setUserEditedCulm]   = useState(false);
    const [userEditedReint,  setUserEditedReint]  = useState(false);

    const diasLegal = useMemo(() => {
        const anios = calcAniosAt(fechaIngreso, fechaInicio);
        return 15 + (anios >= 2 ? Math.min(anios - 1, 15) : 0);
    }, [fechaIngreso, fechaInicio]);

    useEffect(() => {
        if (userEditedCulm) return;
        const culm = calculateCulminacion(fechaInicio, diasLegal);
        setFechaCulminacion(culm);
        if (!userEditedReint) setFechaReintegro(nextWorkingDay(culm));
    }, [fechaInicio, diasLegal, userEditedCulm, userEditedReint]);

    const handleInicioChange = (val: string) => {
        setFechaInicio(val);
        setUserEditedCulm(false);
        setUserEditedReint(false);
    };

    const handleCulminacionChange = (val: string) => {
        setFechaCulminacion(val);
        setUserEditedCulm(true);
        if (!userEditedReint) setFechaReintegro(nextWorkingDay(val));
    };

    const periodStats = useMemo(() => getPeriodStats(fechaInicio, fechaCulminacion), [fechaInicio, fechaCulminacion]);
    const diasCal     = getDiasCalendario(fechaInicio, fechaCulminacion);

    const calcCompletas = useMemo(
        () => computeVac(salarioVES, fechaIngreso, fechaInicio, fechaCulminacion),
        [salarioVES, fechaIngreso, fechaInicio, fechaCulminacion],
    );

    // ── FRACCIONADAS state ───────────────────────────────────────────────────
    const [fechaEgreso, setFechaEgreso] = useState(todayStr);

    const calcFrac = useMemo(
        () => computeVacFrac(salarioVES, fechaIngreso, fechaEgreso),
        [salarioVES, fechaIngreso, fechaEgreso],
    );

    // ── Mode toggle button classes ───────────────────────────────────────────
    const modeBtnCls = (m: Mode) => [
        "flex-1 h-8 rounded-lg font-mono text-[10px] uppercase tracking-[0.14em] border transition-colors duration-150",
        mode === m
            ? "bg-primary-500 border-primary-600 text-white"
            : "bg-surface-1 border-border-light text-[var(--text-secondary)] hover:border-border-medium hover:text-foreground",
    ].join(" ");

    return (
        <div className="min-h-full bg-surface-2 flex flex-col lg:flex-row overflow-hidden">

            {/* ══ LEFT PANEL ══════════════════════════════════════════════ */}
            <aside className="w-full lg:w-96 shrink-0 flex flex-col border-b lg:border-b-0 lg:border-r border-border-light bg-surface-1 overflow-y-auto">

                {/* Header + mode toggle */}
                <div className="px-5 py-4 border-b border-border-light space-y-3">
                    <div>
                        <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--text-tertiary)] mb-0.5">Nómina · Vacaciones</p>
                        <p className="font-mono text-[14px] font-black uppercase tracking-tight text-foreground leading-none">Calculadora</p>
                        <p className="font-mono text-[9px] text-[var(--text-tertiary)] mt-1">Arts. 190 · 192 · 196 LOTTT</p>
                    </div>
                    <div className="flex gap-1.5">
                        <button onClick={() => setMode("completas")}    className={modeBtnCls("completas")}>Completas</button>
                        <button onClick={() => setMode("fraccionadas")} className={modeBtnCls("fraccionadas")}>Fraccionadas</button>
                    </div>
                </div>

                <div className="flex-1 divide-y divide-border-light">

                    {/* ── Empleado (shared) ──────────────────────────────── */}
                    <EmployeeSection
                        employees={employees} loading={loading}
                        selectedCedula={selectedCedula} onSelect={setSelectedCedula}
                        selectedEmp={selectedEmp}
                        salarioOverride={salarioOverride} setSalarioOverride={setSalarioOverride}
                        manualIngreso={manualIngreso} setManualIngreso={setManualIngreso}
                    />

                    {/* ── Tasa BCV (shared) ──────────────────────────────── */}
                    <div className="px-5 py-4">
                        <SectionHeader label="Tasa BCV (auto)" />
                        {bcvLoading ? (
                            <div className="flex items-center gap-2 text-[var(--text-tertiary)]">
                                <svg className="animate-spin" width="11" height="11" viewBox="0 0 12 12" fill="none">
                                    <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3" />
                                    <path d="M11 6A5 5 0 0 0 6 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                </svg>
                                <span className="font-mono text-[11px]">Consultando BCV…</span>
                            </div>
                        ) : bcvError ? (
                            <div className="space-y-2">
                                <p className="font-mono text-[10px] text-red-500">{bcvError}</p>
                                <input type="number" step="0.01" value={bcvRate || ""}
                                    onChange={e => setBcvRate(parseFloat(e.target.value) || 0)}
                                    placeholder="Ingresar tasa manualmente"
                                    className={fieldCls + " text-right"} />
                            </div>
                        ) : (
                            <div className="flex items-baseline gap-2">
                                <span className="font-mono text-[18px] font-black tabular-nums text-foreground">{fmtN(bcvRate)}</span>
                                <span className="font-mono text-[10px] text-[var(--text-tertiary)]">Bs. / USD</span>
                                <span className="ml-auto font-mono text-[8px] text-[var(--text-link)] bg-primary-500/8 px-2 py-0.5 rounded">BCV HOY</span>
                            </div>
                        )}
                    </div>

                    {/* ══ MODE: COMPLETAS ════════════════════════════════════ */}
                    {mode === "completas" && (<>

                        {/* Período */}
                        <div className="px-5 py-4 space-y-3">
                            <SectionHeader label="Período de Vacaciones" />
                            <div>
                                <label className={labelCls}>Fecha de inicio</label>
                                <input type="date" value={fechaInicio}
                                    onChange={e => handleInicioChange(e.target.value)} className={fieldCls} />
                            </div>
                            <div>
                                <label className={labelCls}>Fecha de culminación</label>
                                <input type="date" value={fechaCulminacion} min={fechaInicio}
                                    onChange={e => handleCulminacionChange(e.target.value)} className={fieldCls} />
                                {!userEditedCulm && (
                                    <p className="font-mono text-[9px] text-[var(--text-disabled)] mt-1">
                                        Auto: {diasLegal} días hábiles desde el inicio
                                    </p>
                                )}
                            </div>
                            <div>
                                <label className={labelCls}>Fecha de reintegro</label>
                                <input type="date" value={fechaReintegro}
                                    min={fechaCulminacion ? addCalDays(fechaCulminacion, 1) : undefined}
                                    onChange={e => { setFechaReintegro(e.target.value); setUserEditedReint(true); }}
                                    className={fieldCls} />
                                {!userEditedReint && (
                                    <p className="font-mono text-[9px] text-[var(--text-disabled)] mt-1">Auto: primer día hábil tras culminación</p>
                                )}
                            </div>
                            {diasCal > 0 && (
                                <div className="grid grid-cols-3 gap-2 pt-1">
                                    {[
                                        { label: "Calendario", val: diasCal,              cls: "text-foreground" },
                                        { label: "Hábiles",    val: periodStats.habiles,  cls: "text-primary-500" },
                                        { label: "Descanso",   val: periodStats.descanso, cls: "text-[var(--text-tertiary)]" },
                                    ].map(({ label, val, cls }) => (
                                        <div key={label} className="rounded-lg border border-border-light bg-surface-2 px-3 py-2 text-center">
                                            <p className={`font-mono text-[17px] font-black tabular-nums ${cls}`}>{val}</p>
                                            <p className="font-mono text-[7px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">{label}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {periodStats.feriadoList.length > 0 && (
                                <div className="px-3 py-2 rounded-lg border border-primary-500/20 bg-primary-500/4 space-y-0.5">
                                    <p className="font-mono text-[8px] uppercase tracking-[0.18em] text-[var(--text-link)] mb-1">Feriados en el período</p>
                                    {periodStats.feriadoList.map(f => <p key={f} className="font-mono text-[9px] text-[var(--text-secondary)]">{f}</p>)}
                                </div>
                            )}
                        </div>

                        {/* Cálculo completas */}
                        <div className="px-5 py-4 space-y-0.5">
                            <SectionHeader label="Cálculo" />
                            {calcCompletas ? (<>
                                <CalcRow label="Salario mensual" value={fmt(calcCompletas.salarioVES)} dim />
                                <CalcRow label="Salario diario" formula="salario ÷ 30"
                                    value={`${fmtN(calcCompletas.salarioDia)} Bs./día`} dim />
                                <CalcRow label="Años de servicio"
                                    formula={fechaIngreso ? `desde ${fechaIngreso}` : "sin fecha de ingreso"}
                                    value={calcCompletas.anios > 0 ? `${calcCompletas.anios} año${calcCompletas.anios !== 1 ? "s" : ""}` : "< 1 año"} dim />
                                <Hr />
                                <SectionHeader label="Art. 190 — Disfrute Vacacional" color="primary" />
                                <CalcRow label="Días base"           value="15 días hábiles" dim />
                                <CalcRow label="Días adicionales"
                                    formula={calcCompletas.anios >= 2 ? `+1d/año desde año 2 = +${calcCompletas.diasAdicDisfrute}d` : "aplica desde el año 2"}
                                    value={`${calcCompletas.diasAdicDisfrute} días`} dim />
                                <CalcRow label="Total legal"
                                    formula={`15 + ${calcCompletas.diasAdicDisfrute} = ${calcCompletas.diasLegalDisfrute}d`}
                                    value={`${calcCompletas.diasLegalDisfrute} días hábiles`} dim />
                                {calcCompletas.diasDisfrute > calcCompletas.diasLegalDisfrute && (
                                    <CalcRow label="Hábiles reales (mayor)" formula="se usa este valor"
                                        value={`${calcCompletas.diasHabiles} días`} dim />
                                )}
                                <CalcRow label="Monto disfrute"
                                    formula={`${calcCompletas.diasDisfrute}d × ${fmtN(calcCompletas.salarioDia)} Bs./día`}
                                    value={fmt(calcCompletas.montoDisfrute)} accent="primary" />
                                <Hr />
                                <SectionHeader label="Art. 192 — Bono Vacacional" color="amber" />
                                <CalcRow label="Días base"           value="15 días" dim />
                                <CalcRow label="Días adicionales"
                                    formula={calcCompletas.anios >= 2 ? `+1d/año desde año 2 = +${calcCompletas.diasAdicBono}d` : "aplica desde el año 2"}
                                    value={`${calcCompletas.diasAdicBono} días`} dim />
                                <CalcRow label="Total bono"
                                    formula={`15 + ${calcCompletas.diasAdicBono} = ${calcCompletas.diasBono}d`}
                                    value={`${calcCompletas.diasBono} días`} dim />
                                <CalcRow label="Monto bono"
                                    formula={`${calcCompletas.diasBono}d × ${fmtN(calcCompletas.salarioDia)} Bs./día`}
                                    value={fmt(calcCompletas.montoBono)} accent="amber" />
                                <Hr />
                                <div className="flex items-baseline justify-between pt-1">
                                    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-secondary)]">Total</span>
                                    <span className="font-mono text-[20px] font-black tabular-nums text-primary-500">{fmt(calcCompletas.total)}</span>
                                </div>
                            </>) : (
                                <p className="font-mono text-[10px] text-[var(--text-tertiary)]">
                                    {salarioVES <= 0 ? "Ingresa el salario del empleado." : "Selecciona las fechas de vacaciones."}
                                </p>
                            )}
                        </div>
                    </>)}

                    {/* ══ MODE: FRACCIONADAS ═════════════════════════════════ */}
                    {mode === "fraccionadas" && (<>

                        {/* Fecha de egreso */}
                        <div className="px-5 py-4 space-y-3">
                            <SectionHeader label="Fecha de Egreso" />
                            <div>
                                <label className={labelCls}>Fecha de egreso (salida)</label>
                                <input type="date" value={fechaEgreso}
                                    onChange={e => setFechaEgreso(e.target.value)} className={fieldCls} />
                                <p className="font-mono text-[9px] text-[var(--text-disabled)] mt-1">
                                    Fecha efectiva de retiro o cálculo proporcional
                                </p>
                            </div>
                            {calcFrac && (
                                <div className="px-3 py-2.5 rounded-lg border border-amber-500/20 bg-amber-500/4 space-y-1.5">
                                    {[
                                        { k: "Años completos",      v: `${calcFrac.aniosCompletos} año${calcFrac.aniosCompletos !== 1 ? "s" : ""}` },
                                        { k: "Último aniversario",  v: calcFrac.ultimoAniversario },
                                        { k: "Meses en año actual", v: `${calcFrac.mesesFraccion} mes${calcFrac.mesesFraccion !== 1 ? "es" : ""}` },
                                        { k: "Días anuales base",   v: `${calcFrac.diasAnuales} días (año ${calcFrac.aniosCompletos + 1})` },
                                    ].map(({ k, v }) => (
                                        <div key={k} className="flex justify-between font-mono text-[10px]">
                                            <span className="text-[var(--text-tertiary)]">{k}</span>
                                            <span className="text-amber-500 tabular-nums font-medium">{v}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                        </div>

                        {/* Cálculo fraccionadas */}
                        <div className="px-5 py-4 space-y-0.5">
                            <SectionHeader label="Cálculo — Art. 196 LOTTT" />
                            {calcFrac ? (<>
                                <CalcRow label="Salario mensual" value={fmt(calcFrac.salarioVES)} dim />
                                <CalcRow label="Salario diario" formula="salario ÷ 30"
                                    value={`${fmtN(calcFrac.salarioDia)} Bs./día`} dim />
                                <Hr />
                                <SectionHeader label="Días anuales del año en curso" color="amber" />
                                <CalcRow label="Días base"
                                    value="15 días" dim />
                                <CalcRow label="Días adicionales"
                                    formula={`1 día × ${calcFrac.diasAdicAnuales} años completos`}
                                    value={`${calcFrac.diasAdicAnuales} días`} dim />
                                <CalcRow label="Total anual"
                                    formula={`15 + ${calcFrac.diasAdicAnuales} = ${calcFrac.diasAnuales} días`}
                                    value={`${calcFrac.diasAnuales} días`} dim />
                                <Hr />
                                <SectionHeader label="Fracción proporcional (Art. 196)" color="primary" />
                                <CalcRow label="Fórmula"
                                    formula={`⌈ ${calcFrac.diasAnuales}d / 12 × ${calcFrac.mesesFraccion} meses ⌉`}
                                    value={`${calcFrac.fraccionDisfrute} días`} dim />
                                <CalcRow label="Monto disfrute fraccionado"
                                    formula={`${calcFrac.fraccionDisfrute}d × ${fmtN(calcFrac.salarioDia)} Bs./día`}
                                    value={fmt(calcFrac.montoDisfrute)} accent="amber" />
                                <CalcRow label="Monto bono fraccionado"
                                    formula={`${calcFrac.fraccionBono}d × ${fmtN(calcFrac.salarioDia)} Bs./día`}
                                    value={fmt(calcFrac.montoBono)} accent="amber" />
                                <Hr />
                                <div className="flex items-baseline justify-between pt-1">
                                    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-secondary)]">Total fraccionado</span>
                                    <span className="font-mono text-[20px] font-black tabular-nums text-amber-500">{fmt(calcFrac.total)}</span>
                                </div>
                            </>) : (
                                <p className="font-mono text-[10px] text-[var(--text-tertiary)]">
                                    {salarioVES <= 0
                                        ? "Ingresa el salario del empleado."
                                        : !fechaIngreso
                                        ? "Ingresa la fecha de ingreso."
                                        : "Verifica las fechas ingresadas."}
                                </p>
                            )}
                        </div>
                    </>)}
                </div>
            </aside>

            {/* ══ RIGHT PANEL ═════════════════════════════════════════════ */}
            <main className="flex-1 overflow-y-auto p-6">
                {mode === "completas" ? (
                    calcCompletas ? (
                        <ConstanciaCompleta
                            calc={calcCompletas}
                            employeeName={selectedEmp?.nombre ?? "Empleado"}
                            employeeCedula={selectedEmp?.cedula ?? "—"}
                            employeeCargo={selectedEmp?.cargo}
                            companyName={company?.name ?? "La Empresa"}
                            fechaInicio={fechaInicio}
                            fechaCulminacion={fechaCulminacion}
                            fechaReintegro={fechaReintegro}
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full gap-3 text-[var(--text-disabled)]">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.8">
                                <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
                            </svg>
                            <p className="font-mono text-[12px] uppercase tracking-widest">Ingresa los datos del empleado</p>
                        </div>
                    )
                ) : (
                    calcFrac ? (
                        <ConstanciaFraccionada
                            calc={calcFrac}
                            employeeName={selectedEmp?.nombre ?? "Empleado"}
                            employeeCedula={selectedEmp?.cedula ?? "—"}
                            employeeCargo={selectedEmp?.cargo}
                            companyName={company?.name ?? "La Empresa"}
                            fechaIngreso={fechaIngreso}
                            fechaEgreso={fechaEgreso}
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full gap-3 text-[var(--text-disabled)]">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.8">
                                <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
                            </svg>
                            <p className="font-mono text-[12px] uppercase tracking-widest">Ingresa los datos del empleado y la fecha de egreso</p>
                        </div>
                    )
                )}
            </main>
        </div>
    );
}
