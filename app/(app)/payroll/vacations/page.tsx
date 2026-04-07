"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { 
    FileText, 
    Download, 
    Users, 
    Calendar, 
    ClipboardCheck, 
    ChevronDown, 
    RefreshCw, 
    TrendingUp, 
    Info 
} from "lucide-react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
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
    "font-mono text-[13px] text-foreground tabular-nums appearance-none",
    "focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150",
].join(" ");

const labelCls = "font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] mb-1.5 block";

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
    const b = new Date(refDate + "T00:00:00");
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
        const wd = cur.getDay();
        const iso = cur.toISOString().split("T")[0];
        if (wd !== 0 && wd !== 6 && !holidays.has(iso)) counted++;
        if (counted < diasHabilesNeeded) cur.setDate(cur.getDate() + 1);
    }
    return cur.toISOString().split("T")[0];
}

function getDiasCalendario(inicio: string, fin: string): number {
    if (!inicio || !fin || inicio > fin) return 0;
    const a = new Date(inicio + "T00:00:00");
    const b = new Date(fin + "T00:00:00");
    return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
}

interface PeriodStats { habiles: number; descanso: number; feriadoList: string[]; }
function getPeriodStats(inicio: string, culminacion: string): PeriodStats {
    if (!inicio || !culminacion || inicio > culminacion) return { habiles: 0, descanso: 0, feriadoList: [] };
    const holidays = getHolidaysInRange(inicio, culminacion);
    const holSet = new Set(holidays.map(h => h.date));
    let habiles = 0, descanso = 0;
    const cur = new Date(inicio + "T00:00:00");
    const end = new Date(culminacion + "T00:00:00");
    while (cur <= end) {
        const wd = cur.getDay();
        const iso = cur.toISOString().split("T")[0];
        if (wd === 0 || wd === 6 || holSet.has(iso)) { descanso++; } else { habiles++; }
        cur.setDate(cur.getDate() + 1);
    }
    return { habiles, descanso, feriadoList: holidays.map(h => h.name) };
}

function formatDateES(iso: string): string {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
        "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
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
    diasLegalBono: number; diasBono: number; diasAdicBono: number; montoBono: number;
    total: number;
}

function computeVac(salarioVES: number, fechaIngreso: string, fechaInicio: string, fechaCulminacion: string): VacCalc | null {
    if (!fechaInicio || !fechaCulminacion || fechaInicio > fechaCulminacion || salarioVES <= 0) return null;
    const { habiles, descanso, feriadoList } = getPeriodStats(fechaInicio, fechaCulminacion);
    const diasCalendario = getDiasCalendario(fechaInicio, fechaCulminacion);
    const anios = calcAniosAt(fechaIngreso, fechaInicio);
    const diasAdicDisfrute = anios >= 2 ? Math.min(anios - 1, 15) : 0;
    const diasLegalDisfrute = 15 + diasAdicDisfrute;
    const diasDisfrute = Math.max(diasLegalDisfrute, habiles);
    const diasAdicBono = anios >= 2 ? Math.min(anios - 1, 15) : 0;
    const diasLegalBono = 15 + diasAdicBono;
    const diasBono = diasLegalBono;
    const salarioDia = salarioVES / 30;
    return {
        diasCalendario, diasHabiles: habiles, diasDescanso: descanso, feriadoList,
        salarioVES, salarioDia, anios,
        diasLegalDisfrute, diasDisfrute, diasAdicDisfrute, montoDisfrute: diasDisfrute * salarioDia,
        diasLegalBono, diasBono, diasAdicBono, montoBono: diasBono * salarioDia,
        total: (diasDisfrute + diasBono) * salarioDia,
    };
}

// ── Vacaciones fraccionadas (Art. 196 LOTTT) ─────────────────────────────────

interface VacFracCalc {
    salarioVES: number;
    salarioDia: number;
    aniosCompletos: number;
    ultimoAniversario: string;
    mesesFraccion: number;
    // Entitlement for the current partial year
    diasAdicAnuales: number;   // adicionales: min(aniosCompletos, 15)
    diasAnuales: number;   // 15 + diasAdicAnuales
    // Fractional result
    fraccionDisfrute: number;   // ceil(diasAnuales / 12 × meses)
    fraccionBono: number;   // mismo
    montoDisfrute: number;
    montoBono: number;
    total: number;
}

