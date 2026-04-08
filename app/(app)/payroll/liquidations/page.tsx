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
    ChevronDown, 
    RefreshCw, 
    TrendingUp, 
    Info,
    Clock,
    AlertCircle
} from "lucide-react";
import { useCompany }  from "@/src/modules/companies/frontend/hooks/use-companies";
import { useEmployee } from "@/src/modules/payroll/frontend/hooks/use-employee";
import type { Employee } from "@/src/modules/payroll/frontend/hooks/use-employee";
import { generateLiquidacionPdf } from "@/src/modules/payroll/frontend/utils/liquidaciones-pdf";
import type { LiquidacionEmployee, LiquidacionOptions } from "@/src/modules/payroll/frontend/utils/liquidaciones-pdf";
import { motion } from "framer-motion";
import { getTodayIsoDate } from "@/src/shared/frontend/utils/local-date";

// ============================================================================
// HELPERS
// ============================================================================

const fmtVES = (n: number) =>
    "Bs. " + n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtN = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fieldCls = [
    "w-full h-9 px-3 rounded-lg border border-border-light bg-surface-1 outline-none",
    "font-mono text-[13px] text-foreground tabular-nums appearance-none",
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

function ConstanciaLiquidacion({ r, companyName, companyLogoUrl, showLogoInPdf, egreso, motivo, diasUtil, diasBono }: {
    r: EmpLiqResult; companyName: string; companyLogoUrl?: string; showLogoInPdf?: boolean; egreso: string; motivo: Motivo;
    diasUtil: string; diasBono: string;
}) {
    const motivoLabel = motivo === "renuncia" ? "Renuncia voluntaria"
        : motivo === "despido_justificado" ? "Despido justificado"
        : "Despido injustificado";
    const emitido = new Date().toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
    const diasVacBase = Math.max(15, 15 + Math.max(0, r.antiguedadAnios - 1));
    const documentId = makeDocumentId(`${r.employee.cedula}|${egreso}|${motivo}`);

    const concepts = [
        { label: "Prestaciones sociales", sub: `Art. 142 LOTTT · ${r.diasPrestTrimestr}d trim.${r.diasPrestAdic > 0 ? ` + ${r.diasPrestAdic}d adic.` : ""}`, dias: r.diasPrest, monto: r.prestaciones },
        { label: "Utilidades fraccionadas", sub: `${r.diasEnAnioActual}d en año × ${diasUtil}d util. / 365`, monto: r.utilFrac },
        { label: "Vacaciones fraccionadas", sub: `${r.diasDesdeAniversario}d / 365 × ${diasVacBase}d vac.`, monto: r.vacFrac },
        { label: "Bono vacacional fraccionado", sub: `${r.diasDesdeAniversario}d / 365 × ${diasBono}d bono`, monto: r.bonoVacFrac },
        ...(r.indemnizacion > 0 ? [{ label: "Indemnización por despido", sub: "Art. 92 LOTTT — igual al monto", monto: r.indemnizacion, highlight: true }] : []),
    ].filter(c => c.monto > 0);

    if (r.warning) return (
        <div className="bg-warning/5 rounded-2xl overflow-hidden border border-warning/20 shadow-sm mb-6">
            <div className="px-6 py-4 flex items-center justify-between border-l-4 border-warning">
                <p className="text-[14px] font-bold uppercase text-foreground">{r.employee.nombre}</p>
                <span className="text-[12px] text-warning font-bold uppercase tracking-widest bg-warning/10 px-2 py-1 rounded">{r.warning}</span>
            </div>
        </div>
    );

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
                        <p className="text-[11px] text-[var(--text-tertiary)] mt-2 uppercase tracking-[0.2em] font-semibold">Constancia de Liquidación Laboral</p>
                        <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 font-medium">Art. 142 LOTTT — {motivoLabel}</p>
                    </div>
                </div>
                <div className="text-right shrink-0">
                    <p className="text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-0.5">Fecha de Egreso</p>
                    <p className="text-[13px] font-bold text-foreground bg-surface-2 px-2.5 py-1 rounded inline-block border border-border-light">{formatDateES(egreso)}</p>
                    <p className="text-[9px] text-[var(--text-tertiary)] mt-2 uppercase">Emitido: {emitido}</p>
                </div>
            </div>

            <div className="px-8 py-5 border-b border-border-light flex flex-col sm:flex-row items-center justify-between bg-surface-1">
                <div className="flex items-center gap-4 w-full">
                    <div className="flex-shrink-0 w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center border border-border-light text-[var(--text-tertiary)] group-hover:border-primary-500/50 group-hover:text-primary-500 transition-colors">
                        <Users size={20} />
                    </div>
                    <div className="flex-1">
                        <p className="text-[16px] font-bold text-foreground tracking-tight">{r.employee.nombre}</p>
                        {r.employee.cargo && <p className="text-[11px] uppercase tracking-[0.1em] text-[var(--text-secondary)] font-medium mt-0.5">{r.employee.cargo}</p>}
                    </div>
                    <div className="text-right shrink-0 pl-5 md:pr-4 border-l border-border-light">
                        <p className="text-[13px] font-bold text-foreground tabular-nums">CI {r.employee.cedula}</p>
                        <div className="inline-flex items-center gap-1.5 mt-1 text-[11px] text-[var(--text-secondary)] font-medium bg-surface-2 px-2 py-0.5 rounded border border-border-light">
                            <Clock size={12} className="text-[var(--text-tertiary)]" />
                            {r.antiguedadAnios} año{r.antiguedadAnios !== 1 ? "s" : ""}
                        </div>
                    </div>
                </div>
            </div>

            <div className="px-8 py-5 grid grid-cols-2 lg:grid-cols-4 gap-6 border-b border-border-light bg-surface-2/20">
                {[
                    { lbl: "Salario Mensual",  val: fmtVES(r.salarioVES), color: "text-foreground" },
                    { lbl: "Fecha de Ingreso", val: formatDateES(r.employee.fechaIngreso ?? ""), color: "text-foreground" },
                    { lbl: "Antigüedad",val: `${r.antiguedadAnios}a ${r.antiguedadDias % 365}d`, color: "text-primary-500" },
                    { lbl: "Salario Base/Día",  val: fmtVES(r.salarioVES / 30), color: "text-foreground" },
                ].map(({ lbl, val, color }) => (
                    <div key={lbl}>
                        <p className="text-[10px] uppercase tracking-[0.15em] text-[var(--text-tertiary)] mb-1 font-bold">{lbl}</p>
                        <p className={`text-[13px] font-bold tabular-nums ${color}`}>{val}</p>
                    </div>
                ))}
            </div>

            <div className="px-8 py-6">
                <div className="flex justify-between pb-3 border-b border-border-light/60">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-tertiary)] font-bold">Concepto / Cálculo</p>
                    <div className="flex items-center justify-end gap-12 w-48 shrink-0">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-tertiary)] font-bold text-right w-12">Días</p>
                        <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-tertiary)] font-bold text-right flex-1">Monto Asignado</p>
                    </div>
                </div>
                
                <div className="divide-y divide-border-light/40 pt-1">
                    {concepts.map((c) => (
                        <div key={c.label} className="py-3.5 flex items-start justify-between group hover:bg-surface-2/30 -mx-4 px-4 rounded-lg transition-colors">
                            <div className="pr-4">
                                <p className="text-[13px] font-bold text-foreground tracking-tight">{c.label}</p>
                                <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">{c.sub}</p>
                            </div>
                            <div className="flex items-center justify-end gap-12 w-48 shrink-0 text-right">
                                <p className="text-[13px] font-medium tabular-nums text-[var(--text-secondary)] w-12">{c.dias != null ? c.dias : "—"}</p>
                                <p className={`text-[14px] font-bold tabular-nums flex-1 ${c.highlight ? "text-error" : "text-foreground group-hover:text-primary-500 transition-colors"}`}>
                                    Bs. {fmtN(c.monto)}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-4 p-5 rounded-2xl bg-surface-2/60 border border-border-light flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.15em] text-[var(--text-tertiary)] flex items-center gap-2 mb-1">
                            Líquido a recibir
                        </p>
                        <p className="text-[24px] font-black tabular-nums text-foreground leading-none">
                            Bs. {fmtN(r.total)}
                        </p>
                    </div>
                </div>
            </div>

            <div className="px-8 pb-8 pt-4">
                <div className="grid grid-cols-2 gap-12 max-w-lg mx-auto">
                    {["Representante Empleador", "Firma del Trabajador"].map(role => (
                        <div key={role} className="flex flex-col items-center">
                            <div className="w-full h-12 border-b-2 border-dashed border-border-light mb-3" />
                            <p className="text-[10px] uppercase tracking-[0.15em] text-[var(--text-secondary)] font-bold text-center">{role}</p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="bg-surface-2/30 px-8 py-4 border-t border-border-light flex items-center justify-between mt-auto">
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
// CONFIG SECTION
// ============================================================================

// ============================================================================
// SHARED UI ATOMS
// ============================================================================

function SectionHeader({ label, color }: { label: string; color?: "green" | "amber" }) {
    const cls = color === "amber" ? "text-amber-500/70"
              : color === "green" ? "text-emerald-500/70"
              : "text-[var(--text-tertiary)]";
    return <p className={`font-mono text-[11px] uppercase tracking-[0.2em] mb-2 pt-1 ${cls}`}>{label}</p>;
}

// ============================================================================
// PAGE
// ============================================================================

export default function LiquidacionesPage() {
    const { companyId, company } = useCompany();
    const { employees, loading, error } = useEmployee(companyId);

    const today = getTodayIsoDate();

    const [egreso,      setEgreso]      = useState(today);
    const [motivo,      setMotivo]      = useState<Motivo>("renuncia");
    const [diasUtil,    setDiasUtil]    = useState("120");
    const [diasBono,    setDiasBono]    = useState("15");
    const [soloActivos, setSoloActivos] = useState(true);
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
            const iso = getTodayIsoDate();
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
            companyName:   company?.name ?? "Empresa",
            companyId:     company?.id,
            fechaDoc:      getTodayIsoDate(),  // ISO format for fmtDate()
            bcvRate:       bcvRate || undefined,
            logoUrl:       company?.logoUrl,
            showLogoInPdf: company?.showLogoInPdf,
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
                                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
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
                                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
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
                <main className="flex-1 overflow-y-auto p-6 lg:p-10 bg-surface-2 lg:bg-surface-2/50 relative">
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:14px_14px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />
                    <div className="relative z-10 w-full h-full">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-full gap-4 text-[var(--text-tertiary)]">
                            <RefreshCw size={24} className="animate-spin text-primary-500/50" />
                            <span className="text-[13px] font-bold uppercase tracking-widest">Cargando datos…</span>
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center h-full gap-3 text-error">
                            <AlertCircle size={32} />
                            <span className="text-[13px] font-bold uppercase tracking-widest">{error}</span>
                        </div>
                    ) : results.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full gap-5 text-[var(--text-disabled)] max-w-sm mx-auto animate-in fade-in duration-500">
                            <div className="w-20 h-20 rounded-[1.5rem] bg-surface-1 border border-border-light flex items-center justify-center shadow-sm text-border-medium">
                                <Users strokeWidth={1.5} size={32} />
                            </div>
                            <div className="text-center space-y-2">
                                <p className="text-[14px] font-bold uppercase tracking-widest text-foreground">Sistema Listo</p>
                                <p className="text-[13px] font-medium text-[var(--text-secondary)] leading-relaxed">
                                    Selecciona un empleado de la lista y ajusta los parámetros de cálculo para previsualizar la constancia de liquidación laboral.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="max-w-4xl mx-auto space-y-10 pb-12">
                            {results.map((r, i) => (
                                <motion.div
                                    key={r.employee.cedula}
                                    initial={{ opacity: 0, scale: 0.98, y: 15 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    transition={{ delay: i * 0.05, ease: "easeOut" }}
                                >
                                    <ConstanciaLiquidacion
                                        r={r}
                                        companyName={company?.name ?? "La Empresa"}
                                        companyLogoUrl={company?.logoUrl}
                                        showLogoInPdf={company?.showLogoInPdf}
                                        egreso={egreso}
                                        motivo={motivo}
                                        diasUtil={diasUtil}
                                        diasBono={diasBono}
                                    />
                                </motion.div>
                            ))}
                        </div>
                    )}
                    </div>
                </main>
            </div>
        </div>
    );
}
function makeDocumentId(seed: string): string {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    return Math.abs(hash).toString(36).slice(0, 4).toUpperCase().padStart(4, "0");
}
