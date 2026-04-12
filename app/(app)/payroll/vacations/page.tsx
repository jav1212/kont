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
    Info,
    Clock
} from "lucide-react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useEmployee } from "@/src/modules/payroll/frontend/hooks/use-employee";
import type { Employee } from "@/src/modules/payroll/frontend/hooks/use-employee";
import { getTodayIsoDate } from "@/src/shared/frontend/utils/local-date";
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

function isoToday(): string { return getTodayIsoDate(); }

function localIso(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function makeDocumentId(...parts: Array<string | number | undefined>): string {
    const seed = parts.filter(Boolean).join("|");
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    }
    return hash.toString(36).toUpperCase().padStart(6, "0").slice(-6);
}

function addCalDays(iso: string, n: number): string {
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + n);
    return localIso(d);
}

function nextWorkingDay(iso: string): string {
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + 1);
    const holidayStart = localIso(d);
    const holidayEnd = addCalDays(holidayStart, 14);
    const holidays = new Set(getHolidaysInRange(holidayStart, holidayEnd).map((h) => h.date));
    while (d.getDay() === 0 || d.getDay() === 6 || holidays.has(localIso(d))) d.setDate(d.getDate() + 1);
    return localIso(d);
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
    return localIso(date);
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
        const iso = localIso(cur);
        if (wd !== 0 && wd !== 6 && !holidays.has(iso)) counted++;
        if (counted < diasHabilesNeeded) cur.setDate(cur.getDate() + 1);
    }
    return localIso(cur);
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
        const iso = localIso(cur);
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

// ============================================================================
// RIGHT PANEL — Constancia Completa  (PDF-faithful preview)
// ============================================================================

