"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { 
    FileText, 
    Download, 
    Users, 
    Calendar, 
    ClipboardCheck, 
    Terminal, 
    RefreshCw, 
    TrendingUp, 
    Info 
} from "lucide-react";
import { useCompany }  from "@/src/modules/companies/frontend/hooks/use-companies";
import { useEmployee } from "@/src/modules/payroll/frontend/hooks/use-employee";
import type { Employee } from "@/src/modules/payroll/frontend/hooks/use-employee";
import { generateLiquidacionPdf } from "@/src/modules/payroll/frontend/utils/liquidaciones-pdf";
import type { LiquidacionEmployee, LiquidacionOptions } from "@/src/modules/payroll/frontend/utils/liquidaciones-pdf";

// ============================================================================
// HELPERS
// ============================================================================

const fmtVES = (n: number) =>
    "Bs. " + n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtN = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fieldCls = [
    "w-full h-9 px-3 rounded-lg border border-border-light bg-surface-1 outline-none",
    "font-mono text-[13px] text-foreground tabular-nums",
    "focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150",
].join(" ");

const labelCls = "font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] mb-1.5 block";

// ============================================================================
// LIQUIDACIÓN ENGINE
// ============================================================================

type Motivo = "renuncia" | "despido_justificado" | "despido_injustificado";

interface EmpLiqResult {
    employee:            Employee;
    salarioVES:          number;
    antiguedadAnios:     number;
    antiguedadDias:      number;   // días totales desde ingreso
    diasPrest:           number;
    diasPrestTrimestr:   number;   // base trimestral (5/mes)
    diasPrestAdic:       number;   // días adicionales (2/año desde año 2)
    prestaciones:        number;
    diasEnAnioActual:    number;   // días trabajados en el año calendario del egreso
    diasDesdeAniversario: number;  // días del último período incompleto (para vac/bono)
    utilFrac:            number;
    vacFrac:             number;
    bonoVacFrac:         number;
    indemnizacion:       number;
    total:               number;
    warning?:            string;
}

function calcLiqEmp(
    emp:      Employee,
    egreso:   string,
    motivo:   Motivo,
    diasUtil: number,
    diasBono: number,
    bcvRate:  number,
): EmpLiqResult {
    const base: EmpLiqResult = {
        employee: emp, salarioVES: 0,
        antiguedadAnios: 0, antiguedadDias: 0,
        diasPrest: 0, diasPrestTrimestr: 0, diasPrestAdic: 0,
        prestaciones: 0, diasEnAnioActual: 0, diasDesdeAniversario: 0,
        utilFrac: 0, vacFrac: 0, bonoVacFrac: 0,
        indemnizacion: 0, total: 0,
    };

    if (!emp.fechaIngreso) return { ...base, warning: "Sin fecha de ingreso" };
    const ingreso = new Date(emp.fechaIngreso + "T00:00:00");
    const egresoD = new Date(egreso + "T00:00:00");
    if (egresoD <= ingreso) return { ...base, warning: "Egreso anterior a ingreso" };

    const salarioVES = emp.moneda === "USD" ? emp.salarioMensual * bcvRate : emp.salarioMensual;
    if (salarioVES <= 0) return { ...base, salarioVES, warning: "Salario cero" };

    const msDay     = 86400000;
    const totalDias = Math.floor((egresoD.getTime() - ingreso.getTime()) / msDay);
    const anios     = Math.floor(totalDias / 365);

    // ── PRESTACIONES SOCIALES (Art. 142 LOTTT) ────────────────────────────
    // Base: 15 días por trimestre = 5 días/mes (60 días/año)
    const totalMeses       = Math.floor(totalDias / 30.4375);
    const diasPrestTrimestr = totalMeses * 5;

    // Adicionales: el depósito anual CRECE 2d por año de servicio (acumulativo).
    // Año 2: +2d, Año 3: +4d, Año 4: +6d ... → total acum = N×(N-1)
    // Cap: depósito anual máximo 30d (Art. 142b, se alcanza en año 16).
    const diasUltimoAnio = totalDias % 365;
    const diasAdicFull   = anios <= 16
        ? anios * Math.max(0, anios - 1)
        : 240 + 30 * (anios - 16);
    const diasPrestAdic  = diasAdicFull
        + (anios >= 1 && diasUltimoAnio > 182 ? Math.min(30, 2 * anios) : 0);
    const diasPrest      = diasPrestTrimestr + diasPrestAdic;

    // Salario integral diario (año comercial 360 días — práctica venezolana)
    const salarioDiarioPuro = salarioVES / 30;
    const alicuotaUtil      = salarioDiarioPuro * diasUtil / 360;
    const alicuotaBono      = salarioDiarioPuro * diasBono / 360;
    const salarioDiario     = salarioDiarioPuro + alicuotaUtil + alicuotaBono;

    const prestaciones = diasPrest * salarioDiario;

    // ── UTILIDADES FRACCIONADAS ───────────────────────────────────────────
    // Días trabajados en el año CALENDARIO del egreso
    // (desde el 1-ene del año de egreso o ingreso, lo que sea posterior)
    const inicioAnioCalendario = new Date(egresoD.getFullYear(), 0, 1);
    const refUtilidades        = ingreso > inicioAnioCalendario ? ingreso : inicioAnioCalendario;
    const diasEnAnioActual     = Math.floor((egresoD.getTime() - refUtilidades.getTime()) / msDay);

    const utilFrac = (salarioVES / 30) * diasUtil * (diasEnAnioActual / 365);

    // ── VACACIONES Y BONO FRACCIONADOS ────────────────────────────────────
    // Basado en el período incompleto DESDE EL ÚLTIMO ANIVERSARIO
    const diasDesdeAniversario = anios >= 1 ? diasUltimoAnio : totalDias;
    const diasVacBase          = Math.max(15, 15 + Math.max(0, anios - 1));

    const vacFrac     = (salarioVES / 30) * diasVacBase * (diasDesdeAniversario / 365);
    const bonoVacFrac = (salarioVES / 30) * diasBono   * (diasDesdeAniversario / 365);

    const indemnizacion = motivo === "despido_injustificado" ? prestaciones : 0;
    const total = prestaciones + utilFrac + vacFrac + bonoVacFrac + indemnizacion;

    return {
        employee: emp, salarioVES,
        antiguedadAnios: anios, antiguedadDias: totalDias,
        diasPrest, diasPrestTrimestr, diasPrestAdic,
        prestaciones, diasEnAnioActual, diasDesdeAniversario,
        utilFrac, vacFrac, bonoVacFrac, indemnizacion, total,
    };
}

