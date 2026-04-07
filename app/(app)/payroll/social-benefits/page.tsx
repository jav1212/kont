"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { FileText, Download, RefreshCw, Users, Calendar, TrendingUp, Percent, Info, ClipboardCheck, ChevronDown, Clock, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";
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
    employeeCargo, companyName, companyLogoUrl, showLogoInPdf, porcentajeAnticipo, tasaIntereses }: {
    calc: PrestacionesCalc;
    fechaIngreso: string; fechaCorte: string;
    employeeName: string; employeeCedula: string; employeeCargo?: string;
    companyName: string; companyLogoUrl?: string; showLogoInPdf?: boolean;
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
        logoUrl:               companyLogoUrl,
        showLogoInPdf:         showLogoInPdf,
    };

    const [downloadingFull, setDownloadingFull] = useState(false);
    const [downloadingInt, setDownloadingInt] = useState(false);

    const handlePdf = async () => {
        try {
            setDownloadingFull(true);
            await generatePrestacionesPdf(pdfBase);
        } catch (err: any) {
            console.error(err);
            alert("Error al descargar: " + (err?.message || String(err)));
        } finally {
            setDownloadingFull(false);
        }
    };
    const handlePdfIntereses = async () => {
        try {
            setDownloadingInt(true);
            await generateInteresesAnticipoPdf(pdfBase);
        } catch (err: any) {
            console.error(err);
            alert("Error al descargar: " + (err?.message || String(err)));
        } finally {
            setDownloadingInt(false);
        }
    };

    const mesesResto = calc.mesesCompletos % 12;
    const antiguedad = `${calc.anios} año${calc.anios !== 1 ? "s" : ""}${mesesResto > 0 ? ` ${mesesResto} mes${mesesResto !== 1 ? "es" : ""}` : ""}`;
    const emitido = new Date().toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();

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
                        <p className="text-[11px] text-[var(--text-tertiary)] mt-2 uppercase tracking-[0.2em] font-semibold">PRESTACIONES SOCIALES</p>
                        <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 font-medium">Art. 142 LOTTT — Garantía y Acumulados</p>
                    </div>
                </div>
                <div className="text-right shrink-0">
                    <p className="text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-0.5">Corte al</p>
                    <p className="text-[13px] font-bold text-foreground bg-surface-2 px-2.5 py-1 rounded inline-block border border-border-light">{formatDateES(fechaCorte)}</p>
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
                            {antiguedad}
                        </div>
                    </div>
                </div>
            </div>

            <div className="px-8 py-5 grid grid-cols-2 lg:grid-cols-4 gap-6 border-b border-border-light bg-surface-2/20">
                {[
                    { lbl: "Salario Mensual",  val: fmt(calc.salarioVES), color: "text-foreground" },
                    { lbl: "Fecha Ingreso", val: formatDateES(fechaIngreso), color: "text-foreground" },
                    { lbl: "Antigüedad",val: antiguedad, color: "text-primary-500" },
                    { lbl: "Salario Integral",val: fmt(calc.salarioIntegralDiario) + " /día", color: "text-emerald-500 font-bold bg-emerald-500/10 px-2 py-0.5 rounded inline-flex border border-emerald-500/20" },
                ].map((item, idx) => (
                    <div key={idx} className="flex flex-col">
                        <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-tertiary)] mb-1.5">{item.lbl}</span>
                        <span className={`font-mono text-[13px] font-medium tabular-nums ${item.color}`}>{item.val}</span>
                    </div>
                ))}
            </div>

            <div className="px-8 py-5 border-b border-border-light">
                <SectionHeader label="Prestaciones acumuladas (Art. 142)" />
                <div className="space-y-1">
                    <CalcRow label="Saldo Acumulado" formula={`${calc.diasTotales}d totales acumulados`} value={fmt(calc.saldoAcumulado)} />
                    <CalcRow label="Garantía Art. 142.c" formula={`30 d/año × ${calc.anios} años`} value={fmt(calc.garantia)} />
                </div>
                <div className="flex justify-between items-baseline pt-4 mt-2 border-t border-border-light">
                    <div>
                        <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--text-secondary)] block">Monto total prestaciones</span>
                        <span className="font-mono text-[10px] text-[var(--text-tertiary)] mt-1 block">Saldo acumulado + Garantía</span>
                    </div>
                    <span className="font-mono text-[20px] font-black tabular-nums text-foreground">{fmt(calc.montoFinal)}</span>
                </div>
            </div>

            {(calc.anticipoPrestaciones > 0 || calc.interesesAcumulados > 0) && (
                <div className="px-8 py-5 border-b border-border-light bg-surface-2/30">
                    <SectionHeader label="Pago inmediato (Art. 143 / 144 LOTTT)" color="amber" />
                    <div className="space-y-1">
                        <CalcRow label="Adelanto de Prestaciones" formula={`Art. 144 — ${porcentajeAnticipo}%`} value={fmt(calc.anticipoPrestaciones)} accent="amber" />
                        <CalcRow label="Intereses Acumulados" formula={`Art. 143 — Tasa ${tasaIntereses}%`} value={fmt(calc.interesesAcumulados)} accent="green" />
                    </div>
                    <div className="flex justify-between items-baseline pt-4 mt-2 border-t border-border-light">
                        <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Total pago inmediato</span>
                        <span className="font-mono text-[18px] font-black tabular-nums text-amber-500">{fmt(calc.pagoInmediato)}</span>
                    </div>
                </div>
            )}

            {(calc.anticipoPrestaciones > 0 || calc.interesesAcumulados > 0) && (
                <div className="px-8 py-6 bg-emerald-500/[0.03]">
                    <div className="flex justify-between items-baseline mb-1">
                        <span className="font-mono text-[12px] text-[var(--text-secondary)]">Monto total prestaciones</span>
                        <span className="font-mono text-[12px] tabular-nums text-[var(--text-secondary)]">{fmt(calc.montoFinal)}</span>
                    </div>
                    <div className="flex justify-between items-baseline mb-4">
                        <span className="font-mono text-[12px] text-[var(--text-secondary)]">− Anticipo + Intereses</span>
                        <span className="font-mono text-[12px] tabular-nums text-[var(--text-secondary)]">− {fmt(calc.pagoInmediato)}</span>
                    </div>
                    <div className="flex justify-between items-baseline pt-4 border-t border-border-light">
                        <div>
                            <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--text-secondary)] block">Saldo a Favor</span>
                            <span className="font-mono text-[10px] text-[var(--text-tertiary)] mt-1 block">Monto depositado en cuenta de garantía</span>
                        </div>
                        <span className="font-mono text-[24px] font-black tabular-nums text-emerald-500">{fmt(calc.saldoFavor)}</span>
                    </div>
                </div>
            )}

            <div className="px-5 py-4 bg-surface-2/50 border-t border-border-light flex gap-3 justify-end items-center">
                <BaseButton.Root variant="secondary" onClick={handlePdfIntereses} disabled={downloadingInt} leftIcon={downloadingInt ? <RefreshCw size={14} className="animate-spin" /> : <FileText size={14} />}>
                    {downloadingInt ? "Generando..." : "Reporte Intereses"}
                </BaseButton.Root>
                <BaseButton.Root variant="secondary" onClick={handlePdf} disabled={downloadingFull} leftIcon={downloadingFull ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}>
                    {downloadingFull ? "Generando..." : "Reporte Completo"}
                </BaseButton.Root>
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

    const [exportingLote, setExportingLote] = useState(false);
    const handleExportLote = async () => {
        setExportingLote(true);
        try {
            for (const r of results) {
                if (!r.calc) continue;
                const pct = Math.min(100, Math.max(0, parseFloat(porcentajeAnticipo) || 75));
                const tasa = Math.max(0, parseFloat(tasaIntereses) || 0);
                await generatePrestacionesPdf({
                    companyName: company?.name ?? "La Empresa",
                    employee: { nombre: r.emp.nombre, cedula: r.emp.cedula, cargo: r.emp.cargo },
                    fechaIngreso: r.emp.fechaIngreso ?? "",
                    fechaCorte,
                    anios: r.calc.anios,
                    mesesCompletos: r.calc.mesesCompletos,
                    totalDias: r.calc.totalDias,
                    salarioVES: r.calc.salarioVES,
                    salarioDiario: r.calc.salarioDiario,
                    alicuotaUtil: r.calc.alicuotaUtil,
                    alicuotaBono: r.calc.alicuotaBono,
                    salarioIntegralDiario: r.calc.salarioIntegralDiario,
                    diasTrimestrales: r.calc.diasTrimestrales,
                    diasAdicionales: r.calc.diasAdicionales,
                    diasTotales: r.calc.diasTotales,
                    saldoAcumulado: r.calc.saldoAcumulado,
                    garantia: r.calc.garantia,
                    montoFinal: r.calc.montoFinal,
                    aplicaGarantia: r.calc.aplicaGarantia,
                    anticipoPrestaciones: r.calc.anticipoPrestaciones,
                    interesesAcumulados: r.calc.interesesAcumulados,
                    pagoInmediato: r.calc.pagoInmediato,
                    saldoFavor: r.calc.saldoFavor,
                    porcentajeAnticipo: pct,
                    tasaIntereses: tasa,
                    logoUrl: company?.logoUrl,
                    showLogoInPdf: company?.showLogoInPdf,
                });
            }
        } catch (err: any) {
            console.error(err);
            alert("Error al exportar: " + (err?.message || String(err)));
        } finally {
            setExportingLote(false);
        }
    };

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

                        <div className="px-5 py-4">
                            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-3 flex items-center gap-2">
                                <TrendingUp size={11} className="text-primary-500/60" />
                                Resumen de Cálculo
                            </p>
                            {calc ? (
                                <div className="rounded-xl border border-border-light bg-surface-2/30 overflow-hidden">
                                    {/* Salary block */}
                                    <div className="px-4 py-3 space-y-1.5 border-b border-border-light/60">
                                        <div className="flex justify-between items-baseline">
                                            <span className="font-mono text-[11px] text-[var(--text-secondary)]">Salario mensual</span>
                                            <span className="font-mono text-[12px] font-semibold tabular-nums text-foreground">{fmt(calc.salarioVES)}</span>
                                        </div>
                                        <div className="flex justify-between items-baseline">
                                            <span className="font-mono text-[11px] text-[var(--text-tertiary)]">Sal. diario</span>
                                            <span className="font-mono text-[11px] tabular-nums text-[var(--text-secondary)]">{fmtN(calc.salarioDiario)} /día</span>
                                        </div>
                                        <div className="flex justify-between items-baseline pt-1 border-t border-dashed border-border-light/60">
                                            <span className="font-mono text-[11px] font-bold text-[var(--text-secondary)]">Sal. integral / día</span>
                                            <span className="font-mono text-[12px] font-bold tabular-nums text-foreground">{fmtN(calc.salarioIntegralDiario)} /día</span>
                                        </div>
                                    </div>
                                    {/* Accumulated block */}
                                    <div className="px-4 py-3 space-y-1.5 border-b border-border-light/60">
                                        <div className="flex justify-between items-baseline">
                                            <span className="font-mono text-[11px] text-[var(--text-secondary)]">Saldo acumulado</span>
                                            <span className="font-mono text-[12px] font-semibold tabular-nums text-foreground">{fmt(calc.saldoAcumulado)}</span>
                                        </div>
                                        <div className="flex justify-between items-baseline">
                                            <span className="font-mono text-[11px] text-[var(--text-tertiary)]">Garantía 142.c</span>
                                            <span className="font-mono text-[11px] tabular-nums text-[var(--text-secondary)]">{fmt(calc.garantia)}</span>
                                        </div>
                                    </div>
                                    {/* Total */}
                                    <div className="px-4 py-3.5 flex justify-between items-center bg-surface-1">
                                        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--text-secondary)]">Saldo a favor</span>
                                        <span className="font-mono text-[18px] font-black tabular-nums text-foreground">{fmt(calc.saldoFavor)}</span>
                                    </div>
                                </div>
                            ) : (
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
                            onClick={handleExportLote}
                            disabled={results.length === 0 || exportingLote}
                            leftIcon={exportingLote ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
                        >
                            {exportingLote ? `Generando…` : `Generar PDF (${results.filter(r => r.calc).length})`}
                        </BaseButton.Root>
                    </div>
                </aside>

                <main className="flex-1 overflow-y-auto p-6 lg:p-10 bg-surface-2 lg:bg-surface-2/50 relative">
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:14px_14px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />
                    <div className="relative z-10 w-full h-full">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-full gap-4 text-[var(--text-tertiary)]">
                            <RefreshCw size={24} className="animate-spin text-primary-500/50" />
                            <span className="text-[13px] font-bold uppercase tracking-widest">Cargando datos…</span>
                        </div>
                    ) : results.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full gap-5 text-[var(--text-disabled)] max-w-sm mx-auto animate-in fade-in duration-500">
                            <div className="w-20 h-20 rounded-[1.5rem] bg-surface-1 border border-border-light flex items-center justify-center shadow-sm text-border-medium">
                                <Users strokeWidth={1.5} size={32} />
                            </div>
                            <div className="text-center space-y-2">
                                <p className="text-[14px] font-bold uppercase tracking-widest text-foreground">Sistema Listo</p>
                                <p className="text-[13px] font-medium text-[var(--text-secondary)] leading-relaxed">
                                    Selecciona un empleado de la lista y ajusta los parámetros de cálculo para previsualizar la constancia de prestaciones sociales.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="max-w-4xl mx-auto space-y-10 pb-12">
                            {results.map((r, i) => {
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
                                    <motion.div
                                        key={r.emp.cedula}
                                        initial={{ opacity: 0, scale: 0.98, y: 15 }}
                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                        transition={{ delay: i * 0.05, ease: "easeOut" }}
                                    >
                                        <ConstanciaArt142
                                            calc={r.calc}
                                            fechaIngreso={r.emp.fechaIngreso ?? ""}
                                            fechaCorte={fechaCorte}
                                            employeeName={r.emp.nombre}
                                            employeeCedula={r.emp.cedula}
                                            employeeCargo={r.emp.cargo}
                                            companyName={company?.name ?? "La Empresa"}
                                            companyLogoUrl={company?.logoUrl}
                                            showLogoInPdf={company?.showLogoInPdf}
                                            porcentajeAnticipo={porcentajeAnticipo}
                                            tasaIntereses={tasaIntereses}
                                        />
                                    </motion.div>
                                );
                            })}
                        </div>
                    )}
                    </div>
                </main>
            </div>
        </div>
    );
}
