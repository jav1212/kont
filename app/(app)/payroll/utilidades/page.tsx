"use client";

import { useState, useMemo, useEffect } from "react";
import { useCompany }  from "@/src/modules/companies/frontend/hooks/use-companies";
import { useEmployee } from "@/src/modules/payroll/frontend/hooks/use-employee";
import type { Employee } from "@/src/modules/payroll/frontend/hooks/use-employee";
import {
    generateUtilidadesCompletasPdf,
    generateUtilidadesFraccionadasPdf,
} from "@/src/modules/payroll/frontend/utils/utilidades-pdf";

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

const labelCls = "font-mono text-[9px] uppercase tracking-[0.18em] text-foreground/40 mb-1.5 block";

function isoToday(): string { return new Date().toISOString().split("T")[0]; }

function formatDateES(iso: string): string {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    const meses = ["enero","febrero","marzo","abril","mayo","junio",
                   "julio","agosto","septiembre","octubre","noviembre","diciembre"];
    return `${parseInt(d)} de ${meses[parseInt(m) - 1]} de ${y}`;
}

/** Complete calendar months between two ISO dates */
function getMesesCompletos(desde: string, hasta: string): number {
    if (!desde || !hasta) return 0;
    const a = new Date(desde + "T00:00:00");
    const b = new Date(hasta  + "T00:00:00");
    if (b <= a) return 0;
    let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
    if (b.getDate() < a.getDate()) m--;
    return Math.max(0, m);
}

/** ISO date for Jan 1 of a given year */
function inicioDeAnio(anio: number): string {
    return `${anio}-01-01`;
}

/** ISO date for Dec 31 of a given year */
function finDeAnio(anio: number): string {
    return `${anio}-12-31`;
}

/** Later of two ISO dates */
function maxDate(a: string, b: string): string {
    return a > b ? a : b;
}

// ============================================================================
// CALCULATION ENGINES
// ============================================================================

interface UtilidadesCompletas {
    salarioVES:     number;
    salarioDia:     number;
    diasUtilidades: number;
    monto:          number;
    anioFiscal:     number;
}

function computeCompletas(
    salarioVES: number,
    diasUtilidades: number,
    anioFiscal: number,
): UtilidadesCompletas | null {
    if (salarioVES <= 0 || diasUtilidades <= 0) return null;
    const salarioDia = salarioVES / 30;
    const monto      = diasUtilidades * salarioDia;
    return { salarioVES, salarioDia, diasUtilidades, monto, anioFiscal };
}

interface UtilidadesFraccionadas {
    salarioVES:      number;
    salarioDia:      number;
    diasUtilidades:  number;
    anioFiscal:      number;
    inicioFiscal:    string;
    periodoInicio:   string;   // max(inicioFiscal, fechaIngreso)
    mesesTrabajados: number;
    diasFraccionados: number;
    monto:           number;
}

function computeFraccionadas(
    salarioVES: number,
    diasUtilidades: number,
    anioFiscal: number,
    fechaIngreso: string,
    fechaCorte: string,
): UtilidadesFraccionadas | null {
    if (salarioVES <= 0 || diasUtilidades <= 0 || !fechaIngreso || !fechaCorte) return null;

    const inicioFiscal  = inicioDeAnio(anioFiscal);
    // Period starts at whichever is later: fiscal year start or hire date
    const periodoInicio = maxDate(inicioFiscal, fechaIngreso);

    if (fechaCorte <= periodoInicio) return null;

    const mesesTrabajados  = getMesesCompletos(periodoInicio, fechaCorte);
    if (mesesTrabajados <= 0) return null;

    const diasFraccionados = Math.ceil((diasUtilidades / 12) * mesesTrabajados);
    const salarioDia       = salarioVES / 30;
    const monto            = diasFraccionados * salarioDia;

    return {
        salarioVES, salarioDia, diasUtilidades, anioFiscal,
        inicioFiscal, periodoInicio, mesesTrabajados, diasFraccionados, monto,
    };
}

// ============================================================================
// SHARED UI ATOMS
// ============================================================================

function SectionHeader({ label, color }: { label: string; color?: "emerald" | "amber" }) {
    const cls = color === "amber"   ? "text-amber-500/70"
              : color === "emerald" ? "text-emerald-500/70"
              : "text-foreground/35";
    return <p className={`font-mono text-[9px] uppercase tracking-[0.2em] mb-2 pt-1 ${cls}`}>{label}</p>;
}