function exportCsv(results: EmpLiqResult[], egreso: string, motivo: Motivo) {
    const motivoLabel = motivo === "renuncia" ? "Renuncia" : motivo === "despido_justificado" ? "Despido justificado" : "Despido injustificado";
    const headers = ["Empleado", "Cédula", "Cargo", "Salario Bs.", "Antigüedad (días)", "Días Prest.", "Días Adic.", "Prestaciones", "Util. Frac.", "Vac. Frac.", "Bono Vac.", "Indemnización", "Total Bs.", "Observación"];
    const rows = results.map((r) => [
        r.employee.nombre, r.employee.cedula, r.employee.cargo,
        fmtN(r.salarioVES), r.antiguedadDias, r.diasPrestTrimestr, r.diasPrestAdic,
        fmtN(r.prestaciones), fmtN(r.utilFrac), fmtN(r.vacFrac),
        fmtN(r.bonoVacFrac), fmtN(r.indemnizacion), fmtN(r.total),
        r.warning ?? "",
    ]);
    const meta = [[`Fecha de egreso: ${egreso}`, `Motivo: ${motivoLabel}`], []];
    const csv  = [...meta, headers, ...rows].map((r) => r.join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `liquidaciones_${egreso.replaceAll("-", "")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

function formatDateES(iso: string): string {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    const meses = ["enero","febrero","marzo","abril","mayo","junio",
                   "julio","agosto","septiembre","octubre","noviembre","diciembre"];
    return `${parseInt(d)} de ${meses[parseInt(m) - 1]} de ${y}`;
}

// ============================================================================
// CARD — Constancia de Liquidación (formato visual vacaciones)
// ============================================================================

function ConstanciaLiquidacion({ r, companyName, egreso, motivo, diasUtil, diasBono }: {
    r: EmpLiqResult; companyName: string; egreso: string; motivo: Motivo;
    diasUtil: string; diasBono: string;
}) {
    const motivoLabel = motivo === "renuncia" ? "Renuncia voluntaria"
        : motivo === "despido_justificado" ? "Despido justificado"
        : "Despido injustificado";
    const accent      = motivo === "despido_injustificado" ? "#dc2626" : "#FF4A18";
    const accentLight = motivo === "despido_injustificado" ? "#fca5a5" : "#FF7450";
    const emitido     = new Date().toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
    const diasVacBase = Math.max(15, 15 + Math.max(0, r.antiguedadAnios - 1));

    const concepts: { label: string; sub: string; dias?: number; monto: number; alt: boolean }[] = [
        { label: "Prestaciones sociales", sub: `Art. 142 LOTTT · ${r.diasPrestTrimestr}d trim.${r.diasPrestAdic > 0 ? ` + ${r.diasPrestAdic}d adic.` : ""}`, dias: r.diasPrest, monto: r.prestaciones, alt: false },
        { label: "Utilidades fraccionadas", sub: `${r.diasEnAnioActual}d en año × ${diasUtil}d util. / 365`, monto: r.utilFrac, alt: true },
        { label: "Vacaciones fraccionadas", sub: `${r.diasDesdeAniversario}d / 365 × ${diasVacBase}d vac.`, monto: r.vacFrac, alt: false },
        { label: "Bono vacacional fraccionado", sub: `${r.diasDesdeAniversario}d / 365 × ${diasBono}d bono`, monto: r.bonoVacFrac, alt: true },
        ...(r.indemnizacion > 0 ? [{ label: "Indemnización por despido", sub: "Art. 92 LOTTT — igual al monto de prestaciones", monto: r.indemnizacion, alt: false }] : []),
    ].filter(c => c.monto > 0);

    if (r.warning) return (
        <div className="bg-[#f6f6fa] rounded-xl overflow-hidden border border-[#dadae2] shadow-sm">
            <div className="bg-[#12121a] px-8 py-4 relative overflow-hidden">
                <div className="absolute left-0 top-0 w-1 bottom-0 bg-amber-500" />
                <div className="pl-3 flex items-center justify-between">
                    <p className="font-mono text-[13px] font-bold uppercase text-white">{r.employee.nombre}</p>
                    <span className="font-mono text-[11px] text-amber-400 uppercase tracking-widest border border-amber-500/40 px-2 py-0.5 rounded">{r.warning}</span>
                </div>
            </div>
        </div>
    );

    return (
        <div className="bg-[#f6f6fa] rounded-xl overflow-hidden shadow-md border border-[#dadae2] max-w-2xl mx-auto">

            {/* Header */}
            <div className="bg-[#12121a] px-8 py-5 relative overflow-hidden">
                <div className="absolute left-0 top-0 w-1 bottom-0.5" style={{ backgroundColor: accent }} />
                <div className="absolute left-1 right-0 bottom-0 h-0.5" style={{ backgroundColor: accentLight }} />
                <div className="pl-3 flex items-start justify-between gap-4">
                    <div>
                        <p className="font-mono text-[17px] font-black uppercase text-white tracking-tight leading-none">{companyName}</p>
                        <p className="font-mono text-[10px] text-[#787884] mt-1.5 uppercase tracking-[0.2em]">Constancia de Liquidación Laboral</p>
                        <p className="font-mono text-[9px] text-[#505064] mt-0.5">Art. 142 LOTTT — {motivoLabel}</p>
                    </div>
                    <div className="text-right shrink-0">
                        <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-[#787884] mb-1">Fecha de Egreso</p>
                        <p className="font-mono text-[11px] font-bold text-white">{formatDateES(egreso)}</p>
                        <p className="font-mono text-[8px] text-[#787884] mt-1.5">Emitido: {emitido}</p>
                    </div>
                </div>
            </div>

            {/* Employee card */}
            <div className="mx-6 mt-5 bg-white border border-[#dadae2] rounded relative overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ backgroundColor: accent }} />
                <div className="pl-5 pr-5 py-3 flex items-start justify-between">
                    <div>
                        <p className="font-mono text-[14px] font-black uppercase text-[#32323c] tracking-tight">{r.employee.nombre}</p>
                        {r.employee.cargo && <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#787884] mt-0.5">{r.employee.cargo}</p>}
                    </div>
                    <div className="text-right">
                        <p className="font-mono text-[12px] font-bold text-[#32323c]">CI: {r.employee.cedula}</p>
                        <p className="font-mono text-[9px] text-[#787884] mt-0.5">{r.antiguedadAnios} año{r.antiguedadAnios !== 1 ? "s" : ""} de servicio</p>
                    </div>
                </div>
            </div>

            {/* Params strip */}
            <div className="mx-6 mt-3 bg-[#12121a] px-5 py-3 grid grid-cols-4 gap-3">
                {[
                    { lbl: "Salario Mensual",  val: fmtVES(r.salarioVES),                          cls: "text-white" },
                    { lbl: "Fecha de Ingreso", val: formatDateES(r.employee.fechaIngreso ?? "").toUpperCase(), cls: "text-white" },
                    { lbl: "Antigüedad",       val: `${r.antiguedadAnios}a ${r.antiguedadDias % 365}d`, cls: "text-[#96c8dc]" },
                    { lbl: "Sal. Integral/Día",val: fmtVES(r.diasPrest > 0 ? r.prestaciones / r.diasPrest : r.salarioVES / 30), cls: "text-white" },
                ].map(({ lbl, val, cls }) => (
                    <div key={lbl}>
                        <p className="font-mono text-[7px] uppercase tracking-[0.18em] text-[#787884] mb-1">{lbl}</p>
                        <p className={`font-mono text-[10px] font-bold tabular-nums leading-snug ${cls}`}>{val}</p>
                    </div>
                ))}
            </div>

            {/* Concept table */}
            <div className="mx-6 mt-3">
                <div className="bg-[#12121a] px-5 py-2 flex justify-between">
                    <p className="font-mono text-[7px] uppercase tracking-[0.22em] text-[#787884]">Concepto</p>
                    <div className="flex gap-10">
                        <p className="font-mono text-[7px] uppercase tracking-[0.22em] text-[#787884]">Días</p>
                        <p className="font-mono text-[7px] uppercase tracking-[0.22em] text-[#787884]">Monto</p>
                    </div>
                </div>
                {concepts.map((c, i) => (
                    <div key={c.label} className={`px-5 py-3 flex items-start justify-between border-b border-[#dadae2] ${c.alt ? "bg-[#f0f0f5]" : "bg-white"}`}>
                        <div>
                            <p className="font-mono text-[12px] font-bold text-[#32323c]">{c.label}</p>
                            <p className="font-mono text-[8px] text-[#787884] mt-0.5 uppercase tracking-wide">{c.sub}</p>
                        </div>
                        <div className="flex items-center gap-10 text-right shrink-0">
                            <p className="font-mono text-[11px] tabular-nums text-[#787884]">{c.dias != null ? `${c.dias} d` : "—"}</p>
                            <p className="font-mono text-[13px] font-black tabular-nums" style={{ color: i === concepts.length - 1 && r.indemnizacion > 0 ? "#dc2626" : i % 2 === 0 ? accent : "#b4780a" }}>
                                Bs. {fmtN(c.monto)}
                            </p>
                        </div>
                    </div>
                ))}
                {/* Total bar */}
                <div className="bg-[#12121a] px-5 py-3 flex items-center justify-between relative">
                    <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ backgroundColor: accentLight }} />
                    <p className="pl-3 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[#787884]">
                        Total Liquidación
                    </p>
                    <p className="font-mono text-[16px] font-black tabular-nums" style={{ color: accentLight }}>
                        Bs. {fmtN(r.total)}
                    </p>
                </div>
            </div>

            {/* Firmas */}
            <div className="mx-6 mt-6 mb-2">
                <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-[#32323c] font-bold mb-3">Firmas de Conformidad</p>
                <div className="grid grid-cols-2 gap-8">
                    {["Empleador", "Trabajador"].map(role => (
                        <div key={role} className="bg-white border border-[#dadae2] rounded overflow-hidden">
                            <div className="h-[3px] w-full bg-[#787884]" />
                            <div className="px-4 pt-4 pb-3">
                                <div className="h-8 border-b border-[#afafb9] mb-2" />
                                <p className="font-mono text-[8px] uppercase tracking-[0.22em] text-[#787884] text-center">{role}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Legal */}
            <div className="mx-6 mb-5 mt-4 pt-3 border-t border-[#dadae2]">
                <p className="font-mono text-[8px] text-[#787884] leading-relaxed">
                    La presente constancia certifica la liquidación laboral de conformidad con la Ley Orgánica del Trabajo, los Trabajadores y las Trabajadoras (LOTTT). El monto incluye prestaciones sociales (Art. 142), utilidades fraccionadas, vacaciones y bono vacacional fraccionados{motivo === "despido_injustificado" ? " e indemnización por despido injustificado (Art. 92)" : ""}.
                </p>
            </div>

            {/* Footer */}
            <div className="bg-[#12121a] px-8 py-2.5 relative">
                <div className="absolute top-0 left-0 right-0 h-0.5" style={{ backgroundColor: accentLight }} />
                <p className="font-mono text-[7px] text-[#505064] text-center uppercase tracking-[0.2em]">
                    {companyName.toUpperCase()} · Liquidación Laboral · Documento Confidencial
                </p>
            </div>
        </div>
    );
}

// ============================================================================
// CONFIG SECTION
// ============================================================================

function ConfigSection({ title, open, onToggle, children }: {
    title: string; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
    return (
        <div className="border-b border-border-light last:border-0">
            <button onClick={onToggle} className="w-full flex items-center justify-between px-5 py-3 hover:bg-foreground/[0.02] transition-colors duration-150">
                <span className="font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--text-secondary)]">{title}</span>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    className="text-[var(--text-tertiary)] flex-shrink-0 transition-transform duration-200"
                    style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>
                    <path d="M2 4l3 3 3-3" />
                </svg>
            </button>
            {open && <div className="px-5 pb-4">{children}</div>}
        </div>
    );
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
// PAGE
// ============================================================================

export default function LiquidacionesPage() {
    const { companyId, company } = useCompany();
    const { employees, loading, error } = useEmployee(companyId);

    const today = new Date().toISOString().split("T")[0];

    const [egreso,      setEgreso]      = useState(today);
    const [motivo,      setMotivo]      = useState<Motivo>("renuncia");
    const [diasUtil,    setDiasUtil]    = useState("120");
    const [diasBono,    setDiasBono]    = useState("15");
    const [soloActivos, setSoloActivos] = useState(true);
    const [openCfg,     setOpenCfg]     = useState(true);
    const [selectedCedula, setSelectedCedula] = useState<string>("");
    const selectedEmp = useMemo(
        () => employees.find(e => e.cedula === selectedCedula),
        [employees, selectedCedula]
    );

    // ── BCV fetch ──────────────────────────────────────────────────────────
    const [exchangeRate,  setExchangeRate]  = useState("79.59");
    const [bcvLoading,     setBcvLoading]     = useState(false);
    const [bcvFetchError,  setBcvFetchError]  = useState<string | null>(null);

    const fetchBcvRate = useCallback(async () => {
        setBcvLoading(true);
        setBcvFetchError(null);
        try {
            const iso = new Date().toISOString().split("T")[0];
            const res  = await fetch(`/api/bcv/rate?date=${iso}`);
            const data = await res.json();
            if (!res.ok) { setBcvFetchError(data.error ?? "No rate found"); return; }
            setExchangeRate(String(data.price || data.rate));
        } catch {
            setBcvFetchError("No se pudo conectar.");
        } finally {
            setBcvLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchBcvRate();
    }, [fetchBcvRate]);

    const bcvRate = useMemo(() => parseFloat(exchangeRate) || 0, [exchangeRate]);

    const filtered = useMemo(() => {
        const pool = soloActivos ? employees.filter((e) => e.estado === "activo") : employees;
        if (!selectedCedula) return pool;
        return pool.filter((e) => e.cedula === selectedCedula);
    }, [employees, soloActivos, selectedCedula]);

    const results = useMemo<EmpLiqResult[]>(() =>
        filtered.map(emp => calcLiqEmp(
            emp, egreso, motivo,
            parseFloat(diasUtil) || 120,
            parseFloat(diasBono) || 15,
            bcvRate,
        )),
        [filtered, egreso, motivo, diasUtil, diasBono, bcvRate],
    );

    const validResults = useMemo(() => results.filter(r => !r.warning), [results]);
    const totalGeneral = useMemo(() => validResults.reduce((s, r) => s + r.total, 0), [validResults]);

    const handleExport = useCallback(() => exportCsv(results, egreso, motivo), [results, egreso, motivo]);

    const handlePdf = useCallback(() => {
        const pdfEmployees: LiquidacionEmployee[] = validResults.map(r => {
            const salarioDiarioIntegral = r.prestaciones > 0 ? r.prestaciones / r.diasPrest : r.salarioVES / 30;
            const salarioDiarioSimple   = r.salarioVES / 30;
            const lines = [
                {
                    label:   "Prestaciones sociales (Art. 142)",
                    dias:    r.diasPrest,
                    formula: r.diasPrestAdic > 0
                        ? `${r.diasPrestTrimestr}d trimestr. + ${r.diasPrestAdic}d adic.`
                        : `${r.diasPrestTrimestr}d × 5d/mes`,
                    salario: salarioDiarioIntegral,
                    monto:   r.prestaciones,
                },
                {
                    label:   "Utilidades fraccionadas",
                    formula: `${r.diasEnAnioActual}d en año × ${diasUtil}d util / 365`,
                    monto:   r.utilFrac,
                },
                {
                    label:   "Vacaciones fraccionadas",
                    formula: `${r.diasDesdeAniversario}d / 365 × ${Math.max(15, 15 + Math.max(0, r.antiguedadAnios - 1))}d vac.`,
                    salario: salarioDiarioSimple,
                    monto:   r.vacFrac,
                },
                {
                    label:   "Bono vacacional fraccionado",
                    formula: `${r.diasDesdeAniversario}d / 365 × ${diasBono}d bono`,
                    salario: salarioDiarioSimple,
                    monto:   r.bonoVacFrac,
                },
                ...(r.indemnizacion > 0
                    ? [{ label: "Indemnización por despido (Art. 92)", dias: r.diasPrest, salario: salarioDiarioIntegral, monto: r.indemnizacion, highlight: "amber" as const }]
                    : []),
            ].filter(l => l.monto > 0 || l.dias !== undefined);
            return {
                nombre:          r.employee.nombre,
                cedula:          r.employee.cedula,
                cargo:           r.employee.cargo,
                fechaIngreso:    r.employee.fechaIngreso ?? "",
                fechaEgreso:     egreso,
                antiguedadAnios: r.antiguedadAnios,
                antiguedadDias:  r.antiguedadDias,
                motivo,
                lines,
                total: r.total,
            };
        });
        const opts: LiquidacionOptions = {
            companyName: company?.name ?? "Empresa",
            companyId:   company?.id,
            fechaDoc:    new Date().toISOString().split("T")[0],  // ISO format for fmtDate()
            bcvRate:     bcvRate || undefined,
        };
        generateLiquidacionPdf(pdfEmployees, opts);
    }, [validResults, egreso, motivo, diasUtil, diasBono, bcvRate, company]);

    return (
        <div className="min-h-full bg-surface-2 flex flex-col overflow-hidden">
            <PageHeader
                title="Liquidaciones"
                subtitle="Cálculo de finiquito y prestaciones al egreso (Art. 142 LOTTT)"
            >
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-light bg-surface-1 h-8 shadow-sm">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-tertiary)]">BCV</span>
                    <span className="font-mono text-[11px] font-semibold tabular-nums text-foreground">
                        {bcvLoading ? "..." : bcvRate.toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                    </span>
                    {bcvFetchError && <span className="w-1.5 h-1.5 rounded-full bg-red-400" title={bcvFetchError} />}
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

                    <div className="flex-1 divide-y divide-border-light">
                        {/* ── Empleado ───────────────────────────────────────── */}
                        <div className="px-5 py-4 space-y-4">
                            <SectionHeader label="Alcance" />
                            <div className="relative">
                                <Users size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
                                <select
                                    value={selectedCedula}
                                    onChange={(e) => setSelectedCedula(e.target.value)}
                                    className={fieldCls + " pl-9"}
                                >
                                    <option value="">Lote por defecto (Todos)</option>
                                    <optgroup label="Empleados">
                                        {employees
                                            .filter(e => !soloActivos || e.estado === "activo")
                                            .sort((a,b) => a.nombre.localeCompare(b.nombre))
                                            .map(e => (
                                                <option key={e.cedula} value={e.cedula}>
                                                    {e.nombre} ({e.cedula})
                                                </option>
                                            ))
                                        }
                                    </optgroup>
                                </select>
                            </div>

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

                        {/* ── Parámetros de Egreso ────────────────────────────── */}
                        <div className="px-5 py-5 space-y-4">
                            <SectionHeader label="Egreso" />
                            <div>
                                <label className={labelCls}>Fecha de egreso</label>
                                <div className="relative">
                                    <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
                                    <input 
                                        type="date" 
                                        value={egreso} 
                                        max={today}
                                        onChange={e => setEgreso(e.target.value)} 
                                        className={fieldCls + " pl-9"} 
                                    />
                                </div>
                            </div>

                            <div>
                                <label className={labelCls}>Motivo de Egreso</label>
                                <div className="relative">
                                    <ClipboardCheck size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
                                    <select 
                                        value={motivo} 
                                        onChange={e => setMotivo(e.target.value as Motivo)} 
                                        className={fieldCls + " pl-9"}
                                    >
                                        <option value="renuncia">Renuncia voluntaria</option>
                                        <option value="despido_justificado">Despido justificado</option>
                                        <option value="despido_injustificado">Despido injustificado</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* ── Parámetros de Cálculo ──────────────────────────── */}
                        <div className="px-5 py-5 space-y-4">
                            <SectionHeader label="Parámetros de Cálculo" />
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelCls}>Días util.</label>
                                    <div className="relative">
                                        <ClipboardCheck size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
                                        <input type="number" min="15" step="1" value={diasUtil}
                                            onChange={e => setDiasUtil(e.target.value)} className={fieldCls + " pl-8 text-right"} />
                                    </div>
                                </div>
                                <div>
                                    <label className={labelCls}>Bono vac.</label>
                                    <div className="relative">
                                        <TrendingUp size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
                                        <input type="number" min="15" step="1" value={diasBono}
                                            onChange={e => setDiasBono(e.target.value)} className={fieldCls + " pl-8 text-right"} />
                                    </div>
                                </div>
                            </div>
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
                                <input type="number" step="0.01" value={exchangeRate}
                                    onChange={e => setExchangeRate(e.target.value)} className={fieldCls + " pl-9 text-right"} />
                            </div>
                        </div>
                    </div>


                    {/* Totals + export */}
                    <div className="p-5 border-t border-border-light space-y-4 mt-auto bg-surface-2/[0.03]">
                        {validResults.length > 0 && (
                            <div className="space-y-2 mb-4 bg-surface-2/40 rounded-xl p-4 border border-border-light/50">
                                <div className="flex justify-between font-mono text-[11px] uppercase tracking-wider">
                                    <span className="text-[var(--text-tertiary)]">Empleados</span>
                                    <span className="text-foreground font-bold">{validResults.length}</span>
                                </div>
                                
                                {results.length - validResults.length > 0 && (
                                    <div className="flex justify-between font-mono text-[11px] uppercase tracking-wider">
                                        <span className="text-[var(--text-tertiary)]">Observaciones</span>
                                        <span className="text-amber-500 font-bold">{results.length - validResults.length}</span>
                                    </div>
                                )}

                                {motivo === "despido_injustificado" && (
                                    <div className="flex justify-between font-mono text-[11px] uppercase tracking-wider pt-1 border-t border-border-light/30">
                                        <span className="text-[var(--text-tertiary)]">Indemnización</span>
                                        <span className="text-red-500/70 font-bold">{fmtVES(validResults.reduce((s, r) => s + r.indemnizacion, 0))}</span>
                                    </div>
                                )}

                                <div className="flex justify-between items-baseline pt-2 border-t border-border-light/30">
                                    <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--text-secondary)] font-bold">Total Gral.</span>
                                    <span className="font-mono text-[15px] font-black text-primary-500 tabular-nums">{fmtVES(totalGeneral)}</span>
                                </div>
                            </div>
                        )}
                        
                        <BaseButton.Root
                            variant="secondary"
                            className="w-full"
                            onClick={handleExport}
                            disabled={results.length === 0}
                            leftIcon={<FileText size={14} />}
                        >
                            Exportar CSV
                        </BaseButton.Root>

                        <BaseButton.Root
                            variant="primary"
                            className="w-full"
                            onClick={handlePdf}
                            disabled={validResults.length === 0}
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
                    ) : error ? (
                        <div className="flex items-center justify-center h-48 font-mono text-[13px] text-red-500">{error}</div>
                    ) : results.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full gap-3 text-[var(--text-disabled)]">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.8">
                                <rect x="2" y="3" width="20" height="14" rx="2"/>
                                <path d="M8 21h8M12 17v4"/>
                            </svg>
                            <p className="font-mono text-[12px] uppercase tracking-widest">Sin empleados</p>
                        </div>
                    ) : (
                        <div className="max-w-2xl mx-auto space-y-8">
                            {results.map(r => (
                                <ConstanciaLiquidacion
                                    key={r.employee.cedula}
                                    r={r}
                                    companyName={company?.name ?? "La Empresa"}
                                    egreso={egreso}
                                    motivo={motivo}
                                    diasUtil={diasUtil}
                                    diasBono={diasBono}
                                />
                            ))}
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
