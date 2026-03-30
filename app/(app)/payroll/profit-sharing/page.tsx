"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { FileText, Download, RefreshCw, Users, Calendar, ClipboardCheck, Info, HandCoins, TrendingUp, ChevronDown } from "lucide-react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
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
    "font-mono text-[13px] text-foreground tabular-nums appearance-none",
    "focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150",
].join(" ");

const labelCls = "font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] mb-1.5 block";

function isoToday(): string { return new Date().toISOString().split("T")[0]; }

function formatDateES(iso: string): string {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
        "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    return `${parseInt(d)} de ${meses[parseInt(m) - 1]} de ${y}`;
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

/** ISO date for Jan 1 of a given year */
function inicioDeAnio(anio: number): string {
    return `${anio}-01-01`;
}

/** Later of two ISO dates */
function maxDate(a: string, b: string): string {
    return a > b ? a : b;
}

// ============================================================================
// CALCULATION ENGINES
// ============================================================================

interface UtilidadesCompletas {
    salarioVES: number;
    salarioDia: number;
    diasUtilidades: number;
    monto: number;
    anioFiscal: number;
}

function computeCompletas(
    salarioVES: number,
    diasUtilidades: number,
    anioFiscal: number,
): UtilidadesCompletas | null {
    if (salarioVES <= 0 || diasUtilidades <= 0) return null;
    const salarioDia = salarioVES / 30;
    const monto = diasUtilidades * salarioDia;
    return { salarioVES, salarioDia, diasUtilidades, monto, anioFiscal };
}

interface UtilidadesFraccionadas {
    salarioVES: number;
    salarioDia: number;
    diasUtilidades: number;
    anioFiscal: number;
    inicioFiscal: string;
    periodoInicio: string;   // max(inicioFiscal, fechaIngreso)
    mesesTrabajados: number;
    diasFraccionados: number;
    monto: number;
}

function computeFraccionadas(
    salarioVES: number,
    diasUtilidades: number,
    anioFiscal: number,
    fechaIngreso: string,
    fechaCorte: string,
): UtilidadesFraccionadas | null {
    if (salarioVES <= 0 || diasUtilidades <= 0 || !fechaIngreso || !fechaCorte) return null;

    const inicioFiscal = inicioDeAnio(anioFiscal);
    // Period starts at whichever is later: fiscal year start or hire date
    const periodoInicio = maxDate(inicioFiscal, fechaIngreso);

    if (fechaCorte <= periodoInicio) return null;

    const mesesTrabajados = getMesesCompletos(periodoInicio, fechaCorte);
    if (mesesTrabajados <= 0) return null;

    const diasFraccionados = Math.ceil((diasUtilidades / 12) * mesesTrabajados);
    const salarioDia = salarioVES / 30;
    const monto = diasFraccionados * salarioDia;

    return {
        salarioVES, salarioDia, diasUtilidades, anioFiscal,
        inicioFiscal, periodoInicio, mesesTrabajados, diasFraccionados, monto,
    };
}

// ============================================================================
// SHARED UI ATOMS
// ============================================================================

function SectionHeader({ label, color }: { label: string; color?: "emerald" | "amber" }) {
    const cls = color === "amber" ? "text-amber-500/70"
        : color === "emerald" ? "text-emerald-500/70"
            : "text-[var(--text-tertiary)]";
    return <p className={`font-mono text-[11px] uppercase tracking-[0.2em] mb-2 pt-1 ${cls}`}>{label}</p>;
}

function CalcRow({ label, formula, value, accent, dim }: {
    label: string; formula?: string; value: string;
    accent?: "emerald" | "amber"; dim?: boolean;
}) {
    const valCls = dim ? "text-[var(--text-tertiary)]"
        : accent === "emerald" ? "text-emerald-500"
            : accent === "amber" ? "text-amber-500"
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
// RIGHT PANEL — Constancia Completas
// ============================================================================

function ConstanciaCompletas({ calc, employeeName, employeeCedula, employeeCargo, companyName, companyLogoUrl, showLogoInPdf }: {
    calc: UtilidadesCompletas;
    employeeName: string; employeeCedula: string; employeeCargo?: string;
    companyName: string; companyLogoUrl?: string; showLogoInPdf?: boolean;
}) {
    const handlePdf = () => generateUtilidadesCompletasPdf({
        companyName,
        employee: { nombre: employeeName, cedula: employeeCedula, cargo: employeeCargo },
        anioFiscal: calc.anioFiscal,
        salarioVES: calc.salarioVES,
        salarioDia: calc.salarioDia,
        diasUtilidades: calc.diasUtilidades,
        monto: calc.monto,
        logoUrl: companyLogoUrl, showLogoInPdf,
    });

    return (
        <div className="max-w-2xl mx-auto space-y-3">
            <div className="flex justify-end">
                <BaseButton.Root
                    variant="primary"
                    size="sm"
                    onClick={handlePdf}
                    leftIcon={<Download size={14} />}
                >
                    Descargar PDF
                </BaseButton.Root>
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
                        <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-0.5">Trabajador</p>
                        <p className="font-mono text-[15px] font-bold text-foreground">{employeeName || "—"}</p>
                        {employeeCargo && <p className="font-mono text-[10px] text-[var(--text-tertiary)] mt-0.5 uppercase">{employeeCargo}</p>}
                    </div>
                    <div>
                        <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-0.5">Cédula</p>
                        <p className="font-mono text-[13px] font-medium text-foreground">{employeeCedula || "—"}</p>
                    </div>
                </div>

                {/* Salary */}
                <div className="px-8 py-4 border-b border-border-light grid grid-cols-3 gap-4 bg-surface-2/50">
                    {[
                        { lbl: "Salario mensual", val: fmt(calc.salarioVES) },
                        { lbl: "Salario diario", val: `${fmt(calc.salarioDia)} / día` },
                        { lbl: "Días utilidades", val: `${calc.diasUtilidades} días` },
                    ].map(({ lbl, val }) => (
                        <div key={lbl}>
                            <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-0.5">{lbl}</p>
                            <p className="font-mono text-[11px] font-bold text-foreground tabular-nums">{val}</p>
                        </div>
                    ))}
                </div>

                {/* Concept */}
                <div className="px-8 py-5">
                    <div className="grid grid-cols-[1fr_auto_auto] gap-4 pb-2 border-b-2 border-border-light">
                        {["Concepto", "Días", "Monto"].map(h => (
                            <p key={h} className="font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--text-tertiary)] text-right first:text-left">{h}</p>
                        ))}
                    </div>
                    <div className="grid grid-cols-[1fr_auto_auto] gap-4 py-4 border-b border-border-light/60 items-center">
                        <div>
                            <p className="font-mono text-[12px] font-bold text-foreground">Utilidades Anuales</p>
                            <p className="font-mono text-[8px] text-[var(--text-tertiary)] mt-0.5 uppercase tracking-wide">
                                Art. 131 + 174 LOTTT · {calc.diasUtilidades}d × {fmt(calc.salarioDia)}/día
                            </p>
                        </div>
                        <p className="font-mono text-[13px] tabular-nums text-[var(--text-secondary)] text-right">{calc.diasUtilidades}</p>
                        <p className="font-mono text-[14px] font-black tabular-nums text-emerald-500 text-right">{fmt(calc.monto)}</p>
                    </div>
                    <div className="grid grid-cols-[1fr_auto] gap-4 pt-4 items-baseline">
                        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--text-secondary)]">Total a recibir</p>
                        <p className="font-mono text-[22px] font-black tabular-nums text-emerald-500 text-right">{fmt(calc.monto)}</p>
                    </div>
                </div>

                {/* Signatures */}
                <div className="px-8 py-6 border-t border-border-light grid grid-cols-2 gap-10">
                    {["Empleador", "Trabajador"].map(role => (
                        <div key={role} className="text-center">
                            <div className="h-10 border-b border-border-medium mb-2" />
                            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">{role}</p>
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
    companyName, companyLogoUrl, showLogoInPdf, fechaIngreso, fechaCorte }: {
        calc: UtilidadesFraccionadas;
        employeeName: string; employeeCedula: string; employeeCargo?: string;
        companyName: string; companyLogoUrl?: string; showLogoInPdf?: boolean;
        fechaIngreso: string; fechaCorte: string;
    }) {
    const handlePdf = () => generateUtilidadesFraccionadasPdf({
        companyName,
        employee: { nombre: employeeName, cedula: employeeCedula, cargo: employeeCargo },
        anioFiscal: calc.anioFiscal,
        fechaIngreso,
        fechaCorte,
        inicioFiscal: calc.inicioFiscal,
        periodoInicio: calc.periodoInicio,
        mesesTrabajados: calc.mesesTrabajados,
        diasUtilidades: calc.diasUtilidades,
        diasFraccionados: calc.diasFraccionados,
        salarioVES: calc.salarioVES,
        salarioDia: calc.salarioDia,
        monto: calc.monto,
        logoUrl: companyLogoUrl, showLogoInPdf,
    });

    return (
        <div className="max-w-2xl mx-auto space-y-3">
            <div className="flex justify-end">
                <BaseButton.Root
                    variant="primary"
                    size="sm"
                    onClick={handlePdf}
                    leftIcon={<Download size={14} />}
                    className="bg-amber-500 hover:bg-amber-600 border-amber-600"
                >
                    Descargar PDF
                </BaseButton.Root>
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
                        <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-0.5">Trabajador</p>
                        <p className="font-mono text-[15px] font-bold text-foreground">{employeeName || "—"}</p>
                        {employeeCargo && <p className="font-mono text-[10px] text-[var(--text-tertiary)] mt-0.5 uppercase">{employeeCargo}</p>}
                    </div>
                    <div>
                        <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-0.5">Cédula</p>
                        <p className="font-mono text-[13px] font-medium text-foreground">{employeeCedula || "—"}</p>
                        <p className="font-mono text-[9px] text-[var(--text-tertiary)] mt-0.5">
                            {calc.mesesTrabajados} mes{calc.mesesTrabajados !== 1 ? "es" : ""} en {calc.anioFiscal}
                        </p>
                    </div>
                </div>

                {/* Period overview */}
                <div className="px-8 py-4 border-b border-border-light grid grid-cols-3 gap-4 bg-amber-500/3">
                    {[
                        { lbl: "Inicio período", val: formatDateES(calc.periodoInicio) },
                        { lbl: "Fecha de corte", val: formatDateES(fechaCorte) },
                        { lbl: "Meses trabajados", val: `${calc.mesesTrabajados} mes${calc.mesesTrabajados !== 1 ? "es" : ""}` },
                    ].map(({ lbl, val }) => (
                        <div key={lbl}>
                            <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-0.5">{lbl}</p>
                            <p className="font-mono text-[11px] font-bold text-foreground">{val}</p>
                        </div>
                    ))}
                </div>

                {/* Salary */}
                <div className="px-8 py-4 border-b border-border-light flex gap-8 bg-surface-2/50">
                    {[
                        { lbl: "Salario mensual", val: fmt(calc.salarioVES) },
                        { lbl: "Salario diario", val: `${fmt(calc.salarioDia)} / día` },
                        { lbl: "Días base anuales", val: `${calc.diasUtilidades} días` },
                    ].map(({ lbl, val }) => (
                        <div key={lbl}>
                            <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-0.5">{lbl}</p>
                            <p className="font-mono text-[11px] font-bold text-foreground tabular-nums">{val}</p>
                        </div>
                    ))}
                </div>

                {/* Concepts */}
                <div className="px-8 py-5">
                    <div className="grid grid-cols-[1fr_auto_auto] gap-4 pb-2 border-b-2 border-border-light">
                        {["Concepto", "Días", "Monto"].map(h => (
                            <p key={h} className="font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--text-tertiary)] text-right first:text-left">{h}</p>
                        ))}
                    </div>

                    <div className="py-3 border-b border-border-light/40">
                        <p className="font-mono text-[9px] text-[var(--text-tertiary)]">
                            Fórmula: ⌈ {calc.diasUtilidades} días / 12 meses × {calc.mesesTrabajados} meses ⌉ = ⌈ {fmtN((calc.diasUtilidades / 12) * calc.mesesTrabajados)} ⌉
                        </p>
                    </div>

                    <div className="grid grid-cols-[1fr_auto_auto] gap-4 py-4 border-b border-border-light/60 items-center">
                        <div>
                            <p className="font-mono text-[12px] font-bold text-foreground">Utilidades Fraccionadas</p>
                            <p className="font-mono text-[8px] text-[var(--text-tertiary)] mt-0.5 uppercase tracking-wide">
                                Art. 175 LOTTT · {calc.diasUtilidades}d/12 × {calc.mesesTrabajados} meses
                            </p>
                        </div>
                        <p className="font-mono text-[13px] tabular-nums text-[var(--text-secondary)] text-right">{calc.diasFraccionados}</p>
                        <p className="font-mono text-[14px] font-black tabular-nums text-amber-500 text-right">{fmt(calc.monto)}</p>
                    </div>

                    <div className="grid grid-cols-[1fr_auto] gap-4 pt-4 items-baseline">
                        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--text-secondary)]">Total fraccionado</p>
                        <p className="font-mono text-[22px] font-black tabular-nums text-amber-500 text-right">{fmt(calc.monto)}</p>
                    </div>
                </div>

                {/* Signatures */}
                <div className="px-8 py-6 border-t border-border-light grid grid-cols-2 gap-10">
                    {["Empleador", "Trabajador"].map(role => (
                        <div key={role} className="text-center">
                            <div className="h-10 border-b border-border-medium mb-2" />
                            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">{role}</p>
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
    const { employees, loading } = useEmployee(companyId);

    // ── Mode ────────────────────────────────────────────────────────────────
    const [mode, setMode] = useState<Mode>("completas");

    // ── Employee ─────────────────────────────────────────────────────────────
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

    // ── Shared derived ────────────────────────────────────────────────────────
    const selectedEmp = useMemo(() => employees.find(e => e.cedula === selectedCedula), [employees, selectedCedula]);

    // Salary field auto-populated from employee data, overridable by user.
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

    // ── Shared params ─────────────────────────────────────────────────────────
    const currentYear = new Date().getFullYear();
    const [anioFiscal, setAnioFiscal] = useState(String(currentYear));
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

    // ── BATCH PROCESSING ─────────────────────────────────────────────────────

    interface UtilResult {
        emp:  Employee;
        calc: UtilidadesCompletas | UtilidadesFraccionadas | null;
        msg?: string;
    }

    const filtered = useMemo(() => {
        const pool = soloActivos ? employees.filter(e => e.estado === "activo") : employees;
        if (!selectedCedula) return pool;
        return pool.filter(e => e.cedula === selectedCedula);
    }, [employees, soloActivos, selectedCedula]);

    const results = useMemo<UtilResult[]>(() => {
        return filtered.map(emp => {
            const ves = emp.moneda === "USD" ? emp.salarioMensual * bcvRate : emp.salarioMensual;
            const ing = emp.fechaIngreso ?? "";

            let calc: UtilidadesCompletas | UtilidadesFraccionadas | null = null;
            let msg: string | undefined;

            if (mode === "completas") {
                calc = computeCompletas(ves, parseInt(diasUtilidades) || 0, parseInt(anioFiscal) || currentYear);
                if (!calc) msg = "Verificar parámetros";
            } else {
                calc = computeFraccionadas(ves, parseInt(diasUtilidades) || 0, parseInt(anioFiscal) || currentYear, ing, fechaCorte);
                if (!calc) msg = "Verificar fechas/parámetros";
            }

            return { emp, calc, msg };
        });
    }, [filtered, mode, diasUtilidades, anioFiscal, currentYear, fechaCorte, bcvRate]);

    const totalGral = useMemo(() => results.reduce((acc, r) => acc + (r.calc?.monto ?? 0), 0), [results]);

    return (
        <div className="min-h-full bg-surface-2 flex flex-col overflow-hidden">
            <PageHeader
                title="Utilidades"
                subtitle="Cálculo de utilidades anuales y fraccionadas (Arts. 131 · 174 LOTTT)"
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
                    <div className="px-5 py-5 border-b border-border-light bg-surface-2/[0.03]">
                        <label className={labelCls + " mb-2"}>Tipo de Utilidades</label>
                        <div className="grid grid-cols-2 gap-2">
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
                                <HandCoins size={14} /> Fraccionadas
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 divide-y divide-border-light">

                        {/* ── Empleado ───────────────────────────────────────── */}
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
                                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
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
                                    <label className={labelCls}>
                                        Salario mensual (Bs.)
                                        <span className="ml-1 text-[var(--text-link)]">— editable</span>
                                    </label>
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
                            {bcvError && <p className="font-mono text-[10px] text-red-500 mt-1.5">{bcvError}</p>}
                        </div>

                        {/* ── Parámetros ─────────────────────────────────────── */}
                        <div className="px-5 py-5 space-y-4">
                            <SectionHeader label="Configuración Fiscal" />
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelCls}>Año fiscal</label>
                                    <div className="relative">
                                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={13} />
                                        <input type="number" min="2000" max="2100" step="1"
                                            value={anioFiscal}
                                            onChange={e => setAnioFiscal(e.target.value)}
                                            className={fieldCls + " pl-9 text-right"} />
                                    </div>
                                </div>
                                <div>
                                    <label className={labelCls}>Días util.</label>
                                    <div className="relative">
                                        <HandCoins className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={13} />
                                        <input type="number" min="15" max="120" step="1"
                                            value={diasUtilidades}
                                            onChange={e => setDiasUtilidades(e.target.value)}
                                            className={fieldCls + " pl-9 text-right"} />
                                    </div>
                                </div>
                            </div>
                            <p className="font-mono text-[10px] text-[var(--text-disabled)] leading-relaxed">
                                <Info size={10} className="inline mr-1 -mt-0.5" />
                                Basado en Arts. 131 y 174 de la LOTTT.
                            </p>
                        </div>

                        {/* ══ MODE: COMPLETAS ════════════════════════════════════ */}
                        {mode === "completas" && (
                            <div className="px-5 py-4 space-y-0.5">
                                <SectionHeader label="Cálculo — Arts. 131 + 174 LOTTT" />
                                {calcCompletas ? (<>
                                    <CalcRow label="Salario mensual" value={fmt(calcCompletas.salarioVES)} dim />
                                    <CalcRow label="Salario diario" formula="salario ÷ 30"
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
                                        <span className="font-mono text-[12px] font-bold uppercase tracking-[0.18em] text-[var(--text-secondary)]">Total</span>
                                        <span className="font-mono text-[20px] font-black tabular-nums text-emerald-500">{fmt(calcCompletas.monto)}</span>
                                    </div>
                                </>) : (
                                    <p className="font-mono text-[12px] text-[var(--text-tertiary)]">
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
                                    <p className="font-mono text-[12px] text-[var(--text-disabled)] mt-1">
                                        Fecha de egreso o fin del período a calcular
                                    </p>
                                </div>
                                {calcFrac && (
                                    <div className="px-3 py-2.5 rounded-lg border border-amber-500/20 bg-amber-500/4 space-y-1.5">
                                        {[
                                            { k: "Inicio año fiscal", v: calcFrac.inicioFiscal },
                                            {
                                                k: "Inicio período", v: calcFrac.periodoInicio !== calcFrac.inicioFiscal
                                                    ? `${calcFrac.periodoInicio} (desde ingreso)`
                                                    : calcFrac.periodoInicio
                                            },
                                            { k: "Meses trabajados", v: `${calcFrac.mesesTrabajados} mes${calcFrac.mesesTrabajados !== 1 ? "es" : ""}` },
                                            { k: "Días fraccionados", v: `${calcFrac.diasFraccionados} días` },
                                        ].map(({ k, v }) => (
                                            <div key={k} className="flex justify-between font-mono text-[12px]">
                                                <span className="text-[var(--text-tertiary)]">{k}</span>
                                                <span className="text-amber-500 tabular-nums font-medium">{v}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="px-5 py-4 space-y-0.5">
                                <SectionHeader label="Cálculo — Art. 175 LOTTT" />
                                {calcFrac ? (<>
                                    <CalcRow label="Salario mensual" value={fmt(calcFrac.salarioVES)} dim />
                                    <CalcRow label="Salario diario" formula="salario ÷ 30"
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
                                        <span className="font-mono text-[12px] font-bold uppercase tracking-[0.18em] text-[var(--text-secondary)]">Total fraccionado</span>
                                        <span className="font-mono text-[20px] font-black tabular-nums text-amber-500">{fmt(calcFrac.monto)}</span>
                                    </div>
                                </>) : (
                                    <p className="font-mono text-[12px] text-[var(--text-tertiary)]">
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

                    {/* Totals + export */}
                    <div className="p-5 border-t border-border-light space-y-4 mt-auto bg-surface-2/[0.03]">
                        {results.length > 0 && (
                            <div className="space-y-2 mb-4 bg-surface-2/40 rounded-xl p-4 border border-border-light/50">
                                <div className="flex justify-between font-mono text-[11px] uppercase tracking-wider">
                                    <span className="text-[var(--text-tertiary)]">Empleados</span>
                                    <span className="text-foreground font-bold">{results.length}</span>
                                </div>
                                
                                <div className="flex justify-between items-baseline pt-2 border-t border-border-light/30">
                                    <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--text-secondary)] font-bold">Total Gral.</span>
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
                            Exportar Lote
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
                             <HandCoins size={48} strokeWidth={1} />
                             <p className="font-mono text-[12px] uppercase tracking-widest">Selecciona empleados para calcular</p>
                        </div>
                    ) : (
                        <div className="max-w-2xl mx-auto space-y-8">
                            {results.map(r => {
                                if (r.msg) return (
                                    <div key={r.emp.cedula} className="bg-surface-1 rounded-xl p-4 border border-border-light flex justify-between items-center opacity-70">
                                        <div>
                                            <p className="font-mono text-[13px] font-bold uppercase text-foreground">{r.emp.nombre}</p>
                                            <p className="font-mono text-[10px] text-[var(--text-tertiary)] uppercase">{r.emp.cargo}</p>
                                        </div>
                                        <span className="font-mono text-[10px] text-amber-500 uppercase border border-amber-500/20 px-2 py-0.5 rounded">{r.msg}</span>
                                    </div>
                                );

                                if (mode === "completas") return (
                                    <ConstanciaCompletas
                                        key={r.emp.cedula}
                                        calc={r.calc as UtilidadesCompletas}
                                        employeeName={r.emp.nombre}
                                        employeeCedula={r.emp.cedula}
                                        employeeCargo={r.emp.cargo}
                                        companyName={company?.name ?? "La Empresa"}
                                    />
                                );

                                return (
                                    <ConstanciaFraccionadas
                                        key={r.emp.cedula}
                                        calc={r.calc as UtilidadesFraccionadas}
                                        employeeName={r.emp.nombre}
                                        employeeCedula={r.emp.cedula}
                                        employeeCargo={r.emp.cargo}
                                        companyName={company?.name ?? "La Empresa"}
                                        fechaIngreso={r.emp.fechaIngreso ?? ""}
                                        fechaCorte={fechaCorte}
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