function CalcRow({ label, formula, value, accent, dim }: {
    label: string; formula?: string; value: string;
    accent?: "emerald" | "amber"; dim?: boolean;
}) {
    const valCls = dim ? "text-foreground/40"
        : accent === "emerald" ? "text-emerald-500"
        : accent === "amber"   ? "text-amber-500"
        : "text-foreground";
    return (
        <div className="flex items-start justify-between gap-2 py-1.5 border-b border-border-light/60 last:border-0">
            <div className="min-w-0">
                <span className="font-mono text-[11px] text-foreground/70 leading-snug">{label}</span>
                {formula && <div className="font-mono text-[9px] text-foreground/30 mt-0.5 tabular-nums">{formula}</div>}
            </div>
            <span className={`font-mono text-[12px] font-bold tabular-nums shrink-0 ${valCls}`}>{value}</span>
        </div>
    );
}

function Hr() { return <div className="border-t border-border-light my-2" />; }

// ============================================================================
// RIGHT PANEL — Constancia Completas
// ============================================================================

function ConstanciaCompletas({ calc, employeeName, employeeCedula, employeeCargo, companyName }: {
    calc: UtilidadesCompletas;
    employeeName: string; employeeCedula: string; employeeCargo?: string;
    companyName: string;
}) {
    const handlePdf = () => generateUtilidadesCompletasPdf({
        companyName,
        employee: { nombre: employeeName, cedula: employeeCedula, cargo: employeeCargo },
        anioFiscal:     calc.anioFiscal,
        salarioVES:     calc.salarioVES,
        salarioDia:     calc.salarioDia,
        diasUtilidades: calc.diasUtilidades,
        monto:          calc.monto,
    });

    return (
        <div className="max-w-2xl mx-auto space-y-3">
            <div className="flex justify-end">
                <button onClick={handlePdf}
                    className="flex items-center gap-2 h-8 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-mono text-[11px] uppercase tracking-[0.12em] transition-colors duration-150">
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                        <path d="M3 12h10M8 2v8m-3-3 3 3 3-3"/>
                    </svg>
                    Descargar PDF
                </button>
            </div>
            <div className="rounded-2xl border border-border-light bg-surface-1 overflow-hidden shadow-sm">

                {/* Header */}
                <div className="bg-[#12121a] px-8 py-6 relative overflow-hidden">
                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-emerald-500" />
                    <div className="absolute left-1.5 right-0 bottom-0 h-0.5 bg-emerald-400/50" />
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#64648a] mb-1">Constancia de Utilidades · Art. 131 + 174 LOTTT</p>
                            <p className="font-mono text-[17px] font-black uppercase text-white tracking-tight leading-none">{companyName}</p>
                        </div>
                        <div className="text-right shrink-0">
                            <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-[#64648a] mb-1">Año Fiscal</p>
                            <p className="font-mono text-[22px] font-black text-white">{calc.anioFiscal}</p>
                        </div>
                    </div>
                </div>

                {/* Employee */}
                <div className="px-8 py-5 border-b border-border-light grid grid-cols-3 gap-4">
                    <div className="col-span-2">
                        <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-foreground/30 mb-0.5">Trabajador</p>
                        <p className="font-mono text-[15px] font-bold text-foreground">{employeeName || "—"}</p>
                        {employeeCargo && <p className="font-mono text-[10px] text-foreground/40 mt-0.5 uppercase">{employeeCargo}</p>}
                    </div>
                    <div>
                        <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-foreground/30 mb-0.5">Cédula</p>
                        <p className="font-mono text-[13px] font-medium text-foreground">{employeeCedula || "—"}</p>
                    </div>
                </div>

                {/* Salary */}
                <div className="px-8 py-4 border-b border-border-light grid grid-cols-3 gap-4 bg-surface-2/50">
                    {[
                        { lbl: "Salario mensual",   val: fmt(calc.salarioVES) },
                        { lbl: "Salario diario",    val: `${fmt(calc.salarioDia)} / día` },
                        { lbl: "Días utilidades",   val: `${calc.diasUtilidades} días` },
                    ].map(({ lbl, val }) => (
                        <div key={lbl}>
                            <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-foreground/30 mb-0.5">{lbl}</p>
                            <p className="font-mono text-[11px] font-bold text-foreground tabular-nums">{val}</p>
                        </div>
                    ))}
                </div>

                {/* Concept */}
                <div className="px-8 py-5">
                    <div className="grid grid-cols-[1fr_auto_auto] gap-4 pb-2 border-b-2 border-border-light">
                        {["Concepto", "Días", "Monto"].map(h => (
                            <p key={h} className="font-mono text-[8px] uppercase tracking-[0.2em] text-foreground/30 text-right first:text-left">{h}</p>
                        ))}
                    </div>
                    <div className="grid grid-cols-[1fr_auto_auto] gap-4 py-4 border-b border-border-light/60 items-center">
                        <div>
                            <p className="font-mono text-[12px] font-bold text-foreground">Utilidades Anuales</p>
                            <p className="font-mono text-[8px] text-foreground/30 mt-0.5 uppercase tracking-wide">
                                Art. 131 + 174 LOTTT · {calc.diasUtilidades}d × {fmt(calc.salarioDia)}/día
                            </p>
                        </div>
                        <p className="font-mono text-[13px] tabular-nums text-foreground/60 text-right">{calc.diasUtilidades}</p>
                        <p className="font-mono text-[14px] font-black tabular-nums text-emerald-500 text-right">{fmt(calc.monto)}</p>
                    </div>
                    <div className="grid grid-cols-[1fr_auto] gap-4 pt-4 items-baseline">
                        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-foreground/50">Total a recibir</p>
                        <p className="font-mono text-[22px] font-black tabular-nums text-emerald-500 text-right">{fmt(calc.monto)}</p>
                    </div>
                </div>

                {/* Signatures */}
                <div className="px-8 py-6 border-t border-border-light grid grid-cols-2 gap-10">
                    {["Empleador", "Trabajador"].map(role => (
                        <div key={role} className="text-center">
                            <div className="h-10 border-b border-border-medium mb-2" />
                            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-foreground/30">{role}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// RIGHT PANEL — Constancia Fraccionadas
// ============================================================================

function ConstanciaFraccionadas({ calc, employeeName, employeeCedula, employeeCargo,
    companyName, fechaIngreso, fechaCorte }: {
    calc: UtilidadesFraccionadas;
    employeeName: string; employeeCedula: string; employeeCargo?: string;
    companyName: string; fechaIngreso: string; fechaCorte: string;
}) {
    const handlePdf = () => generateUtilidadesFraccionadasPdf({
        companyName,
        employee: { nombre: employeeName, cedula: employeeCedula, cargo: employeeCargo },
        anioFiscal:       calc.anioFiscal,
        fechaIngreso,
        fechaCorte,
        inicioFiscal:     calc.inicioFiscal,
        periodoInicio:    calc.periodoInicio,
        mesesTrabajados:  calc.mesesTrabajados,
        diasUtilidades:   calc.diasUtilidades,
        diasFraccionados: calc.diasFraccionados,
        salarioVES:       calc.salarioVES,
        salarioDia:       calc.salarioDia,
        monto:            calc.monto,
    });

    return (
        <div className="max-w-2xl mx-auto space-y-3">
            <div className="flex justify-end">
                <button onClick={handlePdf}
                    className="flex items-center gap-2 h-8 px-4 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-mono text-[11px] uppercase tracking-[0.12em] transition-colors duration-150">
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                        <path d="M3 12h10M8 2v8m-3-3 3 3 3-3"/>
                    </svg>
                    Descargar PDF
                </button>
            </div>
            <div className="rounded-2xl border border-amber-500/20 bg-surface-1 overflow-hidden shadow-sm">

                {/* Header */}
                <div className="bg-[#12121a] px-8 py-6 relative overflow-hidden">
                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-amber-500" />
                    <div className="absolute left-1.5 right-0 bottom-0 h-0.5 bg-amber-500/50" />
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#64648a] mb-1">Utilidades Fraccionadas · Art. 175 LOTTT</p>
                            <p className="font-mono text-[17px] font-black uppercase text-white tracking-tight leading-none">{companyName}</p>
                        </div>
                        <div className="text-right shrink-0">
                            <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-[#64648a] mb-1">Año Fiscal</p>
                            <p className="font-mono text-[22px] font-black text-white">{calc.anioFiscal}</p>
                        </div>
                    </div>
                </div>

                {/* Employee */}
                <div className="px-8 py-5 border-b border-border-light grid grid-cols-3 gap-4">
                    <div className="col-span-2">
                        <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-foreground/30 mb-0.5">Trabajador</p>
                        <p className="font-mono text-[15px] font-bold text-foreground">{employeeName || "—"}</p>
                        {employeeCargo && <p className="font-mono text-[10px] text-foreground/40 mt-0.5 uppercase">{employeeCargo}</p>}
                    </div>
                    <div>
                        <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-foreground/30 mb-0.5">Cédula</p>
                        <p className="font-mono text-[13px] font-medium text-foreground">{employeeCedula || "—"}</p>
                        <p className="font-mono text-[9px] text-foreground/35 mt-0.5">
                            {calc.mesesTrabajados} mes{calc.mesesTrabajados !== 1 ? "es" : ""} en {calc.anioFiscal}
                        </p>
                    </div>
                </div>

                {/* Period overview */}
                <div className="px-8 py-4 border-b border-border-light grid grid-cols-3 gap-4 bg-amber-500/3">
                    {[
                        { lbl: "Inicio período",    val: formatDateES(calc.periodoInicio) },
                        { lbl: "Fecha de corte",    val: formatDateES(fechaCorte) },
                        { lbl: "Meses trabajados",  val: `${calc.mesesTrabajados} mes${calc.mesesTrabajados !== 1 ? "es" : ""}` },
                    ].map(({ lbl, val }) => (
                        <div key={lbl}>
                            <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-foreground/30 mb-0.5">{lbl}</p>
                            <p className="font-mono text-[11px] font-bold text-foreground">{val}</p>
                        </div>
                    ))}
                </div>

                {/* Salary */}
                <div className="px-8 py-4 border-b border-border-light flex gap-8 bg-surface-2/50">
                    {[
                        { lbl: "Salario mensual",   val: fmt(calc.salarioVES) },
                        { lbl: "Salario diario",    val: `${fmt(calc.salarioDia)} / día` },
                        { lbl: "Días base anuales", val: `${calc.diasUtilidades} días` },
                    ].map(({ lbl, val }) => (
                        <div key={lbl}>
                            <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-foreground/30 mb-0.5">{lbl}</p>
                            <p className="font-mono text-[11px] font-bold text-foreground tabular-nums">{val}</p>
                        </div>
                    ))}
                </div>

                {/* Concepts */}
                <div className="px-8 py-5">
                    <div className="grid grid-cols-[1fr_auto_auto] gap-4 pb-2 border-b-2 border-border-light">
                        {["Concepto", "Días", "Monto"].map(h => (
                            <p key={h} className="font-mono text-[8px] uppercase tracking-[0.2em] text-foreground/30 text-right first:text-left">{h}</p>
                        ))}
                    </div>

                    <div className="py-3 border-b border-border-light/40">
                        <p className="font-mono text-[9px] text-foreground/30">
                            Fórmula: ⌈ {calc.diasUtilidades} días / 12 meses × {calc.mesesTrabajados} meses ⌉ = ⌈ {fmtN((calc.diasUtilidades / 12) * calc.mesesTrabajados)} ⌉
                        </p>
                    </div>

                    <div className="grid grid-cols-[1fr_auto_auto] gap-4 py-4 border-b border-border-light/60 items-center">
                        <div>
                            <p className="font-mono text-[12px] font-bold text-foreground">Utilidades Fraccionadas</p>
                            <p className="font-mono text-[8px] text-foreground/30 mt-0.5 uppercase tracking-wide">
                                Art. 175 LOTTT · {calc.diasUtilidades}d/12 × {calc.mesesTrabajados} meses
                            </p>
                        </div>
                        <p className="font-mono text-[13px] tabular-nums text-foreground/60 text-right">{calc.diasFraccionados}</p>
                        <p className="font-mono text-[14px] font-black tabular-nums text-amber-500 text-right">{fmt(calc.monto)}</p>
                    </div>

                    <div className="grid grid-cols-[1fr_auto] gap-4 pt-4 items-baseline">
                        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-foreground/50">Total fraccionado</p>
                        <p className="font-mono text-[22px] font-black tabular-nums text-amber-500 text-right">{fmt(calc.monto)}</p>
                    </div>
                </div>

                {/* Signatures */}
                <div className="px-8 py-6 border-t border-border-light grid grid-cols-2 gap-10">
                    {["Empleador", "Trabajador"].map(role => (
                        <div key={role} className="text-center">
                            <div className="h-10 border-b border-border-medium mb-2" />
                            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-foreground/30">{role}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// PAGE
// ============================================================================

type Mode = "completas" | "fraccionadas";

export default function UtilidadesPage() {
    const { companyId, company } = useCompany();
    const { employees, loading }  = useEmployee(companyId);

    // ── Mode ────────────────────────────────────────────────────────────────
    const [mode, setMode] = useState<Mode>("completas");

    // ── Employee ─────────────────────────────────────────────────────────────
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
            .then(d => { if (d.rate) { setBcvRate(d.rate); setBcvError(null); } else setBcvError("No disponible"); })
            .catch(() => setBcvError("Error al obtener tasa"))
            .finally(() => setBcvLoading(false));
    }, []);

    // Auto-populate salary from employee
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

    // ── Shared derived ────────────────────────────────────────────────────────
    const salarioVES  = parseFloat(salarioOverride) || 0;
    const fechaIngreso = selectedEmp?.fechaIngreso ?? manualIngreso;

    // ── Shared params ─────────────────────────────────────────────────────────
    const currentYear  = new Date().getFullYear();
    const [anioFiscal,     setAnioFiscal]     = useState(String(currentYear));
    const [diasUtilidades, setDiasUtilidades] = useState("15");

    // ── COMPLETAS ─────────────────────────────────────────────────────────────
    const calcCompletas = useMemo(
        () => computeCompletas(salarioVES, parseInt(diasUtilidades) || 0, parseInt(anioFiscal) || currentYear),
        [salarioVES, diasUtilidades, anioFiscal, currentYear],
    );

    // ── FRACCIONADAS ──────────────────────────────────────────────────────────
    const [fechaCorte, setFechaCorte] = useState(isoToday());

    const calcFrac = useMemo(
        () => computeFraccionadas(
            salarioVES,
            parseInt(diasUtilidades) || 0,
            parseInt(anioFiscal) || currentYear,
            fechaIngreso,
            fechaCorte,
        ),
        [salarioVES, diasUtilidades, anioFiscal, fechaIngreso, fechaCorte, currentYear],
    );

    // ── Mode toggle classes ───────────────────────────────────────────────────
    const modeBtnCls = (m: Mode) => [
        "flex-1 h-8 rounded-lg font-mono text-[10px] uppercase tracking-[0.14em] border transition-colors duration-150",
        mode === m
            ? "bg-primary-500 border-primary-600 text-white"
            : "bg-surface-1 border-border-light text-foreground/50 hover:border-border-medium hover:text-foreground",
    ].join(" ");

    return (
        <div className="min-h-full bg-surface-2 flex flex-col lg:flex-row overflow-hidden">

            {/* ══ LEFT PANEL ══════════════════════════════════════════════ */}
            <aside className="w-full lg:w-96 shrink-0 flex flex-col border-b lg:border-b-0 lg:border-r border-border-light bg-surface-1 overflow-y-auto">

                {/* Header + mode toggle */}
                <div className="px-5 py-4 border-b border-border-light space-y-3">
                    <div>
                        <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-foreground/30 mb-0.5">Nómina · Utilidades</p>
                        <p className="font-mono text-[14px] font-black uppercase tracking-tight text-foreground leading-none">Calculadora</p>
                        <p className="font-mono text-[9px] text-foreground/30 mt-1">Arts. 131 · 174 · 175 LOTTT</p>
                    </div>
                    <div className="flex gap-1.5">
                        <button onClick={() => setMode("completas")}    className={modeBtnCls("completas")}>Completas</button>
                        <button onClick={() => setMode("fraccionadas")} className={modeBtnCls("fraccionadas")}>Fraccionadas</button>
                    </div>
                </div>

                <div className="flex-1 divide-y divide-border-light">

                    {/* ── Empleado ───────────────────────────────────────── */}
                    <div className="px-5 py-4 space-y-3">
                        <SectionHeader label="Empleado" />
                        {!loading && employees.length > 0 && (
                            <div>
                                <label className={labelCls}>Seleccionar</label>
                                <select value={selectedCedula} onChange={e => setSelectedCedula(e.target.value)} className={fieldCls}>
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
                                        <span className="text-foreground/40">{k}</span>
                                        <span className="text-foreground tabular-nums">{v}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {/* Salario siempre editable */}
                        <div>
                            <label className={labelCls}>
                                Salario mensual (Bs.)
                                {selectedEmp && <span className="ml-1 text-primary-500/60">— editable</span>}
                            </label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[12px] text-foreground/35 pointer-events-none select-none">Bs.</span>
                                <input type="number" step="0.01" min="0" value={salarioOverride}
                                    onChange={e => setSalarioOverride(e.target.value)} placeholder="0.00"
                                    className={fieldCls + " pl-9 text-right"} />
                            </div>
                            {selectedEmp?.moneda === "USD" && (
                                <p className="font-mono text-[9px] text-foreground/25 mt-1">Pre-cargado desde USD (convertido con tasa BCV)</p>
                            )}
                        </div>
                        {!selectedEmp && (
                            <div>
                                <label className={labelCls}>Fecha de ingreso</label>
                                <input type="date" value={manualIngreso}
                                    onChange={e => setManualIngreso(e.target.value)} className={fieldCls} />
                                <p className="font-mono text-[9px] text-foreground/25 mt-1">Requerida para calcular fraccionadas</p>
                            </div>
                        )}
                    </div>

                    {/* ── Tasa BCV ────────────────────────────────────────── */}
                    <div className="px-5 py-4">
                        <SectionHeader label="Tasa BCV (auto)" />
                        {bcvLoading ? (
                            <div className="flex items-center gap-2 text-foreground/30">
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
                                <span className="font-mono text-[10px] text-foreground/35">Bs. / USD</span>
                                <span className="ml-auto font-mono text-[8px] text-primary-500/60 bg-primary-500/8 px-2 py-0.5 rounded">BCV HOY</span>
                            </div>
                        )}
                    </div>

                    {/* ── Parámetros ─────────────────────────────────────── */}
                    <div className="px-5 py-4 space-y-3">
                        <SectionHeader label="Parámetros" />
                        <div>
                            <label className={labelCls}>Año fiscal</label>
                            <input type="number" min="2000" max="2100" step="1"
                                value={anioFiscal}
                                onChange={e => setAnioFiscal(e.target.value)}
                                className={fieldCls + " text-right"} />
                        </div>
                        <div>
                            <label className={labelCls}>Días de utilidades</label>
                            <input type="number" min="15" max="120" step="1"
                                value={diasUtilidades}
                                onChange={e => setDiasUtilidades(e.target.value)}
                                className={fieldCls + " text-right"} />
                            <p className="font-mono text-[9px] text-foreground/25 mt-1">Mínimo 15 · Máximo 120 (Art. 174 LOTTT)</p>
                        </div>
                    </div>

                    {/* ══ MODE: COMPLETAS ════════════════════════════════════ */}
                    {mode === "completas" && (
                        <div className="px-5 py-4 space-y-0.5">
                            <SectionHeader label="Cálculo — Arts. 131 + 174 LOTTT" />
                            {calcCompletas ? (<>
                                <CalcRow label="Salario mensual"  value={fmt(calcCompletas.salarioVES)} dim />
                                <CalcRow label="Salario diario"  formula="salario ÷ 30"
                                    value={`${fmtN(calcCompletas.salarioDia)} Bs./día`} dim />
                                <Hr />
                                <SectionHeader label="Utilidades" color="emerald" />
                                <CalcRow label="Días de utilidades"
                                    formula={`Establecido por el empleador (mín. 15, máx. 120)`}
                                    value={`${calcCompletas.diasUtilidades} días`} dim />
                                <CalcRow label="Monto"
                                    formula={`${calcCompletas.diasUtilidades}d × ${fmtN(calcCompletas.salarioDia)} Bs./día`}
                                    value={fmt(calcCompletas.monto)} accent="emerald" />
                                <Hr />
                                <div className="flex items-baseline justify-between pt-1">
                                    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-foreground/50">Total</span>
                                    <span className="font-mono text-[20px] font-black tabular-nums text-emerald-500">{fmt(calcCompletas.monto)}</span>
                                </div>
                            </>) : (
                                <p className="font-mono text-[10px] text-foreground/30">
                                    {salarioVES <= 0 ? "Ingresa el salario del empleado." : "Verifica los parámetros."}
                                </p>
                            )}
                        </div>
                    )}

                    {/* ══ MODE: FRACCIONADAS ═════════════════════════════════ */}
                    {mode === "fraccionadas" && (<>

                        <div className="px-5 py-4 space-y-3">
                            <SectionHeader label="Período de Cálculo" />
                            <div>
                                <label className={labelCls}>Fecha de corte</label>
                                <input type="date" value={fechaCorte}
                                    onChange={e => setFechaCorte(e.target.value)} className={fieldCls} />
                                <p className="font-mono text-[9px] text-foreground/25 mt-1">
                                    Fecha de egreso o fin del período a calcular
                                </p>
                            </div>
                            {calcFrac && (
                                <div className="px-3 py-2.5 rounded-lg border border-amber-500/20 bg-amber-500/4 space-y-1.5">
                                    {[
                                        { k: "Inicio año fiscal",  v: calcFrac.inicioFiscal },
                                        { k: "Inicio período",     v: calcFrac.periodoInicio !== calcFrac.inicioFiscal
                                            ? `${calcFrac.periodoInicio} (desde ingreso)`
                                            : calcFrac.periodoInicio },
                                        { k: "Meses trabajados",   v: `${calcFrac.mesesTrabajados} mes${calcFrac.mesesTrabajados !== 1 ? "es" : ""}` },
                                        { k: "Días fraccionados",  v: `${calcFrac.diasFraccionados} días` },
                                    ].map(({ k, v }) => (
                                        <div key={k} className="flex justify-between font-mono text-[10px]">
                                            <span className="text-foreground/40">{k}</span>
                                            <span className="text-amber-500 tabular-nums font-medium">{v}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="px-5 py-4 space-y-0.5">
                            <SectionHeader label="Cálculo — Art. 175 LOTTT" />
                            {calcFrac ? (<>
                                <CalcRow label="Salario mensual"  value={fmt(calcFrac.salarioVES)} dim />
                                <CalcRow label="Salario diario"  formula="salario ÷ 30"
                                    value={`${fmtN(calcFrac.salarioDia)} Bs./día`} dim />
                                <Hr />
                                <SectionHeader label="Fracción proporcional" color="amber" />
                                <CalcRow label="Días anuales base"
                                    value={`${calcFrac.diasUtilidades} días`} dim />
                                <CalcRow label="Meses trabajados en el año"
                                    value={`${calcFrac.mesesTrabajados} meses`} dim />
                                <CalcRow label="Fórmula"
                                    formula={`⌈ ${calcFrac.diasUtilidades}d / 12 × ${calcFrac.mesesTrabajados} meses ⌉`}
                                    value={`${calcFrac.diasFraccionados} días`} dim />
                                <CalcRow label="Monto fraccionado"
                                    formula={`${calcFrac.diasFraccionados}d × ${fmtN(calcFrac.salarioDia)} Bs./día`}
                                    value={fmt(calcFrac.monto)} accent="amber" />
                                <Hr />
                                <div className="flex items-baseline justify-between pt-1">
                                    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-foreground/50">Total fraccionado</span>
                                    <span className="font-mono text-[20px] font-black tabular-nums text-amber-500">{fmt(calcFrac.monto)}</span>
                                </div>
                            </>) : (
                                <p className="font-mono text-[10px] text-foreground/30">
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
                        <ConstanciaCompletas
                            calc={calcCompletas}
                            employeeName={selectedEmp?.nombre  ?? "Empleado"}
                            employeeCedula={selectedEmp?.cedula ?? "—"}
                            employeeCargo={selectedEmp?.cargo}
                            companyName={company?.name ?? "La Empresa"}
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full gap-3 text-foreground/20">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.8">
                                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                            </svg>
                            <p className="font-mono text-[12px] uppercase tracking-widest">Ingresa los datos del empleado</p>
                        </div>
                    )
                ) : (
                    calcFrac ? (
                        <ConstanciaFraccionadas
                            calc={calcFrac}
                            employeeName={selectedEmp?.nombre  ?? "Empleado"}
                            employeeCedula={selectedEmp?.cedula ?? "—"}
                            employeeCargo={selectedEmp?.cargo}
                            companyName={company?.name ?? "La Empresa"}
                            fechaIngreso={fechaIngreso}
                            fechaCorte={fechaCorte}
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full gap-3 text-foreground/20">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.8">
                                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                            </svg>
                            <p className="font-mono text-[12px] uppercase tracking-widest">Ingresa los datos y la fecha de corte</p>
                        </div>
                    )
                )}
            </main>
        </div>
    );
}