function ConstanciaCompleta({ calc, employeeName, employeeCedula, employeeCargo,
    companyName, companyLogoUrl, showLogoInPdf, fechaIngreso, fechaInicio, fechaCulminacion, fechaReintegro }: {
        calc: VacCalc; employeeName: string; employeeCedula: string; employeeCargo?: string;
        companyName: string; companyLogoUrl?: string; showLogoInPdf?: boolean;
        fechaIngreso: string; fechaInicio: string; fechaCulminacion: string; fechaReintegro: string;
    }) {
    const emitido = new Date().toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
    const documentId = makeDocumentId(companyName, employeeCedula, fechaIngreso, fechaInicio, fechaCulminacion);

    return (
        <div className="mb-2 bg-surface-1 rounded-[1.5rem] overflow-hidden shadow-sm shadow-black/5 border border-border-light max-w-3xl mx-auto flex flex-col">
            <div className="px-8 py-6 border-b border-border-light bg-surface-2/30 flex items-start justify-between gap-6">
                <div className="flex flex-row items-center gap-4">
                    {(showLogoInPdf && companyLogoUrl) && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={companyLogoUrl} alt="Logo" className="max-h-12 w-auto object-contain shrink-0" />
                    )}
                    <div>
                        <p className="text-[20px] font-black uppercase tracking-tight text-foreground leading-none">{companyName}</p>
                        <p className="text-[11px] text-[var(--text-tertiary)] mt-2 uppercase tracking-[0.2em] font-semibold">Vacaciones Completas</p>
                        <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 font-medium">Arts. 190 · 192 LOTTT — Disfrute y Bono Vacacional</p>
                    </div>
                </div>
                <div className="text-right shrink-0">
                    <p className="text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-0.5">Período</p>
                    <p className="text-[13px] font-bold text-foreground bg-surface-2 px-2.5 py-1 rounded inline-block border border-border-light">{formatDateES(fechaInicio)} al {formatDateES(fechaCulminacion)}</p>
                    <p className="text-[9px] text-[var(--text-tertiary)] mt-2 uppercase">Emitido: {emitido}</p>
                </div>
            </div>

            <div className="px-8 py-5 border-b border-border-light flex flex-col sm:flex-row items-center justify-between bg-surface-1">
                <div className="flex items-center gap-4 w-full">
                    <div className="flex-shrink-0 w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center border border-border-light text-[var(--text-tertiary)] transition-colors">
                        <Users size={20} />
                    </div>
                    <div className="flex-1">
                        <p className="text-[16px] font-bold text-foreground tracking-tight">{employeeName}</p>
                        {employeeCargo && <p className="text-[11px] uppercase tracking-[0.1em] text-[var(--text-secondary)] font-medium mt-0.5">{employeeCargo}</p>}
                    </div>
                    <div className="text-right shrink-0 pl-5 md:pr-4 border-l border-border-light">
                        <p className="text-[13px] font-bold text-foreground tabular-nums">CI {employeeCedula}</p>
                        <div className="inline-flex items-center gap-1.5 mt-1 text-[11px] text-[var(--text-secondary)] font-medium bg-surface-2 px-2 py-0.5 rounded border border-border-light">
                            <Clock size={12} className="text-[var(--text-tertiary)]" />
                            {calc.anios} año{calc.anios !== 1 ? "s" : ""}
                        </div>
                    </div>
                </div>
            </div>

            <div className="px-8 py-5 grid grid-cols-2 lg:grid-cols-4 gap-6 border-b border-border-light bg-surface-2/20">
                {[
                    { lbl: "Salario Mensual", val: fmt(calc.salarioVES), color: "text-foreground" },
                    { lbl: "Salario Diario", val: fmt(calc.salarioDia) + " /día", color: "text-foreground" },
                    { lbl: "Fecha Reintegro", val: formatDateES(fechaReintegro), color: "text-emerald-500 font-bold bg-emerald-500/10 px-2 py-0.5 rounded inline-flex border border-emerald-500/20" },
                    { lbl: "Cal · Háb · Desc", val: `${calc.diasCalendario} · ${calc.diasHabiles} · ${calc.diasDescanso}`, color: "text-foreground" },
                ].map((item, idx) => (
                    <div key={idx}>
                        <p className="text-[10px] uppercase tracking-[0.15em] text-[var(--text-tertiary)] mb-1 font-bold">{item.lbl}</p>
                        <p className={`text-[13px] font-bold tabular-nums ${item.color}`}>{item.val}</p>
                    </div>
                ))}
            </div>

            <div className="px-8 py-5 border-b border-border-light">
                <SectionHeader label="Conceptos" />
                <div className="space-y-1">
                    <CalcRow label="Disfrute Vacacional" formula={`Art. 190 LOTTT — 15 días base${calc.diasAdicDisfrute > 0 ? ` + ${calc.diasAdicDisfrute} adicional${calc.diasAdicDisfrute !== 1 ? "es" : ""}` : ""}`} value={fmt(calc.montoDisfrute)} />
                    <CalcRow label="Bono Vacacional" formula={`Art. 192 LOTTT — 15 días base${calc.diasAdicBono > 0 ? ` + ${calc.diasAdicBono} adicional${calc.diasAdicBono !== 1 ? "es" : ""}` : ""}`} value={fmt(calc.montoBono)} />
                </div>
                <div className="pt-4 mt-2 border-t border-border-light">
                    <div className="mt-4 p-5 rounded-2xl bg-surface-2/60 border border-border-light flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <p className="text-[11px] font-black uppercase tracking-[0.15em] text-[var(--text-tertiary)] flex items-center gap-2 mb-1">
                                Monto a Pagar
                            </p>
                            <p className="text-[24px] font-black tabular-nums text-foreground leading-none">
                                {fmt(calc.total)}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-surface-2/30 px-8 py-4 flex items-center justify-between mt-auto">
                <p className="text-[10px] text-[var(--text-tertiary)] leading-relaxed uppercase tracking-wider font-semibold">
                    Documento de conformidad · Original
                </p>
                <div className="flex items-center gap-2 text-[var(--text-tertiary)]">
                    <FileText size={14} />
                    <span className="text-[10px] font-bold tracking-widest uppercase">ID {documentId}</span>
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// RIGHT PANEL — Constancia Fraccionada
// ============================================================================

function ConstanciaFraccionada({ calc, employeeName, employeeCedula, employeeCargo,
    companyName, companyLogoUrl, showLogoInPdf, fechaIngreso, fechaEgreso }: {
        calc: VacFracCalc; employeeName: string; employeeCedula: string; employeeCargo?: string;
        companyName: string; companyLogoUrl?: string; showLogoInPdf?: boolean;
        fechaIngreso: string; fechaEgreso: string;
    }) {
    const emitido = new Date().toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
    const documentId = makeDocumentId(companyName, employeeCedula, fechaIngreso, fechaEgreso, calc.ultimoAniversario);

    return (
        <div className="mb-2 bg-surface-1 rounded-[1.5rem] overflow-hidden shadow-sm shadow-black/5 border border-border-light max-w-3xl mx-auto flex flex-col">
            <div className="px-8 py-6 border-b border-border-light bg-surface-2/30 flex items-start justify-between gap-6">
                <div className="flex flex-row items-center gap-4">
                    {(showLogoInPdf && companyLogoUrl) && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={companyLogoUrl} alt="Logo" className="max-h-12 w-auto object-contain shrink-0" />
                    )}
                    <div>
                        <p className="text-[20px] font-black uppercase tracking-tight text-foreground leading-none">{companyName}</p>
                        <p className="text-[11px] text-[var(--text-tertiary)] mt-2 uppercase tracking-[0.2em] font-semibold">Vacaciones Fraccionadas</p>
                        <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 font-medium">Art. 196 LOTTT — Porción proporcional</p>
                    </div>
                </div>
                <div className="text-right shrink-0">
                    <p className="text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-0.5">Fecha de Egreso</p>
                    <p className="text-[13px] font-bold text-foreground bg-surface-2 px-2.5 py-1 rounded inline-block border border-border-light">{formatDateES(fechaEgreso)}</p>
                    <p className="text-[9px] text-[var(--text-tertiary)] mt-2 uppercase">Emitido: {emitido}</p>
                </div>
            </div>

            <div className="px-8 py-5 border-b border-border-light flex flex-col sm:flex-row items-center justify-between bg-surface-1">
                <div className="flex items-center gap-4 w-full">
                    <div className="flex-shrink-0 w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center border border-border-light text-[var(--text-tertiary)] transition-colors">
                        <Users size={20} />
                    </div>
                    <div className="flex-1">
                        <p className="text-[16px] font-bold text-foreground tracking-tight">{employeeName}</p>
                        {employeeCargo && <p className="text-[11px] uppercase tracking-[0.1em] text-[var(--text-secondary)] font-medium mt-0.5">{employeeCargo}</p>}
                    </div>
                    <div className="text-right shrink-0 pl-5 md:pr-4 border-l border-border-light">
                        <p className="text-[13px] font-bold text-foreground tabular-nums">CI {employeeCedula}</p>
                        <div className="inline-flex items-center gap-1.5 mt-1 text-[11px] text-[var(--text-secondary)] font-medium bg-surface-2 px-2 py-0.5 rounded border border-border-light">
                            <Clock size={12} className="text-[var(--text-tertiary)]" />
                            {calc.aniosCompletos} año{calc.aniosCompletos !== 1 ? "s" : ""}
                        </div>
                    </div>
                </div>
            </div>

            <div className="px-8 py-5 grid grid-cols-2 lg:grid-cols-4 gap-6 border-b border-border-light bg-surface-2/20">
                {[
                    { lbl: "Fecha de Ingreso", val: formatDateES(fechaIngreso), color: "text-foreground" },
                    { lbl: "Último Aniversario", val: formatDateES(calc.ultimoAniversario), color: "text-foreground" },
                    { lbl: "Meses (Fracción)", val: `${calc.mesesFraccion} mes${calc.mesesFraccion !== 1 ? "es" : ""}`, color: "text-primary-500" },
                    { lbl: "Días Anuales Base", val: `${calc.diasAnuales} días`, color: "text-foreground" },
                ].map((item, idx) => (
                    <div key={idx}>
                        <p className="text-[10px] uppercase tracking-[0.15em] text-[var(--text-tertiary)] mb-1 font-bold">{item.lbl}</p>
                        <p className={`text-[13px] font-bold tabular-nums ${item.color}`}>{item.val}</p>
                    </div>
                ))}
            </div>

            <div className="px-8 py-5 border-b border-border-light">
                <div className="mb-4 bg-surface-2/80 p-3 rounded-lg border border-border-light flex gap-3 items-center">
                    <Info className="text-[var(--text-secondary)] shrink-0" size={16} />
                    <div>
                        <p className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)] font-bold mb-0.5">Fórmula Art. 196</p>
                        <p className="font-mono text-[12px] text-foreground font-medium">
                            ⌈ {calc.diasAnuales} días / 12 meses × {calc.mesesFraccion} meses ⌉ = {calc.fraccionDisfrute} días
                        </p>
                    </div>
                </div>

                <SectionHeader label="Conceptos" />
                <div className="space-y-1">
                    <CalcRow label="Disfrute Fraccionado" formula={`Art. 190 + 196 LOTTT — ${calc.fraccionDisfrute} d`} value={fmt(calc.montoDisfrute)} />
                    <CalcRow label="Bono Vacacional Fracc." formula={`Art. 192 + 196 LOTTT — ${calc.fraccionBono} d`} value={fmt(calc.montoBono)} />
                </div>
                <div className="pt-4 mt-2 border-t border-border-light">
                    <div className="mt-4 p-5 rounded-2xl bg-surface-2/60 border border-border-light flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <p className="text-[11px] font-black uppercase tracking-[0.15em] text-[var(--text-tertiary)] flex items-center gap-2 mb-1">
                                Monto a Pagar
                            </p>
                            <p className="text-[24px] font-black tabular-nums text-foreground leading-none">
                                {fmt(calc.total)}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-surface-2/30 px-8 py-4 flex items-center justify-between mt-auto">
                <p className="text-[10px] text-[var(--text-tertiary)] leading-relaxed uppercase tracking-wider font-semibold">
                    Documento de conformidad · Original
                </p>
                <div className="flex items-center gap-2 text-[var(--text-tertiary)]">
                    <FileText size={14} />
                    <span className="text-[10px] font-bold tracking-widest uppercase">ID {documentId}</span>
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
    const [isExporting, setIsExporting] = useState(false);

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

    const fetchBcvRate = useCallback(async () => {
        await Promise.resolve();
        setBcvLoading(true);
        try {
            const response = await fetch(`/api/bcv/rate?date=${isoToday()}`);
            const data = await response.json();
            const rate = data.price || data.rate;
            if (rate) {
                setExchangeRate(rate.toFixed(2));
                setBcvError(null);
            } else {
                setBcvError("No disponible");
            }
        } catch {
            setBcvError("Error al obtener tasa");
        } finally {
            setBcvLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchBcvRate();
    }, [fetchBcvRate]);

    // ── Global Params ────────────────────────────────────────────────────────
    const todayStr = isoToday();
    const [fechaInicio, setFechaInicio] = useState(todayStr);
    const [fechaEgreso, setFechaEgreso] = useState(todayStr);

    // Override states for manual date tweaking (optional, but keep for UI compatibility)
    const [fechaCulminacion, setFechaCulminacion] = useState("");
    const [fechaReintegro, setFechaReintegro] = useState("");
    const [, setUserEditedCulm] = useState(false);
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

    const handleBatchExport = async () => {
        if (!company) return;
        try {
            setIsExporting(true);
            
            for (const r of results) {
                if (!r.calc) continue;
                if (mode === "completas" && r.dates) {
                    await generateVacComplletasPdf({
                        companyName: company.name, 
                        employee: { nombre: r.emp.nombre, cedula: r.emp.cedula, cargo: r.emp.cargo, anios: (r.calc as VacCalc).anios },
                        fechaInicio: r.dates.start, fechaCulminacion: r.dates.end, fechaReintegro: r.dates.rest,
                        salarioVES: r.calc.salarioVES, salarioDia: r.calc.salarioDia,
                        diasCalendario: (r.calc as VacCalc).diasCalendario, diasHabiles: (r.calc as VacCalc).diasHabiles, diasDescanso: (r.calc as VacCalc).diasDescanso,
                        diasDisfrute: (r.calc as VacCalc).diasDisfrute, diasBono: (r.calc as VacCalc).diasBono,
                        montoDisfrute: r.calc.montoDisfrute, montoBono: r.calc.montoBono, total: r.calc.total,
                        logoUrl: company.logoUrl, showLogoInPdf: company.showLogoInPdf,
                    });
                } else if (mode === "fraccionadas") {
                    await generateVacFraccionadasPdf({
                        companyName: company.name, employee: { nombre: r.emp.nombre, cedula: r.emp.cedula, cargo: r.emp.cargo },
                        fechaIngreso: r.emp.fechaIngreso ?? "", fechaEgreso: fechaEgreso,
                        ultimoAniversario: (r.calc as VacFracCalc).ultimoAniversario,
                        aniosCompletos: (r.calc as VacFracCalc).aniosCompletos, mesesFraccion: (r.calc as VacFracCalc).mesesFraccion, diasAnuales: (r.calc as VacFracCalc).diasAnuales,
                        salarioVES: r.calc.salarioVES, salarioDia: r.calc.salarioDia,
                        fraccionDisfrute: (r.calc as VacFracCalc).fraccionDisfrute, fraccionBono: (r.calc as VacFracCalc).fraccionBono,
                        montoDisfrute: r.calc.montoDisfrute, montoBono: r.calc.montoBono, total: r.calc.total,
                        logoUrl: company.logoUrl, showLogoInPdf: company.showLogoInPdf,
                    });
                }
            }
        } catch (err: unknown) {
            console.error(err);
            alert("Error al exporar PDF: " + (err instanceof Error ? err.message : String(err)));
        } finally {
            setIsExporting(false);
        }
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
                        <div className="px-5 py-4">
                            <SectionHeader label="Resumen de Cálculo" />
                            {mode === "completas" && calcDisplay ? (
                                <div className="rounded-xl border border-border-light bg-surface-2/30 overflow-hidden">
                                    <div className="px-4 py-3 space-y-1.5 border-b border-border-light/60">
                                        <div className="flex justify-between items-baseline">
                                            <span className="font-mono text-[11px] text-[var(--text-secondary)]">Salario mensual</span>
                                            <span className="font-mono text-[12px] font-semibold tabular-nums text-foreground">{fmt((calcDisplay as VacCalc).salarioVES)}</span>
                                        </div>
                                        <div className="flex justify-between items-baseline">
                                            <span className="font-mono text-[11px] text-[var(--text-tertiary)]">Sal. diario</span>
                                            <span className="font-mono text-[11px] tabular-nums text-[var(--text-secondary)]">{fmtN((calcDisplay as VacCalc).salarioDia)} /día</span>
                                        </div>
                                    </div>
                                    <div className="px-4 py-3 space-y-1.5 border-b border-border-light/60">
                                        <div className="flex justify-between items-baseline">
                                            <span className="font-mono text-[11px] text-[var(--text-secondary)]">Días disfrute</span>
                                            <span className="font-mono text-[12px] font-semibold tabular-nums text-foreground">{(calcDisplay as VacCalc).diasDisfrute} días</span>
                                        </div>
                                        <div className="flex justify-between items-baseline">
                                            <span className="font-mono text-[11px] text-[var(--text-tertiary)]">Bono vacacional</span>
                                            <span className="font-mono text-[11px] tabular-nums text-[var(--text-secondary)]">{(calcDisplay as VacCalc).diasBono} días</span>
                                        </div>
                                    </div>
                                    <div className="px-4 py-3.5 flex justify-between items-center bg-surface-1">
                                        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--text-secondary)]">Total a Pagar</span>
                                        <span className="font-mono text-[18px] font-black tabular-nums text-foreground">{fmt((calcDisplay as VacCalc).total)}</span>
                                    </div>
                                </div>
                            ) : mode === "fraccionadas" && calcDisplay ? (
                                <div className="rounded-xl border border-border-light bg-surface-2/30 overflow-hidden">
                                     <div className="px-4 py-3 space-y-1.5 border-b border-border-light/60">
                                        <div className="flex justify-between items-baseline">
                                            <span className="font-mono text-[11px] text-[var(--text-secondary)]">Salario mensual</span>
                                            <span className="font-mono text-[12px] font-semibold tabular-nums text-foreground">{fmt((calcDisplay as VacFracCalc).salarioVES)}</span>
                                        </div>
                                        <div className="flex justify-between items-baseline">
                                            <span className="font-mono text-[11px] text-[var(--text-tertiary)]">Sal. diario</span>
                                            <span className="font-mono text-[11px] tabular-nums text-[var(--text-secondary)]">{fmtN((calcDisplay as VacFracCalc).salarioDia)} /día</span>
                                        </div>
                                    </div>
                                    <div className="px-4 py-3 space-y-1.5 border-b border-border-light/60">
                                        <div className="flex justify-between items-baseline">
                                            <span className="font-mono text-[11px] text-[var(--text-secondary)]">Meses fracción</span>
                                            <span className="font-mono text-[12px] font-semibold tabular-nums text-foreground">{(calcDisplay as VacFracCalc).mesesFraccion} meses</span>
                                        </div>
                                        <div className="flex justify-between items-baseline">
                                            <span className="font-mono text-[11px] text-[var(--text-tertiary)]">Días totales</span>
                                            <span className="font-mono text-[11px] tabular-nums text-[var(--text-secondary)]">{(calcDisplay as VacFracCalc).fraccionDisfrute + (calcDisplay as VacFracCalc).fraccionBono} días</span>
                                        </div>
                                    </div>
                                    <div className="px-4 py-3.5 flex justify-between items-center bg-surface-1">
                                        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--text-secondary)]">Total Fracc.</span>
                                        <span className="font-mono text-[18px] font-black tabular-nums text-foreground">{fmt((calcDisplay as VacFracCalc).total)}</span>
                                    </div>
                                </div>
                            ) : (
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
                            onClick={handleBatchExport}
                            disabled={results.length === 0 || isExporting}
                            leftIcon={isExporting ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
                        >
                            {isExporting ? "Generando..." : "Exportar Lote"}
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
                                        fechaIngreso={r.emp.fechaIngreso ?? ""}
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