function computeVacFrac(salarioVES: number, fechaIngreso: string, fechaEgreso: string): VacFracCalc | null {
    if (!fechaIngreso || !fechaEgreso || salarioVES <= 0) return null;
    if (fechaEgreso <= fechaIngreso) return null;

    // Complete years at egreso
    const aniosCompletos = calcAniosAt(fechaIngreso, fechaEgreso);
    const ultimoAniversario = aniosCompletos > 0
        ? getAniversario(fechaIngreso, aniosCompletos)
        : fechaIngreso;

    // Months worked in the current partial year (from last anniversary to egreso)
    const mesesFraccion = getMesesCompletos(ultimoAniversario, fechaEgreso);

    // Annual entitlement for the year being prorated
    // Art. 196: proportional to what they'd earn at end of current year
    // Art. 190: year N+1 gives 15 + N adicionales (where N = aniosCompletos)
    const diasAdicAnuales = Math.min(aniosCompletos, 15);
    const diasAnuales = 15 + diasAdicAnuales;

    // Fracción (Art. 196): ceil(diasAnuales / 12 × mesesCompletos)
    const fraccionDisfrute = Math.ceil((diasAnuales / 12) * mesesFraccion);
    const fraccionBono = Math.ceil((diasAnuales / 12) * mesesFraccion);

    const salarioDia = salarioVES / 30;
    const montoDisfrute = fraccionDisfrute * salarioDia;
    const montoBono = fraccionBono * salarioDia;

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

function SectionHeader({ label, color }: { label: string; color?: "green" | "amber" }) {
    const cls = color === "amber" ? "text-amber-500/70"
              : color === "green" ? "text-emerald-500/70"
              : "text-[var(--text-tertiary)]";
    return <p className={`font-mono text-[11px] uppercase tracking-[0.2em] mb-2 pt-1 ${cls}`}>{label}</p>;
}

function CalcRow({ label, formula, value, accent, dim }: {
    label: string; formula?: string; value: string;
    accent?: "green" | "amber"; dim?: boolean;
}) {
    const valCls = dim ? "text-[var(--text-tertiary)]"
        : accent === "green"  ? "text-emerald-500"
        : accent === "amber"  ? "text-amber-500"
        : "text-foreground";
    return (
        <div className="flex items-start justify-between gap-2 py-1.5 border-b border-border-light/60 last:border-0">
            <div className="min-w-0">
                <span className="font-mono text-[13px] text-[var(--text-secondary)] leading-snug">{label}</span>
                {formula && <div className="font-mono text-[12px] text-[var(--text-tertiary)] mt-0.5 tabular-nums">{formula}</div>}
            </div>
            <span className={`font-mono text-[13px] font-bold tabular-nums shrink-0 ${valCls}`}>{value}</span>
        </div>
    );
}

function Hr() { return <div className="border-t border-border-light my-2" />; }

// ============================================================================
// RIGHT PANEL — Constancia Completa  (PDF-faithful preview)
// ============================================================================

function ConstanciaCompleta({ calc, employeeName, employeeCedula, employeeCargo,
    companyName, companyLogoUrl, showLogoInPdf, fechaInicio, fechaCulminacion, fechaReintegro }: {
        calc: VacCalc; employeeName: string; employeeCedula: string; employeeCargo?: string;
        companyName: string; companyLogoUrl?: string; showLogoInPdf?: boolean;
        fechaInicio: string; fechaCulminacion: string; fechaReintegro: string;
    }) {
    const handlePdf = () => generateVacComplletasPdf({
        companyName, employee: { nombre: employeeName, cedula: employeeCedula, cargo: employeeCargo, anios: calc.anios },
        fechaInicio, fechaCulminacion, fechaReintegro,
        salarioVES: calc.salarioVES, salarioDia: calc.salarioDia,
        diasCalendario: calc.diasCalendario, diasHabiles: calc.diasHabiles, diasDescanso: calc.diasDescanso,
        diasDisfrute: calc.diasDisfrute, diasBono: calc.diasBono,
        montoDisfrute: calc.montoDisfrute, montoBono: calc.montoBono, total: calc.total,
        logoUrl: companyLogoUrl, showLogoInPdf,
    });

    const emitido = new Date().toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();

    return (
        <div className="max-w-2xl mx-auto space-y-3">
            <div className="flex justify-end">
                <BaseButton.Root
                    variant="primary"
                    size="sm"
                    onClick={handlePdf}
                    leftIcon={<FileText size={14} />}
                >
                    Descargar PDF
                </BaseButton.Root>
            </div>

            {/* Document shell — same bg as PDF page */}
            <div className="bg-[#f6f6fa] rounded-xl overflow-hidden shadow-md border border-[#dadae2]">

                {/* ── HEADER ── */}
                <div className="bg-[#12121a] px-8 py-5 relative overflow-hidden">
                    <div className="absolute left-0 top-0 w-1 bottom-0.5 bg-[#FF4A18]" />
                    <div className="absolute left-1 right-0 bottom-0 h-0.5 bg-[#FF7450]" />
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
                    <div className="absolute left-0 top-0 bottom-0 w-0.75 bg-[#FF4A18]" />
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
                        { lbl: "Salario Mensual", val: `Bs. ${fmtN(calc.salarioVES)}`, cls: "text-white" },
                        { lbl: "Salario Diario", val: `Bs. ${fmtN(calc.salarioDia)}`, cls: "text-white" },
                        { lbl: "Reintegro", val: formatDateES(fechaReintegro).toUpperCase(), cls: "text-[#96c8dc]" },
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
                            <p className="font-mono text-[13px] font-black tabular-nums text-[#D93A10]">Bs. {fmtN(calc.montoDisfrute)}</p>
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
                        <div className="absolute left-0 top-0 bottom-0 w-0.75 bg-[#FF4A18]" />
                        <p className="pl-3 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[#787884]">
                            Total · {calc.diasDisfrute + calc.diasBono} días
                        </p>
                        <p className="font-mono text-[16px] font-black tabular-nums text-[#FF4A18]">
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
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#FF4A18]" />
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
    companyName, companyLogoUrl, showLogoInPdf, fechaIngreso, fechaEgreso }: {
        calc: VacFracCalc; employeeName: string; employeeCedula: string; employeeCargo?: string;
        companyName: string; companyLogoUrl?: string; showLogoInPdf?: boolean;
        fechaIngreso: string; fechaEgreso: string;
    }) {
    const handlePdf = () => generateVacFraccionadasPdf({
        companyName, employee: { nombre: employeeName, cedula: employeeCedula, cargo: employeeCargo },
        fechaIngreso, fechaEgreso,
        ultimoAniversario: calc.ultimoAniversario,
        aniosCompletos: calc.aniosCompletos, mesesFraccion: calc.mesesFraccion, diasAnuales: calc.diasAnuales,
        salarioVES: calc.salarioVES, salarioDia: calc.salarioDia,
        fraccionDisfrute: calc.fraccionDisfrute, fraccionBono: calc.fraccionBono,
        montoDisfrute: calc.montoDisfrute, montoBono: calc.montoBono, total: calc.total,
        logoUrl: companyLogoUrl, showLogoInPdf,
    });

    const emitido = new Date().toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();

    return (
        <div className="max-w-2xl mx-auto space-y-3">
            <div className="flex justify-end">
                <button onClick={handlePdf}
                    className="flex items-center gap-2 h-8 px-4 rounded-lg bg-[#b4780a] hover:bg-[#92600a] text-white font-mono text-[11px] uppercase tracking-[0.12em] transition-colors duration-150">
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                        <path d="M3 12h10M8 2v8m-3-3 3 3 3-3" />
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
                        { lbl: "Fecha de Ingreso", val: formatDateES(fechaIngreso).toUpperCase(), cls: "text-white" },
                        { lbl: "Último Aniversario", val: formatDateES(calc.ultimoAniversario).toUpperCase(), cls: "text-white" },
                        { lbl: "Meses Año en Curso", val: `${calc.mesesFraccion} mes${calc.mesesFraccion !== 1 ? "es" : ""}`, cls: "text-[#96c8dc]" },
                        { lbl: "Días Anuales Base", val: `${calc.diasAnuales} días`, cls: "text-white" },
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
                        { lbl: "Salario Diario", val: `Bs. ${fmtN(calc.salarioDia)} / día` },
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
// PAGE
// ============================================================================

type Mode = "completas" | "fraccionadas";

export default function VacacionesPage() {
    const { companyId, company } = useCompany();
    const { employees, loading } = useEmployee(companyId);

    // ── Mode ────────────────────────────────────────────────────────────────
    const [mode, setMode] = useState<Mode>("completas");

    // ── Employee Selection ──────────────────────────────────────────────────
    const [selectedCedula, setSelectedCedula] = useState<string>("");
    const [soloActivos,    setSoloActivos]    = useState(true);
    const [salarioOverride, setSalarioOverride] = useState("");
    const [manualIngreso, setManualIngreso] = useState("");

    // ── BCV ─────────────────────────────────────────────────────────────────
    const [exchangeRate, setExchangeRate] = useState("79.59");
    const [bcvLoading, setBcvLoading] = useState(true);
    const [bcvError, setBcvError] = useState<string | null>(null);
    const bcvRate = useMemo(() => parseFloat(exchangeRate) || 0, [exchangeRate]);

    const fetchBcvRate = useCallback(() => {
        setBcvLoading(true);
        fetch(`/api/bcv/rate?date=${isoToday()}`)
            .then(r => r.json())
            .then(d => { 
                const rate = d.price || d.rate;
                if (rate) { 
                    setExchangeRate(rate.toFixed(2)); 
                    setBcvError(null); 
                } else setBcvError("No disponible"); 
            })
            .catch(() => setBcvError("Error al obtener tasa"))
            .finally(() => setBcvLoading(false));
    }, []);

    useEffect(() => { fetchBcvRate(); }, [fetchBcvRate]);

    // ── Global Params ────────────────────────────────────────────────────────
    const todayStr = isoToday();
    const [fechaInicio, setFechaInicio] = useState(todayStr);
    const [fechaEgreso, setFechaEgreso] = useState(todayStr);

    // Override states for manual date tweaking (optional, but keep for UI compatibility)
    const [fechaCulminacion, setFechaCulminacion] = useState("");
    const [fechaReintegro, setFechaReintegro] = useState("");
    const [userEditedCulm, setUserEditedCulm] = useState(false);
    const [userEditedReint, setUserEditedReint] = useState(false);

    // ── Shared derived ───────────────────────────────────────────────────────
    const selectedEmp = useMemo(() => employees.find(e => e.cedula === selectedCedula), [employees, selectedCedula]);

    // Salary field sync
    const [salarioSourceKey, setSalarioSourceKey] = useState("");
    const currentSalarioKey = `${selectedEmp?.cedula ?? ""}|${bcvRate}`;
    if (salarioSourceKey !== currentSalarioKey) {
        setSalarioSourceKey(currentSalarioKey);
        if (selectedEmp) {
            const ves = selectedEmp.moneda === "USD"
                ? selectedEmp.salarioMensual * bcvRate
                : selectedEmp.salarioMensual;
            setSalarioOverride(ves.toFixed(2));
        } else {
            setSalarioOverride("");
        }
    }

    const salarioVES = parseFloat(salarioOverride) || 0;
    const fechaIngreso = selectedEmp?.fechaIngreso ?? manualIngreso;

    // ── BATCH PROCESSING ─────────────────────────────────────────────────────
    const filtered = useMemo(() => {
        const pool = soloActivos ? employees.filter(e => e.estado === "activo") : employees;
        if (!selectedCedula) return pool;
        return pool.filter(e => e.cedula === selectedCedula);
    }, [employees, soloActivos, selectedCedula]);

    interface VacResult {
        emp:  Employee;
        calc: VacCalc | VacFracCalc | null;
        dates?: { start: string; end: string; rest: string; };
        msg?: string;
    }

    const results = useMemo<VacResult[]>(() => {
        return filtered.map(emp => {
            const ves = emp.moneda === "USD" ? emp.salarioMensual * bcvRate : emp.salarioMensual;
            const ing = emp.fechaIngreso ?? "";

            if (mode === "completas") {
                const anios = calcAniosAt(ing, fechaInicio);
                const dL = 15 + (anios >= 2 ? Math.min(anios - 1, 15) : 0);
                const culm = calculateCulminacion(fechaInicio, dL);
                const reint = nextWorkingDay(culm);
                const c = computeVac(ves, ing, fechaInicio, culm);
                return { emp, calc: c, dates: { start: fechaInicio, end: culm, rest: reint } };
            } else {
                const c = computeVacFrac(ves, ing, fechaEgreso);
                return { emp, calc: c };
            }
        });
    }, [filtered, mode, bcvRate, fechaInicio, fechaEgreso]);

    const totalGral = useMemo(() => results.reduce((acc, r) => acc + (r.calc?.total ?? 0), 0), [results]);

    // Handlers for UI inputs
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

    const calcDisplay = results.length === 1 ? results[0].calc : null;
    const datesDisplay = results.length === 1 ? results[0].dates : null;

    return (
        <div className="min-h-full bg-surface-2 flex flex-col overflow-hidden">
            <PageHeader
                title="Vacaciones"
                subtitle="Cálculo de disfrute y bono vacacional (Art. 190 LOTTT)"
            >
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-light bg-surface-1 h-8 shadow-sm">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-tertiary)]">BCV</span>
                    <span className="font-mono text-[11px] font-semibold tabular-nums text-foreground">
                        {bcvLoading ? "..." : bcvRate.toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                    </span>
                    {bcvError && <span className="w-1.5 h-1.5 rounded-full bg-red-400" title={bcvError} />}
                </div>
            </PageHeader>

            <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
                {/* ══ LEFT PANEL ══════════════════════════════════════════════ */}
                <aside className="w-full lg:w-96 shrink-0 flex flex-col border-b lg:border-b-0 lg:border-r border-border-light bg-surface-1 overflow-y-auto">

                    <div className="px-5 py-4 border-b border-border-light bg-surface-2/[0.03]">
                        <p className="font-mono text-[13px] font-black uppercase tracking-widest text-foreground leading-none flex items-center gap-2">
                            <TrendingUp size={14} className="text-primary-500" />
                            Calculadora
                        </p>
                    </div>

                    {/* Mode toggle */}
                    <div className="px-5 py-5 border-b border-border-light">
                        <label className={labelCls}>Tipo de Vacaciones</label>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                            <button 
                                onClick={() => setMode("completas")} 
                                className={`flex items-center justify-center gap-2 h-9 rounded-lg border font-mono text-[11px] uppercase tracking-[0.1em] transition-all ${mode === "completas" ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-700" : "bg-surface-1 border-border-light text-[var(--text-secondary)] hover:border-border-medium"}`}
                            >
                                <ClipboardCheck size={14} /> Completas
                            </button>
                            <button 
                                onClick={() => setMode("fraccionadas")} 
                                className={`flex items-center justify-center gap-2 h-9 rounded-lg border font-mono text-[11px] uppercase tracking-[0.1em] transition-all ${mode === "fraccionadas" ? "bg-amber-500/10 border-amber-500/50 text-amber-700" : "bg-surface-1 border-border-light text-[var(--text-secondary)] hover:border-border-medium"}`}
                            >
                                <TrendingUp size={14} /> Fracc.
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 divide-y divide-border-light">
                        {/* ── Alcance ───────────────────────────────────────── */}
                         <div className="px-5 py-4 space-y-4">
                            <SectionHeader label="Alcance" />
                            <div className="space-y-4">
                                {!loading && employees.length > 0 && (
                                    <div className="relative">
                                        <Users className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" size={14} />
                                        <select value={selectedCedula} onChange={e => setSelectedCedula(e.target.value)} className={fieldCls + " pl-9"}>
                                            <option value="">Lote por defecto (Todos)</option>
                                            <optgroup label="Empleados">
                                                {employees
                                                    .filter(e => !soloActivos || e.estado === "activo")
                                                    .sort((a,b) => a.nombre.localeCompare(b.nombre))
                                                    .map(e => (
                                                        <option key={e.cedula} value={e.cedula}>{e.nombre} ({e.cedula})</option>
                                                    ))
                                                }
                                            </optgroup>
                                        </select>
                                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" size={14} />
                                    </div>
                                )}
                                {selectedEmp && (
                                    <div className="p-3.5 rounded-xl border border-border-light bg-surface-2/[0.03] space-y-2.5 relative overflow-hidden">
                                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary-500/40" />
                                        {[
                                            { k: "Cédula", v: selectedEmp.cedula, icon: <Info size={12} /> },
                                            { k: "Cargo", v: selectedEmp.cargo || "—", icon: <ClipboardCheck size={12} /> },
                                            { k: "Ingreso", v: selectedEmp.fechaIngreso ?? "—", icon: <Calendar size={12} /> },
                                        ].map(({ k, v, icon }) => (
                                            <div key={k} className="flex justify-between items-center font-mono text-[11px]">
                                                <div className="flex items-center gap-2 text-[var(--text-tertiary)]">
                                                    {icon}
                                                    <span className="uppercase tracking-wider">{k}</span>
                                                </div>
                                                <span className="text-foreground font-bold tabular-nums">{v}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <label className="flex items-center gap-3 cursor-pointer group py-1">
                                    <div onClick={(e) => { e.preventDefault(); setSoloActivos(v => !v); }}
                                        className={["w-8 h-4.5 rounded-full transition-all duration-200 flex items-center px-0.5 cursor-pointer ring-offset-background group-hover:ring-2 ring-primary-500/10", soloActivos ? "bg-primary-500" : "bg-border-medium"].join(" ")}>
                                        <div className={["w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform duration-200", soloActivos ? "translate-x-3.5" : "translate-x-0"].join(" ")} />
                                    </div>
                                    <span className="font-mono text-[11px] text-[var(--text-secondary)] uppercase tracking-[0.14em] font-medium group-hover:text-foreground">Solo activos</span>
                                </label>
                            </div>

                            {selectedCedula && (
                                <div className="pt-2">
                                    <label className={labelCls}>Salario mensual (Bs.)</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[12px] text-[var(--text-tertiary)] pointer-events-none select-none">Bs.</span>
                                        <input type="number" step="0.01" min="0" value={salarioOverride}
                                            onChange={e => setSalarioOverride(e.target.value)} placeholder="0.00"
                                            className={fieldCls + " pl-9 text-right"} />
                                    </div>
                                </div>
                            )}
                            {!selectedEmp && selectedCedula && (
                                <div>
                                    <label className={labelCls}>Fecha de ingreso</label>
                                    <div className="relative">
                                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={14} />
                                        <input type="date" value={manualIngreso}
                                            onChange={e => setManualIngreso(e.target.value)} className={fieldCls + " pl-9"} />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ── Tasa BCV ────────────────────────────────────────── */}
                        <div className="px-5 py-4">
                            <div className="flex items-center justify-between mb-2">
                                <SectionHeader label="Tasa BCV" />
                                <button 
                                    onClick={fetchBcvRate}
                                    disabled={bcvLoading}
                                    className="p-1 hover:bg-surface-2 rounded-md transition-colors text-[var(--text-tertiary)] hover:text-primary-500 disabled:opacity-40"
                                    title="Actualizar tasa"
                                >
                                    <RefreshCw size={12} className={bcvLoading ? "animate-spin" : ""} />
                                </button>
                            </div>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[12px] text-[var(--text-tertiary)] pointer-events-none select-none">Bs.</span>
                                <input 
                                    type="number" 
                                    step="0.01" 
                                    value={exchangeRate}
                                    onChange={e => setExchangeRate(e.target.value)} 
                                    className={fieldCls + " pl-9 text-right"} 
                                />
                            </div>
                        </div>

                        {/* ── Parámetros Temporales ───────────────────────────── */}
                        <div className="px-5 py-5 space-y-4">
                            {mode === "completas" ? (<>
                                <SectionHeader label="Fechas de Disfrute" />
                                <div>
                                    <label className={labelCls}>Fecha Inicio</label>
                                    <div className="relative">
                                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={14} />
                                        <input type="date" value={fechaInicio} onChange={e => handleInicioChange(e.target.value)} className={fieldCls + " pl-9"} />
                                    </div>
                                </div>
                                {selectedCedula && (
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className={labelCls}>Culminación</label>
                                            <input type="date" value={fechaCulminacion || (datesDisplay?.end ?? "")} onChange={e => handleCulminacionChange(e.target.value)} className={fieldCls} />
                                        </div>
                                        <div>
                                            <label className={labelCls}>Reintegro</label>
                                            <input type="date" value={fechaReintegro || (datesDisplay?.rest ?? "")} onChange={e => setFechaReintegro(e.target.value)} className={fieldCls} />
                                        </div>
                                    </div>
                                )}
                            </>) : (
                                <>
                                    <SectionHeader label="Egreso" />
                                    <div>
                                        <label className={labelCls}>Fecha de Egreso</label>
                                        <div className="relative">
                                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={14} />
                                            <input type="date" value={fechaEgreso} onChange={e => setFechaEgreso(e.target.value)} className={fieldCls + " pl-9"} />
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* ── Resultados Resumen ───────────────────────────────── */}
                        <div className="px-5 py-4 space-y-0.5">
                            <SectionHeader label="Resumen de Cálculo" />
                            {mode === "completas" && calcDisplay ? (<>
                                <CalcRow label="Años de servicio" value={`${(calcDisplay as VacCalc).anios} ${(calcDisplay as VacCalc).anios === 1 ? "año" : "años"}`} dim />
                                <CalcRow label="Días base"    value={`${(calcDisplay as VacCalc).diasHabiles} háb. / ${(calcDisplay as VacCalc).diasCalendario} cal.`} dim />
                                <CalcRow label="Feriados/Desc." value={`${(calcDisplay as VacCalc).diasDescanso} días`} dim />
                                <CalcRow label="Total días pago" value={`${(calcDisplay as VacCalc).diasDisfrute + (calcDisplay as VacCalc).diasBono} días`} accent="green" />
                                <div className="mt-4 p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.03] space-y-2 relative overflow-hidden text-emerald-700">
                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500" />
                                    <span className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] opacity-70">Total a Pagar</span>
                                    <div className="flex items-baseline justify-between">
                                        <span className="font-mono text-[24px] font-black tabular-nums truncate">{fmt((calcDisplay as VacCalc).total)}</span>
                                    </div>
                                </div>
                            </>) : mode === "fraccionadas" && calcDisplay ? (<>
                                <CalcRow label="Fracción meses" value={`${(calcDisplay as VacFracCalc).mesesFraccion} meses`} dim />
                                <CalcRow label="Días proporción" value={`${(calcDisplay as VacFracCalc).fraccionDisfrute + (calcDisplay as VacFracCalc).fraccionBono} días`} accent="amber" />
                                <div className="mt-4 p-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.03] space-y-2 relative overflow-hidden text-amber-700">
                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500" />
                                    <span className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] opacity-70">Total Fraccionado</span>
                                    <div className="flex items-baseline justify-between">
                                        <span className="font-mono text-[24px] font-black tabular-nums truncate">{fmt((calcDisplay as VacFracCalc).total)}</span>
                                    </div>
                                </div>
                            </>) : (
                                <p className="font-mono text-[11px] text-[var(--text-tertiary)] pt-2">Selecciona empleados para ver resumen.</p>
                            )}
                        </div>
                    </div>

                    {/* Totals + export */}
                    <div className="p-5 border-t border-border-light space-y-4 mt-auto bg-surface-2/[0.03]">
                        {results.length > 0 && (
                            <div className="space-y-2 mb-4 bg-surface-2/40 rounded-xl p-4 border border-border-light/50">
                                <div className="flex justify-between font-mono text-[11px] uppercase tracking-wider">
                                    <span className="text-[var(--text-tertiary)]">Empleados</span>
                                    <span className="text-foreground font-bold">{results.length}</span>
                                </div>
                                
                                <div className="flex justify-between items-baseline pt-2 border-t border-border-light/30">
                                    <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--text-secondary)] font-bold">Total Gral. (NETO)</span>
                                    <span className="font-mono text-[15px] font-black tabular-nums text-emerald-500">{fmt(totalGral)}</span>
                                </div>
                            </div>
                        )}
                        
                        <BaseButton.Root
                            variant="primary"
                            className="w-full"
                            onClick={() => {}}
                            disabled={results.length === 0}
                            leftIcon={<Download size={14} />}
                        >
                            Generar PDF
                        </BaseButton.Root>
                    </div>
                </aside>

                {/* ══ RIGHT PANEL ═════════════════════════════════════════════ */}
                <main className="flex-1 overflow-y-auto p-6 bg-surface-2">
                    {loading ? (
                        <div className="flex items-center justify-center h-48 gap-2 text-[var(--text-tertiary)]">
                            <svg className="animate-spin" width="14" height="14" viewBox="0 0 12 12" fill="none">
                                <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3" />
                                <path d="M11 6A5 5 0 0 0 6 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                            <span className="font-mono text-[13px] uppercase tracking-widest">Cargando empleados…</span>
                        </div>
                    ) : results.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full gap-3 text-[var(--text-disabled)] opacity-40">
                             <Users size={48} strokeWidth={1} />
                             <p className="font-mono text-[12px] uppercase tracking-widest">Selecciona empleados para calcular</p>
                        </div>
                    ) : (
                        <div className="max-w-2xl mx-auto space-y-8">
                            {results.map(r => {
                                if (r.msg || !r.calc) return (
                                    <div key={r.emp.cedula} className="bg-surface-1 rounded-xl p-4 border border-border-light flex justify-between items-center opacity-70">
                                        <div>
                                            <p className="font-mono text-[13px] font-bold uppercase text-foreground">{r.emp.nombre}</p>
                                            <p className="font-mono text-[10px] text-[var(--text-tertiary)] uppercase">{r.emp.cargo}</p>
                                        </div>
                                        <span className="font-mono text-[10px] text-amber-500 uppercase border border-amber-500/20 px-2 py-0.5 rounded">{r.msg ?? "Error"}</span>
                                    </div>
                                );

                                if (mode === "completas") return (
                                    <ConstanciaCompleta
                                        key={r.emp.cedula}
                                        calc={r.calc as VacCalc}
                                        employeeName={r.emp.nombre}
                                        employeeCedula={r.emp.cedula}
                                        employeeCargo={r.emp.cargo}
                                        companyName={company?.name ?? "La Empresa"}
                                        companyLogoUrl={company?.logoUrl}
                                        showLogoInPdf={company?.showLogoInPdf}
                                        fechaInicio={r.dates?.start ?? ""}
                                        fechaCulminacion={r.dates?.end ?? ""}
                                        fechaReintegro={r.dates?.rest ?? ""}
                                    />
                                );

                                return (
                                    <ConstanciaFraccionada
                                        key={r.emp.cedula}
                                        calc={r.calc as VacFracCalc}
                                        employeeName={r.emp.nombre}
                                        employeeCedula={r.emp.cedula}
                                        employeeCargo={r.emp.cargo}
                                        companyName={company?.name ?? "La Empresa"}
                                        companyLogoUrl={company?.logoUrl}
                                        showLogoInPdf={company?.showLogoInPdf}
                                        fechaIngreso={r.emp.fechaIngreso ?? ""}
                                        fechaEgreso={fechaEgreso}
                                    />
                                );
                            })}
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
