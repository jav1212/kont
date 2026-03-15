"use client";

import { useState, useMemo, useEffect } from "react";
import { useCompany }  from "@/src/modules/companies/frontend/hooks/use-companies";
import { useEmployee } from "@/src/modules/payroll/frontend/hooks/use-employee";
import type { Employee } from "@/src/modules/payroll/frontend/hooks/use-employee";
import { computePrestaciones } from "@/src/modules/payroll/frontend/utils/prestaciones-calculator";
import { generatePrestacionesPdf } from "@/src/modules/payroll/frontend/utils/prestaciones-pdf";

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
    aplicaGarantia:        boolean;
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
    employeeCargo, companyName }: {
    calc: PrestacionesCalc;
    fechaIngreso: string; fechaCorte: string;
    employeeName: string; employeeCedula: string; employeeCargo?: string;
    companyName: string;
}) {
    const handlePdf = () => generatePrestacionesPdf({
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
    });

    const mesesResto = calc.mesesCompletos % 12;

    return (
        <div className="max-w-2xl mx-auto space-y-3">
            <div className="flex justify-end">
                <button onClick={handlePdf}
                    className="flex items-center gap-2 h-8 px-4 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-mono text-[11px] uppercase tracking-[0.12em] transition-colors duration-150">
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                        <path d="M3 12h10M8 2v8m-3-3 3 3 3-3"/>
                    </svg>
                    Descargar PDF
                </button>
            </div>
            <div className="rounded-2xl border border-emerald-500/20 bg-surface-1 overflow-hidden shadow-sm">

                {/* Header */}
                <div className="bg-[#12121a] px-8 py-6 relative overflow-hidden">
                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-emerald-600" />
                    <div className="absolute left-1.5 right-0 bottom-0 h-0.5 bg-emerald-500/40" />
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#64648a] mb-1">Constancia de Prestaciones Sociales · Art. 142 LOTTT</p>
                            <p className="font-mono text-[17px] font-black uppercase text-white tracking-tight leading-none">{companyName}</p>
                        </div>
                        <div className="text-right shrink-0">
                            <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-[#64648a] mb-1">Corte al</p>
                            <p className="font-mono text-[13px] font-black text-white">{formatDateES(fechaCorte)}</p>
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
                            Ingreso: {formatDateES(fechaIngreso)}
                        </p>
                    </div>
                </div>

                {/* Antigüedad strip */}
                <div className="px-8 py-4 border-b border-border-light grid grid-cols-3 gap-4 bg-[#12121a]">
                    {[
                        { lbl: "Antigüedad",          val: `${calc.anios} año${calc.anios !== 1 ? "s" : ""}${mesesResto > 0 ? ` ${mesesResto} mes${mesesResto !== 1 ? "es" : ""}` : ""}` },
                        { lbl: "Sal. Integral / Día",  val: fmt(calc.salarioIntegralDiario) },
                        { lbl: "Sal. Integral / Mes",  val: fmt(calc.salarioIntegralDiario * 30) },
                    ].map(({ lbl, val }) => (
                        <div key={lbl}>
                            <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-[#64648a] mb-0.5">{lbl}</p>
                            <p className="font-mono text-[11px] font-bold text-white tabular-nums">{val}</p>
                        </div>
                    ))}
                </div>

                {/* Salario integral breakdown */}
                <div className="px-8 py-5 border-b border-border-light bg-surface-2/50">
                    <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-foreground/30 mb-3">Composición del salario integral (Art. 122)</p>
                    <div className="space-y-2">
                        {[
                            { lbl: "Salario normal / día",     sub: "Salario mensual ÷ 30",                val: fmt(calc.salarioDiario) },
                            { lbl: "Alícuota de utilidades",   sub: "Sal. diario × días_util / 360",       val: fmt(calc.alicuotaUtil) },
                            { lbl: "Alícuota bono vacacional", sub: "Sal. diario × días_bono / 360",       val: fmt(calc.alicuotaBono) },
                        ].map(({ lbl, sub, val }) => (
                            <div key={lbl} className="flex items-start justify-between gap-2">
                                <div>
                                    <span className="font-mono text-[11px] text-foreground/70">{lbl}</span>
                                    <div className="font-mono text-[9px] text-foreground/30 mt-0.5">{sub}</div>
                                </div>
                                <span className="font-mono text-[12px] tabular-nums shrink-0 text-foreground/60">{val}</span>
                            </div>
                        ))}
                        <div className="pt-2 border-t border-border-light flex items-baseline justify-between">
                            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-600">Sal. integral diario</span>
                            <span className="font-mono text-[14px] font-black tabular-nums text-emerald-600">{fmt(calc.salarioIntegralDiario)}</span>
                        </div>
                    </div>
                </div>

                {/* Días acumulados */}
                <div className="px-8 py-5 border-b border-border-light">
                    <div className="grid grid-cols-[1fr_auto_auto] gap-4 pb-2 border-b-2 border-border-light">
                        {["Concepto", "Días", "Monto"].map(h => (
                            <p key={h} className="font-mono text-[8px] uppercase tracking-[0.2em] text-foreground/30 text-right first:text-left">{h}</p>
                        ))}
                    </div>

                    <div className="grid grid-cols-[1fr_auto_auto] gap-4 py-4 border-b border-border-light/60 items-start">
                        <div>
                            <p className="font-mono text-[12px] font-bold text-foreground">Días trimestrales</p>
                            <p className="font-mono text-[8px] text-foreground/30 mt-0.5">
                                5 días/mes × {calc.mesesCompletos} meses completos
                            </p>
                        </div>
                        <p className="font-mono text-[13px] tabular-nums text-foreground/60 text-right">{calc.diasTrimestrales}</p>
                        <p className="font-mono text-[13px] tabular-nums text-foreground/30 text-right">—</p>
                    </div>

                    <div className="grid grid-cols-[1fr_auto_auto] gap-4 py-4 border-b border-border-light/60 items-start">
                        <div>
                            <p className="font-mono text-[12px] font-bold text-foreground">Días adicionales</p>
                            <p className="font-mono text-[8px] text-foreground/30 mt-0.5">
                                2d × año desde año 2 (acumulativo) — Art. 142.b
                            </p>
                        </div>
                        <p className="font-mono text-[13px] tabular-nums text-foreground/60 text-right">{calc.diasAdicionales}</p>
                        <p className="font-mono text-[13px] tabular-nums text-foreground/30 text-right">—</p>
                    </div>

                    {/* Saldo acumulado */}
                    <div className="grid grid-cols-[1fr_auto_auto] gap-4 py-4 border-b border-border-light/60 items-center bg-primary-500/5 -mx-8 px-8">
                        <div>
                            <p className="font-mono text-[12px] font-bold text-foreground">Saldo acumulado</p>
                            <p className="font-mono text-[8px] text-foreground/30 mt-0.5">
                                {calc.diasTotales}d × {fmt(calc.salarioIntegralDiario)}
                            </p>
                        </div>
                        <p className="font-mono text-[14px] font-black tabular-nums text-primary-500 text-right">{calc.diasTotales}</p>
                        <p className="font-mono text-[14px] font-black tabular-nums text-primary-500 text-right">{fmt(calc.saldoAcumulado)}</p>
                    </div>

                    {/* Garantía Art. 142.c */}
                    <div className="grid grid-cols-[1fr_auto_auto] gap-4 py-4 items-center bg-emerald-500/5 -mx-8 px-8">
                        <div>
                            <p className="font-mono text-[12px] font-bold text-foreground">Garantía Art. 142.c</p>
                            <p className="font-mono text-[8px] text-foreground/30 mt-0.5">
                                30 días × {fmt(calc.salarioIntegralDiario)} × {calc.anios} año{calc.anios !== 1 ? "s" : ""}
                            </p>
                        </div>
                        <p className="font-mono text-[14px] font-black tabular-nums text-emerald-600 text-right">30×{calc.anios}</p>
                        <p className="font-mono text-[14px] font-black tabular-nums text-emerald-600 text-right">{fmt(calc.garantia)}</p>
                    </div>
                </div>

                {/* Total final */}
                <div className={`px-8 py-5 ${calc.aplicaGarantia ? "bg-emerald-700" : "bg-primary-500"}`}>
                    <div className="flex items-baseline justify-between">
                        <div>
                            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-white/70 mb-0.5">
                                {calc.aplicaGarantia ? "Se aplica garantía Art. 142.c" : "Se aplica saldo acumulado"}
                            </p>
                            <p className="font-mono text-[9px] text-white/50">
                                {calc.aplicaGarantia
                                    ? "La garantía supera el saldo trimestral acumulado"
                                    : "El saldo acumulado supera la garantía mínima"}
                            </p>
                        </div>
                        <p className="font-mono text-[24px] font-black tabular-nums text-white">{fmt(calc.montoFinal)}</p>
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
    const [fechaCorte,     setFechaCorte]     = useState(isoToday());
    const [diasUtilidades, setDiasUtilidades] = useState("15");
    const [diasBono,       setDiasBono]       = useState("15");

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

        const salarioDiario = salarioVES / 30;
        const alicuotaUtil  = salarioDiario * diasUtil    / 360;
        const alicuotaBono  = salarioDiario * diasBonoVac / 360;
        const garantia       = 30 * res.salarioIntegralDiario * res.anios;
        const saldoAcumulado = res.saldoPrestaciones;
        const aplicaGarantia = garantia > saldoAcumulado;
        const montoFinal     = Math.max(saldoAcumulado, garantia);

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
            aplicaGarantia,
        };
    }, [salarioVES, fechaIngreso, fechaCorte, diasUtilidades, diasBono]);

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
                            <div className="flex items-baseline justify-between pt-1">
                                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-foreground/50">
                                    {calc.aplicaGarantia ? "Garantía (mayor)" : "Saldo (mayor)"}
                                </span>
                                <span className={`font-mono text-[20px] font-black tabular-nums ${calc.aplicaGarantia ? "text-emerald-600" : "text-primary-500"}`}>
                                    {fmt(calc.montoFinal)}
                                </span>
                            </div>
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
