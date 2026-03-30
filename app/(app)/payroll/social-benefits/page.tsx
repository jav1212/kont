"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { FileText, Download, RefreshCw, Users, Calendar, TrendingUp, Percent, Info, ClipboardCheck, ChevronDown } from "lucide-react";
import { useCompany }  from "@/src/modules/companies/frontend/hooks/use-companies";
import { useEmployee } from "@/src/modules/payroll/frontend/hooks/use-employee";
import type { Employee } from "@/src/modules/payroll/frontend/hooks/use-employee";
import { computePrestaciones } from "@/src/modules/payroll/frontend/utils/prestaciones-calculator";
import { generatePrestacionesPdf, generateInteresesAnticipoPdf } from "@/src/modules/payroll/frontend/utils/prestaciones-pdf";

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
    const meses = ["enero","febrero","marzo","abril","mayo","junio",
                   "julio","agosto","septiembre","octubre","noviembre","diciembre"];
    return `${parseInt(d)} de ${meses[parseInt(m) - 1]} de ${y}`;
}

// ============================================================================
// CALC RESULT TYPE
// ============================================================================

interface PrestacionesCalc {
    salarioVES:            number;
    salarioDiario:         number;
    alicuotaUtil:          number;
    alicuotaBono:          number;
    salarioIntegralDiario: number;
    anios:                 number;
    mesesCompletos:        number;
    totalDias:             number;
    diasTrimestrales:      number;
    diasAdicionales:       number;
    diasTotales:           number;
    saldoAcumulado:        number;
    garantia:              number;
    montoFinal:            number;
    aplicaGarantia:        boolean;   // unused, kept for PDF compat
    anticipoPrestaciones:  number;
    interesesAcumulados:   number;
    pagoInmediato:         number;   // anticipo + intereses
    saldoFavor:            number;   // montoFinal − anticipo − intereses
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
// RIGHT PANEL — Constancia Art. 142
// ============================================================================

function ConstanciaArt142({ calc, fechaIngreso, fechaCorte, employeeName, employeeCedula,
    employeeCargo, companyName, porcentajeAnticipo, tasaIntereses }: {
    calc: PrestacionesCalc;
    fechaIngreso: string; fechaCorte: string;
    employeeName: string; employeeCedula: string; employeeCargo?: string;
    companyName: string;
    porcentajeAnticipo: string;
    tasaIntereses: string;
}) {
    const pdfBase = {
        companyName,
        employee: { nombre: employeeName, cedula: employeeCedula, cargo: employeeCargo },
        fechaIngreso,
        fechaCorte,
        anios:                 calc.anios,
        mesesCompletos:        calc.mesesCompletos,
        totalDias:             calc.totalDias,
        salarioVES:            calc.salarioVES,
        salarioDiario:         calc.salarioDiario,
        alicuotaUtil:          calc.alicuotaUtil,
        alicuotaBono:          calc.alicuotaBono,
        salarioIntegralDiario: calc.salarioIntegralDiario,
        diasTrimestrales:      calc.diasTrimestrales,
        diasAdicionales:       calc.diasAdicionales,
        diasTotales:           calc.diasTotales,
        saldoAcumulado:        calc.saldoAcumulado,
        garantia:              calc.garantia,
        montoFinal:            calc.montoFinal,
        aplicaGarantia:        calc.aplicaGarantia,
        anticipoPrestaciones:  calc.anticipoPrestaciones,
        interesesAcumulados:   calc.interesesAcumulados,
        pagoInmediato:         calc.pagoInmediato,
        saldoFavor:            calc.saldoFavor,
        porcentajeAnticipo:    parseFloat(porcentajeAnticipo) || 75,
        tasaIntereses:         parseFloat(tasaIntereses) || 0,
    };
    const handlePdf = () => generatePrestacionesPdf(pdfBase);
    const handlePdfIntereses = () => generateInteresesAnticipoPdf(pdfBase);

    const mesesResto = calc.mesesCompletos % 12;
    const antiguedad = `${calc.anios} año${calc.anios !== 1 ? "s" : ""}${mesesResto > 0 ? ` ${mesesResto} mes${mesesResto !== 1 ? "es" : ""}` : ""}`;

    return (
        <div className="max-w-xl mx-auto space-y-3">
            <div className="flex justify-end gap-2">
                <BaseButton.Root
                    variant="secondary"
                    size="sm"
                    onClick={handlePdfIntereses}
                    leftIcon={<FileText size={14} />}
                >
                    Intereses y Anticipo
                </BaseButton.Root>
                <BaseButton.Root
                    variant="primary"
                    size="sm"
                    onClick={handlePdf}
                    leftIcon={<Download size={14} />}
                >
                    Reporte Completo
                </BaseButton.Root>
            </div>

            <div className="rounded-2xl border border-emerald-500/20 bg-surface-1 overflow-hidden shadow-sm">

                {/* Header */}
                <div className="bg-[#12121a] px-6 py-4 relative overflow-hidden">
                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-emerald-600" />
                    <div className="absolute left-1.5 right-0 bottom-0 h-px bg-emerald-500/30" />
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p className="font-mono text-[8px] uppercase tracking-[0.22em] text-[#64648a] mb-0.5">Prestaciones Sociales · Art. 142 LOTTT</p>
                            <p className="font-mono text-[15px] font-black uppercase text-white tracking-tight leading-none">{companyName}</p>
                        </div>
                        <div className="text-right shrink-0">
                            <p className="font-mono text-[7px] uppercase tracking-[0.2em] text-[#64648a]">Corte al</p>
                            <p className="font-mono text-[11px] font-black text-white">{formatDateES(fechaCorte)}</p>
                        </div>
                    </div>
                </div>

                {/* Employee + antigüedad */}
                <div className="px-6 py-4 bg-[#12121a] border-b border-emerald-500/10 grid grid-cols-2 gap-6">
                    <div>
                        <p className="font-mono text-[7px] uppercase tracking-[0.2em] text-[#64648a] mb-0.5">Trabajador</p>
                        <p className="font-mono text-[13px] font-bold text-white leading-tight">{employeeName || "—"}</p>
                        {employeeCargo && <p className="font-mono text-[9px] text-[#64648a] mt-0.5 uppercase">{employeeCargo}</p>}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        {[
                            { lbl: "Cédula",      val: employeeCedula || "—" },
                            { lbl: "Antigüedad",  val: antiguedad },
                        ].map(({ lbl, val }) => (
                            <div key={lbl}>
                                <p className="font-mono text-[7px] uppercase tracking-[0.18em] text-[#64648a] mb-0.5">{lbl}</p>
                                <p className="font-mono text-[10px] font-bold text-white tabular-nums">{val}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Salario integral strip */}
                <div className="px-6 py-3 border-b border-border-light grid grid-cols-3 gap-3 bg-surface-2/60">
                    {[
                        { lbl: "Sal. diario",      val: fmt(calc.salarioDiario) },
                        { lbl: "Alíc. util + bono", val: fmt(calc.alicuotaUtil + calc.alicuotaBono) },
                        { lbl: "Sal. integral/día", val: fmt(calc.salarioIntegralDiario) },
                    ].map(({ lbl, val }) => (
                        <div key={lbl}>
                            <p className="font-mono text-[7px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] mb-0.5">{lbl}</p>
                            <p className="font-mono text-[10px] font-bold text-foreground tabular-nums">{val}</p>
                        </div>
                    ))}
                </div>

                {/* Prestaciones: saldo + garantía = total */}
                <div className="px-6 py-4 border-b border-border-light">
                    <p className="font-mono text-[7px] uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-3">Prestaciones acumuladas (Art. 142)</p>
                    <div className="space-y-2">
                        <div className="flex justify-between items-baseline">
                            <div>
                                <span className="font-mono text-[11px] text-[var(--text-secondary)]">Saldo acumulado</span>
                                <span className="font-mono text-[8px] text-[var(--text-tertiary)] ml-2">{calc.diasTotales}d × {fmt(calc.salarioIntegralDiario)}</span>
                            </div>
                            <span className="font-mono text-[12px] tabular-nums text-[var(--text-secondary)]">{fmt(calc.saldoAcumulado)}</span>
                        </div>
                        <div className="flex justify-between items-baseline">
                            <div>
                                <span className="font-mono text-[11px] text-[var(--text-secondary)]">Garantía Art. 142.c</span>
                                <span className="font-mono text-[8px] text-[var(--text-tertiary)] ml-2">30d × {calc.anios} años × {fmt(calc.salarioIntegralDiario)}</span>
                            </div>
                            <span className="font-mono text-[12px] tabular-nums text-[var(--text-secondary)]">{fmt(calc.garantia)}</span>
                        </div>
                    </div>
                </div>

                {/* Monto total */}
                <div className="px-6 py-4 bg-emerald-700">
                    <div className="flex items-baseline justify-between">
                        <p className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-white/70">Monto total prestaciones</p>
                        <p className="font-mono text-[22px] font-black tabular-nums text-white">{fmt(calc.montoFinal)}</p>
                    </div>
                    <p className="font-mono text-[8px] text-white/40">Saldo acumulado + Garantía Art. 142.c</p>
                </div>

                {/* Pago inmediato */}
                {(calc.anticipoPrestaciones > 0 || calc.interesesAcumulados > 0) && (<>
                    <div className="px-6 py-4 border-b border-border-light">
                        <p className="font-mono text-[7px] uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-3">Pago inmediato (Art. 143 / 144)</p>
                        <div className="space-y-2 mb-3">
                            <div className="flex justify-between items-baseline">
                                <span className="font-mono text-[11px] text-[var(--text-secondary)]">Anticipo ({porcentajeAnticipo}%) — Art. 144</span>
                                <span className="font-mono text-[12px] font-bold tabular-nums text-amber-500">{fmt(calc.anticipoPrestaciones)}</span>
                            </div>
                            <div className="flex justify-between items-baseline">
                                <span className="font-mono text-[11px] text-[var(--text-secondary)]">Intereses ({tasaIntereses}%) — Art. 143</span>
                                <span className="font-mono text-[12px] font-bold tabular-nums text-emerald-600">{fmt(calc.interesesAcumulados)}</span>
                            </div>
                        </div>
                        <div className="flex items-baseline justify-between pt-2 border-t border-border-light">
                            <span className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--text-secondary)]">Total pago inmediato</span>
                            <span className="font-mono text-[18px] font-black tabular-nums text-amber-500">{fmt(calc.pagoInmediato)}</span>
                        </div>
                    </div>

                    {/* Saldo a favor */}
                    <div className="px-6 py-4 bg-emerald-600/10 border-b border-emerald-500/20">
                        <div className="flex justify-between items-baseline mb-1">
                            <span className="font-mono text-[11px] text-[var(--text-secondary)]">Monto total prestaciones</span>
                            <span className="font-mono text-[11px] tabular-nums text-[var(--text-tertiary)]">{fmt(calc.montoFinal)}</span>
                        </div>
                        <div className="flex justify-between items-baseline mb-3">
                            <span className="font-mono text-[11px] text-[var(--text-secondary)]">− Anticipo + Intereses</span>
                            <span className="font-mono text-[11px] tabular-nums text-[var(--text-tertiary)]">− {fmt(calc.pagoInmediato)}</span>
                        </div>
                        <div className="flex items-baseline justify-between pt-2 border-t border-emerald-500/20">
                            <span className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--text-secondary)]">Saldo a favor</span>
                            <span className="font-mono text-[20px] font-black tabular-nums text-emerald-600">{fmt(calc.saldoFavor)}</span>
                        </div>
                    </div>
                </>)}

