"use client";

import { useState, useMemo, useEffect } from "react";
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
              : "text-foreground/35";
    return <p className={`font-mono text-[9px] uppercase tracking-[0.2em] mb-2 pt-1 ${cls}`}>{label}</p>;
}

function CalcRow({ label, formula, value, accent, dim }: {
    label: string; formula?: string; value: string;
    accent?: "green" | "amber"; dim?: boolean;
}) {
    const valCls = dim ? "text-foreground/40"
        : accent === "green"  ? "text-emerald-500"
        : accent === "amber"  ? "text-amber-500"
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
                <button onClick={handlePdfIntereses}
                    className="flex items-center gap-2 h-8 px-4 rounded-lg bg-amber-700 hover:bg-amber-800 text-white font-mono text-[11px] uppercase tracking-[0.12em] transition-colors duration-150">
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 12h10M8 2v8m-3-3 3 3 3-3"/></svg>
                    Intereses y Anticipo
                </button>
                <button onClick={handlePdf}
                    className="flex items-center gap-2 h-8 px-4 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-mono text-[11px] uppercase tracking-[0.12em] transition-colors duration-150">
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 12h10M8 2v8m-3-3 3 3 3-3"/></svg>
                    Reporte Completo
                </button>
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
                            <p className="font-mono text-[7px] uppercase tracking-[0.16em] text-foreground/30 mb-0.5">{lbl}</p>
                            <p className="font-mono text-[10px] font-bold text-foreground tabular-nums">{val}</p>
                        </div>
                    ))}
                </div>

                {/* Prestaciones: saldo + garantía = total */}
                <div className="px-6 py-4 border-b border-border-light">
                    <p className="font-mono text-[7px] uppercase tracking-[0.2em] text-foreground/30 mb-3">Prestaciones acumuladas (Art. 142)</p>
                    <div className="space-y-2">
                        <div className="flex justify-between items-baseline">
                            <div>
                                <span className="font-mono text-[11px] text-foreground/70">Saldo acumulado</span>
                                <span className="font-mono text-[8px] text-foreground/30 ml-2">{calc.diasTotales}d × {fmt(calc.salarioIntegralDiario)}</span>
                            </div>
                            <span className="font-mono text-[12px] tabular-nums text-foreground/60">{fmt(calc.saldoAcumulado)}</span>
                        </div>
                        <div className="flex justify-between items-baseline">
                            <div>
                                <span className="font-mono text-[11px] text-foreground/70">Garantía Art. 142.c</span>
                                <span className="font-mono text-[8px] text-foreground/30 ml-2">30d × {calc.anios} años × {fmt(calc.salarioIntegralDiario)}</span>
                            </div>
                            <span className="font-mono text-[12px] tabular-nums text-foreground/60">{fmt(calc.garantia)}</span>
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
                        <p className="font-mono text-[7px] uppercase tracking-[0.2em] text-foreground/30 mb-3">Pago inmediato (Art. 143 / 144)</p>
                        <div className="space-y-2 mb-3">
                            <div className="flex justify-between items-baseline">
                                <span className="font-mono text-[11px] text-foreground/70">Anticipo ({porcentajeAnticipo}%) — Art. 144</span>
                                <span className="font-mono text-[12px] font-bold tabular-nums text-amber-500">{fmt(calc.anticipoPrestaciones)}</span>
                            </div>
                            <div className="flex justify-between items-baseline">
                                <span className="font-mono text-[11px] text-foreground/70">Intereses ({tasaIntereses}%) — Art. 143</span>
                                <span className="font-mono text-[12px] font-bold tabular-nums text-emerald-600">{fmt(calc.interesesAcumulados)}</span>
                            </div>
                        </div>
                        <div className="flex items-baseline justify-between pt-2 border-t border-border-light">
                            <span className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-foreground/50">Total pago inmediato</span>
                            <span className="font-mono text-[18px] font-black tabular-nums text-amber-500">{fmt(calc.pagoInmediato)}</span>
                        </div>
                    </div>

                    {/* Saldo a favor */}
                    <div className="px-6 py-4 bg-emerald-600/10 border-b border-emerald-500/20">
                        <div className="flex justify-between items-baseline mb-1">
                            <span className="font-mono text-[11px] text-foreground/50">Monto total prestaciones</span>
                            <span className="font-mono text-[11px] tabular-nums text-foreground/40">{fmt(calc.montoFinal)}</span>
                        </div>
                        <div className="flex justify-between items-baseline mb-3">
                            <span className="font-mono text-[11px] text-foreground/50">− Anticipo + Intereses</span>
                            <span className="font-mono text-[11px] tabular-nums text-foreground/40">− {fmt(calc.pagoInmediato)}</span>
                        </div>
                        <div className="flex items-baseline justify-between pt-2 border-t border-emerald-500/20">
                            <span className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-foreground/50">Saldo a favor</span>
                            <span className="font-mono text-[20px] font-black tabular-nums text-emerald-600">{fmt(calc.saldoFavor)}</span>
                        </div>
                    </div>
                </>)}

                {/* Signatures */}
                <div className="px-6 py-5 grid grid-cols-2 gap-8">
                    {["Empleador", "Trabajador"].map(role => (
                        <div key={role} className="text-center">
                            <div className="h-8 border-b border-border-medium mb-2" />
                            <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-foreground/30">{role}</p>
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
    const selectedEmp = useMemo<Employee | undefined>(
        () => employees.find(e => e.cedula === selectedCedula),
        [employees, selectedCedula],
    );
    const [salarioOverride, setSalarioOverride] = useState("");
    const [manualIngreso,   setManualIngreso]   = useState("");

    // ── BCV ───────────────────────────────────────────────────────────────────
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

    // ── Derived ───────────────────────────────────────────────────────────────
    const salarioVES   = parseFloat(salarioOverride) || 0;
    const fechaIngreso = selectedEmp?.fechaIngreso ?? manualIngreso;

    // ── Params ────────────────────────────────────────────────────────────────
    const [fechaCorte,          setFechaCorte]          = useState(isoToday());
    const [diasUtilidades,      setDiasUtilidades]      = useState("15");
    const [diasBono,            setDiasBono]            = useState("15");
    const [tasaIntereses,       setTasaIntereses]       = useState("3");
    const [porcentajeAnticipo,  setPorcentajeAnticipo]  = useState("75");

    // ── Calculation ───────────────────────────────────────────────────────────
    const calc = useMemo<PrestacionesCalc | null>(() => {
        const diasUtil    = parseInt(diasUtilidades) || 15;
        const diasBonoVac = parseInt(diasBono)       || 15;
        const res = computePrestaciones({
            salarioVES,
            fechaIngreso,
            fechaCorte,
            diasUtil,
            diasBonoVac,
        });
        if (!res) return null;

        const salarioDiario  = salarioVES / 30;
        const alicuotaUtil   = salarioDiario * diasUtil    / 360;
        const alicuotaBono   = salarioDiario * diasBonoVac / 360;
        const garantia       = 30 * res.salarioIntegralDiario * res.anios;
        const saldoAcumulado = res.saldoPrestaciones;
        const montoFinal     = saldoAcumulado + garantia;
        const pct          = Math.min(100, Math.max(0, parseFloat(porcentajeAnticipo) || 75));
        const anticipo     = saldoAcumulado * (pct / 100);
        const tasa         = Math.max(0, parseFloat(tasaIntereses) || 0);
        const intereses    = saldoAcumulado * (tasa / 100) * (res.mesesCompletos / 12);
        const pagoInmediato = anticipo + intereses;
        const saldoFavor    = montoFinal - anticipo - intereses;

        return {
            salarioVES,
            salarioDiario,
            alicuotaUtil,
            alicuotaBono,
            salarioIntegralDiario: res.salarioIntegralDiario,
            anios:            res.anios,
            mesesCompletos:   res.mesesCompletos,
            totalDias:        res.totalDias,
            diasTrimestrales: res.diasTrimestrales,
            diasAdicionales:  res.diasAdicionales,
            diasTotales:      res.diasTotales,
            saldoAcumulado,
            garantia,
            montoFinal,
            aplicaGarantia: false,
            anticipoPrestaciones: anticipo,
            interesesAcumulados:  intereses,
            pagoInmediato,
            saldoFavor,
        };
    }, [salarioVES, fechaIngreso, fechaCorte, diasUtilidades, diasBono, tasaIntereses, porcentajeAnticipo]);

    return (
        <div className="min-h-full bg-surface-2 flex flex-col lg:flex-row overflow-hidden">

            {/* ══ LEFT PANEL ══════════════════════════════════════════════ */}
            <aside className="w-full lg:w-96 shrink-0 flex flex-col border-b lg:border-b-0 lg:border-r border-border-light bg-surface-1 overflow-y-auto">

                {/* Header */}
                <div className="px-5 py-4 border-b border-border-light">
                    <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-foreground/30 mb-0.5">Nómina · Prestaciones</p>
                    <p className="font-mono text-[14px] font-black uppercase tracking-tight text-foreground leading-none">Calculadora</p>
                    <p className="font-mono text-[9px] text-foreground/30 mt-1">Art. 142 LOTTT · Garantía de Prestaciones</p>
                </div>

                <div className="flex-1 divide-y divide-border-light">

                    {/* ── Empleado ────────────────────────────────────────── */}
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

                    {/* ── Parámetros ──────────────────────────────────────── */}
                    <div className="px-5 py-4 space-y-3">
                        <SectionHeader label="Parámetros" />
                        <div>
                            <label className={labelCls}>Fecha de corte</label>
                            <input type="date" value={fechaCorte}
                                onChange={e => setFechaCorte(e.target.value)} className={fieldCls} />
                            <p className="font-mono text-[9px] text-foreground/25 mt-1">Fecha de egreso o consulta</p>
                        </div>
                        <div>
                            <label className={labelCls}>Días de utilidades</label>
                            <input type="number" min="15" max="120" step="1"
                                value={diasUtilidades}
                                onChange={e => setDiasUtilidades(e.target.value)}
                                className={fieldCls + " text-right"} />
                            <p className="font-mono text-[9px] text-foreground/25 mt-1">Para calcular alícuota (mín. 15 · Art. 174)</p>
                        </div>
                        <div>
                            <label className={labelCls}>Días bono vacacional</label>
                            <input type="number" min="15" max="90" step="1"
                                value={diasBono}
                                onChange={e => setDiasBono(e.target.value)}
                                className={fieldCls + " text-right"} />
                            <p className="font-mono text-[9px] text-foreground/25 mt-1">Para calcular alícuota (mín. 15 · Art. 192)</p>
                        </div>
                    </div>

                    {/* ── Anticipo e Intereses ─────────────────────────────── */}
                    <div className="px-5 py-4 space-y-3">
                        <SectionHeader label="Ajustes" />
                        <div>
                            <label className={labelCls}>Tasa de intereses (%)</label>
                            <div className="relative">
                                <input type="number" step="0.01" min="0" max="100"
                                    value={tasaIntereses}
                                    onChange={e => setTasaIntereses(e.target.value)}
                                    className={fieldCls + " pr-9 text-right"} />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[12px] text-foreground/35 pointer-events-none select-none">%</span>
                            </div>
                            <p className="font-mono text-[9px] text-foreground/25 mt-1">Art. 143 LOTTT — sobre saldo × meses / 12</p>
                        </div>
                        <div>
                            <label className={labelCls}>Porcentaje de anticipo (%)</label>
                            <div className="relative">
                                <input type="number" step="1" min="0" max="75"
                                    value={porcentajeAnticipo}
                                    onChange={e => setPorcentajeAnticipo(e.target.value)}
                                    className={fieldCls + " pr-9 text-right"} />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[12px] text-foreground/35 pointer-events-none select-none">%</span>
                            </div>
                            <p className="font-mono text-[9px] text-foreground/25 mt-1">Art. 144 LOTTT — máximo 75% del saldo</p>
                        </div>
                        {calc && (
                            <div className="px-3 py-2 rounded-lg border border-border-light bg-surface-2 space-y-2">
                                <div>
                                    <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-foreground/35 mb-0.5">Intereses calculados</p>
                                    <p className="font-mono text-[13px] font-black tabular-nums text-emerald-600">{fmt(calc.interesesAcumulados)}</p>
                                </div>
                                <div>
                                    <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-foreground/35 mb-0.5">Anticipo ({porcentajeAnticipo}% saldo)</p>
                                    <p className="font-mono text-[13px] font-black tabular-nums text-amber-500">{fmt(calc.anticipoPrestaciones)}</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ── Cálculo ─────────────────────────────────────────── */}
                    <div className="px-5 py-4 space-y-0.5">
                        <SectionHeader label="Cálculo — Art. 142 LOTTT" />
                        {calc ? (<>
                            <CalcRow label="Salario mensual"  value={fmt(calc.salarioVES)} dim />
                            <CalcRow label="Salario diario"   formula="salario ÷ 30"
                                value={`${fmtN(calc.salarioDiario)} Bs./día`} dim />
                            <Hr />
                            <SectionHeader label="Salario integral" color="green" />
                            <CalcRow label="Alíc. utilidades"
                                formula={`sal.diario × ${diasUtilidades}d / 360`}
                                value={`${fmtN(calc.alicuotaUtil)} Bs./día`} dim />
                            <CalcRow label="Alíc. bono vac."
                                formula={`sal.diario × ${diasBono}d / 360`}
                                value={`${fmtN(calc.alicuotaBono)} Bs./día`} dim />
                            <CalcRow label="Sal. integral / día"
                                value={`${fmtN(calc.salarioIntegralDiario)} Bs./día`} accent="green" />
                            <Hr />
                            <SectionHeader label="Días acumulados" />
                            <CalcRow label="Trimestrales"
                                formula={`5d/mes × ${calc.mesesCompletos} meses`}
                                value={`${calc.diasTrimestrales} días`} dim />
                            <CalcRow label="Adicionales"
                                formula="2d × año desde año 2 (acumulativo)"
                                value={`${calc.diasAdicionales} días`} dim />
                            <CalcRow label="Total días"
                                value={`${calc.diasTotales} días`} accent="green" />
                            <Hr />
                            <SectionHeader label="Montos" />
                            <CalcRow label="Saldo acumulado"
                                formula={`${calc.diasTotales}d × ${fmtN(calc.salarioIntegralDiario)} Bs./día`}
                                value={fmt(calc.saldoAcumulado)} dim />
                            <CalcRow label="Garantía Art. 142.c"
                                formula={`30d × ${calc.anios} años × ${fmtN(calc.salarioIntegralDiario)} Bs./día`}
                                value={fmt(calc.garantia)} dim />
                            <Hr />
                            <CalcRow label={calc.aplicaGarantia ? "Garantía (mayor)" : "Saldo (mayor)"}
                                value={fmt(calc.montoFinal)} accent="green" />
                            {(calc.interesesAcumulados > 0 || calc.anticipoPrestaciones > 0) && (<>
                                <Hr />
                                <SectionHeader label="Pago inmediato" color="amber" />
                                {calc.anticipoPrestaciones > 0 && (
                                    <CalcRow label={`Anticipo (${porcentajeAnticipo}%)`} formula="Art. 144 LOTTT"
                                        value={fmt(calc.anticipoPrestaciones)} accent="amber" />
                                )}
                                {calc.interesesAcumulados > 0 && (
                                    <CalcRow label="Intereses acumulados" formula="Art. 143 LOTTT"
                                        value={fmt(calc.interesesAcumulados)} accent="green" />
                                )}
                                <CalcRow label="Total pago inmediato"
                                    value={fmt(calc.pagoInmediato)} accent="amber" />
                                <Hr />
                                <SectionHeader label="Saldo a favor" color="green" />
                                <CalcRow label="Monto prestaciones" formula={calc.aplicaGarantia ? "Garantía 142.c" : "Saldo acumulado"}
                                    value={fmt(calc.montoFinal)} dim />
                                <CalcRow label="− Anticipo + Intereses"
                                    value={`− ${fmt(calc.pagoInmediato)}`} dim />
                                <Hr />
                                <div className="flex items-baseline justify-between pt-1">
                                    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-foreground/50">Saldo a favor</span>
                                    <span className="font-mono text-[20px] font-black tabular-nums text-emerald-600">{fmt(calc.saldoFavor)}</span>
                                </div>
                            </>)}
                        </>) : (
                            <p className="font-mono text-[10px] text-foreground/30">
                                {salarioVES <= 0
                                    ? "Ingresa el salario del empleado."
                                    : !fechaIngreso
                                    ? "Ingresa la fecha de ingreso."
                                    : "Verifica los datos ingresados."}
                            </p>
                        )}
                    </div>
                </div>
            </aside>

            {/* ══ RIGHT PANEL ═════════════════════════════════════════════ */}
            <main className="flex-1 overflow-y-auto p-6">
                {calc ? (
                    <ConstanciaArt142
                        calc={calc}
                        fechaIngreso={fechaIngreso}
                        fechaCorte={fechaCorte}
                        employeeName={selectedEmp?.nombre  ?? "Empleado"}
                        employeeCedula={selectedEmp?.cedula ?? "—"}
                        employeeCargo={selectedEmp?.cargo}
                        companyName={company?.name ?? "La Empresa"}
                        porcentajeAnticipo={porcentajeAnticipo}
                        tasaIntereses={tasaIntereses}
                    />
                ) : (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-foreground/20">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.8">
                            <rect x="2" y="3" width="20" height="14" rx="2"/>
                            <path d="M8 21h8M12 17v4"/>
                        </svg>
                        <p className="font-mono text-[12px] uppercase tracking-widest">Ingresa los datos del empleado</p>
                    </div>
                )}
            </main>
        </div>
    );
}