                {/* Signatures */}
                <div className="px-6 py-5 grid grid-cols-2 gap-8">
                    {["Empleador", "Trabajador"].map(role => (
                        <div key={role} className="text-center">
                            <div className="h-8 border-b border-border-medium mb-2" />
                            <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">{role}</p>
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

export default function PrestacionesPage() {
    const { companyId, company } = useCompany();
    const { employees, loading }  = useEmployee(companyId);

    // ── Employee ──────────────────────────────────────────────────────────────
    const [selectedCedula, setSelectedCedula] = useState<string>("");
    const [soloActivos,    setSoloActivos]    = useState(true);

    const [salarioOverride, setSalarioOverride] = useState("");
    const [manualIngreso,   setManualIngreso]   = useState("");

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

    // ── Params ────────────────────────────────────────────────────────────────
    const [fechaCorte,          setFechaCorte]          = useState(isoToday());
    const [diasUtilidades,      setDiasUtilidades]      = useState("15");
    const [diasBono,            setDiasBono]            = useState("15");
    const [tasaIntereses,       setTasaIntereses]       = useState("3");
    const [porcentajeAnticipo,  setPorcentajeAnticipo]  = useState("75");

    // ── BATCH PROCESSING ─────────────────────────────────────────────────────

    const filtered = useMemo(() => {
        const pool = soloActivos ? employees.filter(e => e.estado === "activo") : employees;
        if (!selectedCedula) return pool;
        return pool.filter(e => e.cedula === selectedCedula);
    }, [employees, soloActivos, selectedCedula]);

    // Derived for individual manual mode if needed
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

    interface PrestResult {
        emp:  Employee;
        calc: PrestacionesCalc | null;
        msg?: string;
    }

    const results = useMemo<PrestResult[]>(() => {
        return filtered.map(emp => {
            const ves  = emp.moneda === "USD" ? emp.salarioMensual * bcvRate : emp.salarioMensual;
            const ing  = emp.fechaIngreso ?? "";
            const util = parseInt(diasUtilidades) || 15;
            const bono = parseInt(diasBono)       || 15;

            const res = computePrestaciones({
                salarioVES: ves,
                fechaIngreso: ing,
                fechaCorte,
                diasUtil: util,
                diasBonoVac: bono,
            });

            if (!res) return { emp, calc: null, msg: "Verificar datos" };

            const salDia = ves / 30;
            const alUtil = salDia * util / 360;
            const alBono = salDia * bono / 360;
            const gar    = 30 * res.salarioIntegralDiario * res.anios;
            const sld    = res.saldoPrestaciones;
            const mto    = sld + gar;
            const pct    = Math.min(100, Math.max(0, parseFloat(porcentajeAnticipo) || 75));
            const ant    = sld * (pct / 100);
            const t      = Math.max(0, parseFloat(tasaIntereses) || 0);
            const ints   = sld * (t / 100) * (res.mesesCompletos / 12);

            const calc: PrestacionesCalc = {
                salarioVES: ves,
                salarioDiario: salDia,
                alicuotaUtil: alUtil,
                alicuotaBono: alBono,
                salarioIntegralDiario: res.salarioIntegralDiario,
                anios:            res.anios,
                mesesCompletos:   res.mesesCompletos,
                totalDias:        res.totalDias,
                diasTrimestrales: res.diasTrimestrales,
                diasAdicionales:  res.diasAdicionales,
                diasTotales:      res.diasTotales,
                saldoAcumulado:   sld,
                garantia:         gar,
                montoFinal:       mto,
                aplicaGarantia:   false,
                anticipoPrestaciones: ant,
                interesesAcumulados:  ints,
                pagoInmediato:        ant + ints,
                saldoFavor:           mto - ant - ints,
            };

            return { emp, calc };
        });
    }, [filtered, bcvRate, diasUtilidades, diasBono, fechaCorte, porcentajeAnticipo, tasaIntereses]);

    const totalGral = useMemo(() => results.reduce((acc, r) => acc + (r.calc?.saldoFavor ?? 0), 0), [results]);

    const salarioVES   = parseFloat(salarioOverride) || 0;
    const fechaIngreso = selectedEmp?.fechaIngreso ?? manualIngreso;
    const calc = results.length === 1 ? results[0].calc : null;

    return (
        <div className="min-h-full bg-surface-2 flex flex-col overflow-hidden">
            <PageHeader
                title="Prestaciones Sociales"
                subtitle="Cálculo de garantía y acumulados (Art. 142 LOTTT)"
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

                    <div className="flex-1 divide-y divide-border-light">
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

                        <div className="px-5 py-4">
                            <div className="flex items-center justify-between mb-2">
                                <SectionHeader label="Tasa BCV" />
                                <button 
                                    onClick={fetchBcvRate}
                                    disabled={bcvLoading}
                                    className="p-1 hover:bg-surface-2 rounded-md transition-colors text-[var(--text-tertiary)] hover:text-primary-500 disabled:opacity-40"
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

                        <div className="px-5 py-5 space-y-4">
                            <SectionHeader label="Configuración Temporal" />
                            <div>
                                <label className={labelCls}>Fecha de corte</label>
                                <div className="relative">
                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={14} />
                                    <input type="date" value={fechaCorte}
                                        onChange={e => setFechaCorte(e.target.value)} className={fieldCls + " pl-9"} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3 pt-1">
                                <div>
                                    <label className={labelCls}>Días Util.</label>
                                    <div className="relative">
                                        <ClipboardCheck className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={13} />
                                        <input type="number" min="15" max="120" step="1"
                                            value={diasUtilidades}
                                            onChange={e => setDiasUtilidades(e.target.value)}
                                            className={fieldCls + " pl-9 text-right"} />
                                    </div>
                                </div>
                                <div>
                                    <label className={labelCls}>Bono Vac.</label>
                                    <div className="relative">
                                        <TrendingUp className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={13} />
                                        <input type="number" min="15" max="90" step="1"
                                            value={diasBono}
                                            onChange={e => setDiasBono(e.target.value)}
                                            className={fieldCls + " pl-9 text-right"} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="px-5 py-5 space-y-4 bg-surface-2/[0.03]">
                            <SectionHeader label="Ajustes de Ley" />
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelCls}>Tasa Int.</label>
                                    <div className="relative">
                                        <Percent className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={13} />
                                        <input type="number" step="0.01" min="0" max="100"
                                            value={tasaIntereses}
                                            onChange={e => setTasaIntereses(e.target.value)}
                                            className={fieldCls + " pl-8 text-right"} />
                                    </div>
                                </div>
                                <div>
                                    <label className={labelCls}>Anticipo</label>
                                    <div className="relative">
                                        <Percent className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={13} />
                                        <input type="number" step="1" min="0" max="75"
                                            value={porcentajeAnticipo}
                                            onChange={e => setPorcentajeAnticipo(e.target.value)}
                                            className={fieldCls + " pl-8 text-right"} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="px-5 py-4 space-y-0.5">
                            <SectionHeader label="Cálculo — Art. 142 LOTTT" />
                            {calc ? (<>
                                <CalcRow label="Salario mensual"  value={fmt(calc.salarioVES)} dim />
                                <CalcRow label="Salario diario"   formula="salario ÷ 30"
                                    value={`${fmtN(calc.salarioDiario)} Bs./día`} dim />
                                <SectionHeader label="Salario integral" color="green" />
                                <CalcRow label="Sal. integral / día"
                                    value={`${fmtN(calc.salarioIntegralDiario)} Bs./día`} accent="green" />
                                <Hr />
                                <SectionHeader label="Montos Acumulados" />
                                <CalcRow label="Saldo prestaciones"
                                    value={fmt(calc.saldoAcumulado)} dim />
                                <CalcRow label="Garantía Art. 142.c"
                                    value={fmt(calc.garantia)} dim />
                                <Hr />
                                <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.03] space-y-2 relative overflow-hidden ring-1 ring-emerald-500/10">
                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500" />
                                    <div className="flex items-center justify-between">
                                        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-700/70">Saldo a favor</span>
                                    </div>
                                    <div className="flex items-baseline justify-between">
                                        <span className="font-mono text-[24px] font-black tabular-nums text-emerald-600 truncate">{fmt(calc.saldoFavor)}</span>
                                    </div>
                                </div>
                            </>) : (
                                <p className="font-mono text-[11px] text-[var(--text-tertiary)] pt-2">
                                    {salarioVES <= 0 ? "Ingresa el salario." : "Selecciona un empleado."}
                                </p>
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
                                    <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--text-secondary)] font-bold">Total Gral. (Neto)</span>
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
                             <Info size={48} strokeWidth={1} />
                             <p className="font-mono text-[12px] uppercase tracking-widest">Selecciona empleados para calcular</p>
                        </div>
                    ) : (
                        <div className="max-w-xl mx-auto space-y-8">
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

                                return (
                                    <ConstanciaArt142
                                        key={r.emp.cedula}
                                        calc={r.calc}
                                        fechaIngreso={r.emp.fechaIngreso ?? ""}
                                        fechaCorte={fechaCorte}
                                        employeeName={r.emp.nombre}
                                        employeeCedula={r.emp.cedula}
                                        employeeCargo={r.emp.cargo}
                                        companyName={company?.name ?? "La Empresa"}
                                        porcentajeAnticipo={porcentajeAnticipo}
                                        tasaIntereses={tasaIntereses}
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
