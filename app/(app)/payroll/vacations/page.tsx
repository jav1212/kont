"use client";

import { useState, useMemo } from "react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import {
    Calendar, ClipboardCheck, Info, TrendingUp,
} from "lucide-react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useEmployee } from "@/src/modules/payroll/frontend/hooks/use-employee";
import type { Employee } from "@/src/modules/payroll/frontend/hooks/use-employee";
import { getTodayIsoDate } from "@/src/shared/frontend/utils/local-date";
import { getHolidaysInRange } from "@/src/modules/payroll/frontend/utils/venezuela-holidays";
import {
    generateVacComplletasPdf,
    generateVacFraccionadasPdf,
} from "@/src/modules/payroll/frontend/utils/vacaciones-pdf";

import {
    formatCurrency,
    formatNumber,
    formatDateLong,
    formatDateUpper,
    makeDocumentId,
    LABEL_CLS,
    useCalculatorBcv,
    SectionHeader,
    CalculatorPanelHeader,
    OnlyActiveToggle,
    EmployeeSelect,
    EmployeeInfoCard,
    BcvRateField,
    CalculatorFooter,
    FooterStat,
    FooterTotal,
    ConstanciaShell,
    ConstanciaWarning,
    LiquidoTotal,
    CalcRow,
    CalculatorLoading,
    CalculatorEmptyState,
} from "@/src/modules/payroll/frontend/components/calculator";

// ============================================================================
// HELPERS — vacations-specific date / period math
// ============================================================================

function localIso(date: Date): string {
    const year  = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day   = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
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
    const holidayEnd   = addCalDays(holidayStart, 14);
    const holidays     = new Set(getHolidaysInRange(holidayStart, holidayEnd).map((h) => h.date));
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
    const cur      = new Date(fechaInicio + "T00:00:00");
    let counted    = 0;
    while (counted < diasHabilesNeeded) {
        const wd  = cur.getDay();
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
    const holSet   = new Set(holidays.map(h => h.date));
    let habiles = 0, descanso = 0;
    const cur = new Date(inicio + "T00:00:00");
    const end = new Date(culminacion + "T00:00:00");
    while (cur <= end) {
        const wd  = cur.getDay();
        const iso = localIso(cur);
        if (wd === 0 || wd === 6 || holSet.has(iso)) { descanso++; } else { habiles++; }
        cur.setDate(cur.getDate() + 1);
    }
    return { habiles, descanso, feriadoList: holidays.map(h => h.name) };
}

// ============================================================================
// CALCULATION ENGINES — preserve verbatim from previous implementation
// ============================================================================

// ── Vacaciones completas ─────────────────────────────────────────────────────

interface VacCalc {
    diasCalendario: number; diasHabiles: number; diasDescanso: number; feriadoList: string[];
    salarioVES: number; salarioDia: number; anios: number;
    diasLegalDisfrute: number; diasDisfrute: number; diasAdicDisfrute: number; montoDisfrute: number;
    diasLegalBono: number; diasBono: number; diasAdicBono: number; montoBono: number;
    total: number;
}

function computeVac(
    salarioVES: number, fechaIngreso: string, fechaInicio: string, fechaCulminacion: string,
): VacCalc | null {
    if (!fechaInicio || !fechaCulminacion || fechaInicio > fechaCulminacion || salarioVES <= 0) return null;
    const { habiles, descanso, feriadoList } = getPeriodStats(fechaInicio, fechaCulminacion);
    const diasCalendario   = getDiasCalendario(fechaInicio, fechaCulminacion);
    const anios            = calcAniosAt(fechaIngreso, fechaInicio);
    const diasAdicDisfrute = anios >= 2 ? Math.min(anios - 1, 15) : 0;
    const diasLegalDisfrute = 15 + diasAdicDisfrute;
    const diasDisfrute     = Math.max(diasLegalDisfrute, habiles);
    const diasAdicBono     = anios >= 2 ? Math.min(anios - 1, 15) : 0;
    const diasLegalBono    = 15 + diasAdicBono;
    const diasBono         = diasLegalBono;
    const salarioDia       = salarioVES / 30;
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
    salarioVES:        number;
    salarioDia:        number;
    aniosCompletos:    number;
    ultimoAniversario: string;
    mesesFraccion:     number;
    diasAdicAnuales:   number;
    diasAnuales:       number;
    fraccionDisfrute:  number;
    fraccionBono:      number;
    montoDisfrute:     number;
    montoBono:         number;
    total:             number;
}

function computeVacFrac(salarioVES: number, fechaIngreso: string, fechaEgreso: string): VacFracCalc | null {
    if (!fechaIngreso || !fechaEgreso || salarioVES <= 0) return null;
    if (fechaEgreso <= fechaIngreso) return null;

    const aniosCompletos    = calcAniosAt(fechaIngreso, fechaEgreso);
    const ultimoAniversario = aniosCompletos > 0
        ? getAniversario(fechaIngreso, aniosCompletos)
        : fechaIngreso;

    const mesesFraccion = getMesesCompletos(ultimoAniversario, fechaEgreso);

    const diasAdicAnuales = Math.min(aniosCompletos, 15);
    const diasAnuales     = 15 + diasAdicAnuales;

    const fraccionDisfrute = Math.ceil((diasAnuales / 12) * mesesFraccion);
    const fraccionBono     = Math.ceil((diasAnuales / 12) * mesesFraccion);

    const salarioDia    = salarioVES / 30;
    const montoDisfrute = fraccionDisfrute * salarioDia;
    const montoBono     = fraccionBono * salarioDia;

    return {
        salarioVES, salarioDia, aniosCompletos, ultimoAniversario,
        mesesFraccion, diasAdicAnuales, diasAnuales,
        fraccionDisfrute, fraccionBono,
        montoDisfrute, montoBono,
        total: montoDisfrute + montoBono,
    };
}

// ============================================================================
// CONSTANCIA — Completa
// ============================================================================

interface ConstanciaCompletaProps {
    calc: VacCalc;
    employeeName: string; employeeCedula: string; employeeCargo?: string;
    companyName:  string; companyLogoUrl?: string; showLogoInPdf?: boolean;
    fechaIngreso: string; fechaInicio:    string; fechaCulminacion: string; fechaReintegro: string;
}

function ConstanciaCompleta({
    calc, employeeName, employeeCedula, employeeCargo,
    companyName, companyLogoUrl, showLogoInPdf,
    fechaIngreso, fechaInicio, fechaCulminacion, fechaReintegro,
}: ConstanciaCompletaProps) {
    const documentId = makeDocumentId(companyName, employeeCedula, fechaIngreso, fechaInicio, fechaCulminacion);

    return (
        <ConstanciaShell
            companyName={companyName}
            companyLogoUrl={companyLogoUrl}
            showLogo={showLogoInPdf}
            title="Vacaciones Completas"
            legalNote="Arts. 190 · 192 LOTTT — Disfrute y Bono Vacacional"
            headerRight={
                <>
                    <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-1">Período</p>
                    <p className="font-mono text-[13px] font-bold text-foreground bg-surface-2 px-2.5 py-1 rounded inline-block border border-border-light">
                        {formatDateLong(fechaInicio)} al {formatDateLong(fechaCulminacion)}
                    </p>
                    <p className="font-mono text-[9px] text-[var(--text-tertiary)] mt-2 uppercase tracking-[0.18em]">
                        Emitido: {formatDateUpper(getTodayIsoDate())}
                    </p>
                </>
            }
            employeeName={employeeName}
            employeeCedula={employeeCedula}
            employeeCargo={employeeCargo}
            yearsOfService={calc.anios}
            kpis={[
                { label: "Salario Mensual",  value: formatCurrency(calc.salarioVES) },
                { label: "Salario Diario",   value: formatCurrency(calc.salarioDia) + " /día" },
                { label: "Fecha Reintegro",  value: formatDateLong(fechaReintegro), tone: "success" },
                { label: "Cal · Háb · Desc", value: `${calc.diasCalendario} · ${calc.diasHabiles} · ${calc.diasDescanso}` },
            ]}
            documentId={documentId}
        >
            <SectionHeader label="Conceptos" />
            <div className="space-y-1">
                <CalcRow
                    label="Disfrute Vacacional"
                    formula={`Art. 190 LOTTT — 15 días base${calc.diasAdicDisfrute > 0 ? ` + ${calc.diasAdicDisfrute} adicional${calc.diasAdicDisfrute !== 1 ? "es" : ""}` : ""}`}
                    value={formatCurrency(calc.montoDisfrute)}
                />
                <CalcRow
                    label="Bono Vacacional"
                    formula={`Art. 192 LOTTT — 15 días base${calc.diasAdicBono > 0 ? ` + ${calc.diasAdicBono} adicional${calc.diasAdicBono !== 1 ? "es" : ""}` : ""}`}
                    value={formatCurrency(calc.montoBono)}
                />
            </div>
            <LiquidoTotal label="Monto a Pagar" valueBs={calc.total} />
        </ConstanciaShell>
    );
}

// ============================================================================
// CONSTANCIA — Fraccionada
// ============================================================================

interface ConstanciaFraccionadaProps {
    calc: VacFracCalc;
    employeeName: string; employeeCedula: string; employeeCargo?: string;
    companyName:  string; companyLogoUrl?: string; showLogoInPdf?: boolean;
    fechaIngreso: string; fechaEgreso: string;
}

function ConstanciaFraccionada({
    calc, employeeName, employeeCedula, employeeCargo,
    companyName, companyLogoUrl, showLogoInPdf,
    fechaIngreso, fechaEgreso,
}: ConstanciaFraccionadaProps) {
    const documentId = makeDocumentId(companyName, employeeCedula, fechaIngreso, fechaEgreso, calc.ultimoAniversario);

    return (
        <ConstanciaShell
            companyName={companyName}
            companyLogoUrl={companyLogoUrl}
            showLogo={showLogoInPdf}
            title="Vacaciones Fraccionadas"
            legalNote="Art. 196 LOTTT — Porción proporcional"
            headerRight={
                <>
                    <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-1">Fecha de Egreso</p>
                    <p className="font-mono text-[13px] font-bold text-foreground bg-surface-2 px-2.5 py-1 rounded inline-block border border-border-light">
                        {formatDateLong(fechaEgreso)}
                    </p>
                    <p className="font-mono text-[9px] text-[var(--text-tertiary)] mt-2 uppercase tracking-[0.18em]">
                        Emitido: {formatDateUpper(getTodayIsoDate())}
                    </p>
                </>
            }
            employeeName={employeeName}
            employeeCedula={employeeCedula}
            employeeCargo={employeeCargo}
            yearsOfService={calc.aniosCompletos}
            kpis={[
                { label: "Fecha de Ingreso",   value: formatDateLong(fechaIngreso) },
                { label: "Último Aniversario", value: formatDateLong(calc.ultimoAniversario) },
                { label: "Meses (Fracción)",   value: `${calc.mesesFraccion} mes${calc.mesesFraccion !== 1 ? "es" : ""}`, tone: "primary" },
                { label: "Días Anuales Base",  value: `${calc.diasAnuales} días` },
            ]}
            documentId={documentId}
        >
            <div className="mb-4 bg-surface-2/80 p-3 rounded-lg border border-border-light flex gap-3 items-center">
                <Info className="text-[var(--text-secondary)] shrink-0" size={16} />
                <div>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-secondary)] font-bold mb-0.5">Fórmula Art. 196</p>
                    <p className="font-mono text-[12px] text-foreground font-medium tabular-nums">
                        ⌈ {calc.diasAnuales} días / 12 meses × {calc.mesesFraccion} meses ⌉ = {calc.fraccionDisfrute} días
                    </p>
                </div>
            </div>

            <SectionHeader label="Conceptos" />
            <div className="space-y-1">
                <CalcRow
                    label="Disfrute Fraccionado"
                    formula={`Art. 190 + 196 LOTTT — ${calc.fraccionDisfrute} d`}
                    value={formatCurrency(calc.montoDisfrute)}
                />
                <CalcRow
                    label="Bono Vacacional Fracc."
                    formula={`Art. 192 + 196 LOTTT — ${calc.fraccionBono} d`}
                    value={formatCurrency(calc.montoBono)}
                />
            </div>
            <LiquidoTotal label="Monto a Pagar" valueBs={calc.total} />
        </ConstanciaShell>
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
    const [mode, setMode]              = useState<Mode>("completas");
    const [isExporting, setIsExporting] = useState(false);

    // ── Employee selection ──────────────────────────────────────────────────
    const [selectedCedula,  setSelectedCedula]  = useState<string>("");
    const [soloActivos,     setSoloActivos]     = useState(true);
    const [salarioOverride, setSalarioOverride] = useState("");
    const [manualIngreso,   setManualIngreso]   = useState("");

    // ── BCV via shared hook ─────────────────────────────────────────────────
    const {
        exchangeRate, setExchangeRate,
        bcvRate, bcvLoading, bcvFetchError, fetchBcvRate,
    } = useCalculatorBcv();

    // ── Period dates ────────────────────────────────────────────────────────
    const todayStr = getTodayIsoDate();
    const [fechaInicio, setFechaInicio] = useState(todayStr);
    const [fechaEgreso, setFechaEgreso] = useState(todayStr);

    const [fechaCulminacion, setFechaCulminacion] = useState("");
    const [fechaReintegro,   setFechaReintegro]   = useState("");
    const [, setUserEditedCulm] = useState(false);
    const [userEditedReint, setUserEditedReint]   = useState(false);

    // ── Selected employee + salary sync ─────────────────────────────────────
    const selectedEmp = useMemo(
        () => employees.find(e => e.cedula === selectedCedula),
        [employees, selectedCedula],
    );

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

    // ── Batch processing ────────────────────────────────────────────────────
    const filtered = useMemo(() => {
        const pool = soloActivos ? employees.filter(e => e.estado === "activo") : employees;
        if (!selectedCedula) return pool;
        return pool.filter(e => e.cedula === selectedCedula);
    }, [employees, soloActivos, selectedCedula]);

    interface VacResult {
        emp:   Employee;
        calc:  VacCalc | VacFracCalc | null;
        dates?: { start: string; end: string; rest: string };
        msg?:  string;
    }

    const results = useMemo<VacResult[]>(() => {
        return filtered.map(emp => {
            const ves = emp.moneda === "USD" ? emp.salarioMensual * bcvRate : emp.salarioMensual;
            const ing = emp.fechaIngreso ?? "";

            if (mode === "completas") {
                const anios = calcAniosAt(ing, fechaInicio);
                const dL    = 15 + (anios >= 2 ? Math.min(anios - 1, 15) : 0);
                const culm  = calculateCulminacion(fechaInicio, dL);
                const reint = nextWorkingDay(culm);
                const c     = computeVac(ves, ing, fechaInicio, culm);
                return { emp, calc: c, dates: { start: fechaInicio, end: culm, rest: reint } };
            } else {
                const c = computeVacFrac(ves, ing, fechaEgreso);
                return { emp, calc: c };
            }
        });
    }, [filtered, mode, bcvRate, fechaInicio, fechaEgreso]);

    const totalGral = useMemo(() => results.reduce((acc, r) => acc + (r.calc?.total ?? 0), 0), [results]);

    // ── Date input handlers (preserve quirky compatibility states) ──────────
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

    // ── Export ──────────────────────────────────────────────────────────────
    const handleBatchExport = async () => {
        if (!company) return;
        try {
            setIsExporting(true);
            for (const r of results) {
                if (!r.calc) continue;
                if (mode === "completas" && r.dates) {
                    await generateVacComplletasPdf({
                        companyName: company.name,
                        employee:    { nombre: r.emp.nombre, cedula: r.emp.cedula, cargo: r.emp.cargo, anios: (r.calc as VacCalc).anios },
                        fechaInicio: r.dates.start, fechaCulminacion: r.dates.end, fechaReintegro: r.dates.rest,
                        salarioVES:  r.calc.salarioVES, salarioDia: r.calc.salarioDia,
                        diasCalendario: (r.calc as VacCalc).diasCalendario,
                        diasHabiles:    (r.calc as VacCalc).diasHabiles,
                        diasDescanso:   (r.calc as VacCalc).diasDescanso,
                        diasDisfrute:   (r.calc as VacCalc).diasDisfrute,
                        diasBono:       (r.calc as VacCalc).diasBono,
                        montoDisfrute:  r.calc.montoDisfrute,
                        montoBono:      r.calc.montoBono,
                        total:          r.calc.total,
                        logoUrl:       company.logoUrl,
                        showLogoInPdf: company.showLogoInPdf,
                    });
                } else if (mode === "fraccionadas") {
                    await generateVacFraccionadasPdf({
                        companyName: company.name,
                        employee:    { nombre: r.emp.nombre, cedula: r.emp.cedula, cargo: r.emp.cargo },
                        fechaIngreso: r.emp.fechaIngreso ?? "", fechaEgreso: fechaEgreso,
                        ultimoAniversario: (r.calc as VacFracCalc).ultimoAniversario,
                        aniosCompletos:    (r.calc as VacFracCalc).aniosCompletos,
                        mesesFraccion:     (r.calc as VacFracCalc).mesesFraccion,
                        diasAnuales:       (r.calc as VacFracCalc).diasAnuales,
                        salarioVES:        r.calc.salarioVES,
                        salarioDia:        r.calc.salarioDia,
                        fraccionDisfrute:  (r.calc as VacFracCalc).fraccionDisfrute,
                        fraccionBono:      (r.calc as VacFracCalc).fraccionBono,
                        montoDisfrute:     r.calc.montoDisfrute,
                        montoBono:         r.calc.montoBono,
                        total:             r.calc.total,
                        logoUrl:       company.logoUrl,
                        showLogoInPdf: company.showLogoInPdf,
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

    // ── Single-result helpers for the resumen panel ─────────────────────────
    const calcDisplay  = results.length === 1 ? results[0].calc  : null;
    const datesDisplay = results.length === 1 ? results[0].dates : null;

    // ── Render ──────────────────────────────────────────────────────────────
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
                    {bcvFetchError && <span className="w-1.5 h-1.5 rounded-full bg-red-400" title={bcvFetchError} />}
                </div>
            </PageHeader>

            <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
                {/* ══ LEFT PANEL ══════════════════════════════════════════════ */}
                <aside className="w-full lg:w-96 shrink-0 flex flex-col border-b lg:border-b-0 lg:border-r border-border-light bg-surface-1 overflow-y-auto">

                    <CalculatorPanelHeader />

                    {/* Mode toggle */}
                    <div className="px-5 py-5 border-b border-border-light">
                        <label className={LABEL_CLS}>Tipo de Vacaciones</label>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                            <button
                                type="button"
                                onClick={() => setMode("completas")}
                                className={[
                                    "flex items-center justify-center gap-2 h-9 rounded-lg border font-mono text-[11px] uppercase tracking-[0.1em] transition-all",
                                    mode === "completas"
                                        ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-700"
                                        : "bg-surface-1 border-border-light text-[var(--text-secondary)] hover:border-border-medium",
                                ].join(" ")}
                            >
                                <ClipboardCheck size={14} /> Completas
                            </button>
                            <button
                                type="button"
                                onClick={() => setMode("fraccionadas")}
                                className={[
                                    "flex items-center justify-center gap-2 h-9 rounded-lg border font-mono text-[11px] uppercase tracking-[0.1em] transition-all",
                                    mode === "fraccionadas"
                                        ? "bg-amber-500/10 border-amber-500/50 text-amber-700"
                                        : "bg-surface-1 border-border-light text-[var(--text-secondary)] hover:border-border-medium",
                                ].join(" ")}
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
                                    <EmployeeSelect
                                        employees={employees}
                                        selectedCedula={selectedCedula}
                                        onChange={setSelectedCedula}
                                        onlyActive={soloActivos}
                                    />
                                )}
                                {selectedEmp && <EmployeeInfoCard employee={selectedEmp} />}
                                <OnlyActiveToggle checked={soloActivos} onChange={setSoloActivos} />
                            </div>

                            {selectedCedula && (
                                <div className="pt-2">
                                    <BaseInput.Field
                                        label="Salario mensual (Bs.)"
                                        type="number"
                                        step={0.01}
                                        min={0}
                                        value={salarioOverride}
                                        onValueChange={setSalarioOverride}
                                        placeholder="0.00"
                                        prefix="Bs."
                                        inputClassName="text-right"
                                    />
                                </div>
                            )}
                            {!selectedEmp && selectedCedula && (
                                <BaseInput.Field
                                    label="Fecha de ingreso"
                                    type="date"
                                    value={manualIngreso}
                                    onValueChange={setManualIngreso}
                                    startContent={<Calendar size={14} className="text-[var(--text-tertiary)]" />}
                                />
                            )}
                        </div>

                        {/* ── Tasa BCV ──────────────────────────────────────── */}
                        <div className="px-5 py-4">
                            <BcvRateField
                                value={exchangeRate}
                                onChange={setExchangeRate}
                                onRefresh={fetchBcvRate}
                                loading={bcvLoading}
                                error={bcvFetchError}
                            />
                        </div>

                        {/* ── Fechas ─────────────────────────────────────────── */}
                        <div className="px-5 py-5 space-y-4">
                            {mode === "completas" ? (
                                <>
                                    <SectionHeader label="Fechas de Disfrute" />
                                    <BaseInput.Field
                                        label="Fecha Inicio"
                                        type="date"
                                        value={fechaInicio}
                                        onValueChange={handleInicioChange}
                                        startContent={<Calendar size={14} className="text-[var(--text-tertiary)]" />}
                                    />
                                    {selectedCedula && (
                                        <div className="grid grid-cols-2 gap-3">
                                            <BaseInput.Field
                                                label="Culminación"
                                                type="date"
                                                value={fechaCulminacion || (datesDisplay?.end ?? "")}
                                                onValueChange={handleCulminacionChange}
                                            />
                                            <BaseInput.Field
                                                label="Reintegro"
                                                type="date"
                                                value={fechaReintegro || (datesDisplay?.rest ?? "")}
                                                onValueChange={setFechaReintegro}
                                            />
                                        </div>
                                    )}
                                </>
                            ) : (
                                <>
                                    <SectionHeader label="Egreso" />
                                    <BaseInput.Field
                                        label="Fecha de Egreso"
                                        type="date"
                                        value={fechaEgreso}
                                        onValueChange={setFechaEgreso}
                                        startContent={<Calendar size={14} className="text-[var(--text-tertiary)]" />}
                                    />
                                </>
                            )}
                        </div>

                        {/* ── Resumen de Cálculo ───────────────────────────── */}
                        <div className="px-5 py-4">
                            <SectionHeader label="Resumen de cálculo" />
                            {mode === "completas" && calcDisplay ? (
                                <div className="rounded-xl border border-border-light bg-surface-2/30 overflow-hidden">
                                    <div className="px-4 py-3 space-y-1.5 border-b border-border-light/60">
                                        <SummaryRow label="Salario mensual" value={formatCurrency((calcDisplay as VacCalc).salarioVES)} />
                                        <SummaryRow label="Sal. diario"      value={formatNumber((calcDisplay as VacCalc).salarioDia) + " /día"} dim />
                                    </div>
                                    <div className="px-4 py-3 space-y-1.5 border-b border-border-light/60">
                                        <SummaryRow label="Días disfrute"    value={`${(calcDisplay as VacCalc).diasDisfrute} días`} />
                                        <SummaryRow label="Bono vacacional"  value={`${(calcDisplay as VacCalc).diasBono} días`} dim />
                                    </div>
                                    <div className="px-4 py-3.5 flex justify-between items-center bg-surface-1">
                                        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--text-secondary)]">Total a Pagar</span>
                                        <span className="font-mono text-[18px] font-black tabular-nums text-foreground">{formatCurrency((calcDisplay as VacCalc).total)}</span>
                                    </div>
                                </div>
                            ) : mode === "fraccionadas" && calcDisplay ? (
                                <div className="rounded-xl border border-border-light bg-surface-2/30 overflow-hidden">
                                    <div className="px-4 py-3 space-y-1.5 border-b border-border-light/60">
                                        <SummaryRow label="Salario mensual" value={formatCurrency((calcDisplay as VacFracCalc).salarioVES)} />
                                        <SummaryRow label="Sal. diario"      value={formatNumber((calcDisplay as VacFracCalc).salarioDia) + " /día"} dim />
                                    </div>
                                    <div className="px-4 py-3 space-y-1.5 border-b border-border-light/60">
                                        <SummaryRow label="Meses fracción" value={`${(calcDisplay as VacFracCalc).mesesFraccion} meses`} />
                                        <SummaryRow label="Días totales"   value={`${(calcDisplay as VacFracCalc).fraccionDisfrute + (calcDisplay as VacFracCalc).fraccionBono} días`} dim />
                                    </div>
                                    <div className="px-4 py-3.5 flex justify-between items-center bg-surface-1">
                                        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--text-secondary)]">Total Fracc.</span>
                                        <span className="font-mono text-[18px] font-black tabular-nums text-foreground">{formatCurrency((calcDisplay as VacFracCalc).total)}</span>
                                    </div>
                                </div>
                            ) : (
                                <p className="font-mono text-[11px] text-[var(--text-tertiary)] pt-2">
                                    Selecciona empleados para ver resumen.
                                </p>
                            )}
                        </div>
                    </div>

                    {/* ── Footer ──────────────────────────────────────────── */}
                    <CalculatorFooter
                        ctaLabel="Exportar Lote"
                        busy={isExporting}
                        disabled={results.length === 0}
                        onCta={handleBatchExport}
                    >
                        {results.length > 0 && (
                            <>
                                <FooterStat label="Empleados" value={String(results.length)} />
                                <FooterTotal label="Total Gral. (NETO)" valueBs={totalGral} bcvRate={bcvRate} tone="success" />
                            </>
                        )}
                    </CalculatorFooter>
                </aside>

                {/* ══ RIGHT PANEL ═════════════════════════════════════════════ */}
                <main className="flex-1 overflow-y-auto p-6 bg-surface-2">
                    {loading ? (
                        <CalculatorLoading label="Cargando empleados…" />
                    ) : results.length === 0 ? (
                        <CalculatorEmptyState
                            icon={ClipboardCheck}
                            title={mode === "completas" ? "Vacaciones Completas" : "Vacaciones Fraccionadas"}
                            description="Selecciona un empleado y un rango de fechas para previsualizar la constancia de vacaciones."
                        />
                    ) : (
                        <div className="max-w-2xl mx-auto space-y-8">
                            {results.map(r => {
                                if (r.msg || !r.calc) {
                                    return (
                                        <ConstanciaWarning
                                            key={r.emp.cedula}
                                            employeeName={r.emp.nombre}
                                            employeeCedula={r.emp.cedula}
                                            message={r.msg ?? "Error"}
                                        />
                                    );
                                }
                                if (mode === "completas") {
                                    return (
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
                                }
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

// ============================================================================
// SUMMARY ROW — page-local atom (only used by the resumen panel)
// ============================================================================

function SummaryRow({ label, value, dim }: { label: string; value: string; dim?: boolean }) {
    return (
        <div className="flex justify-between items-baseline">
            <span className={`font-mono text-[11px] ${dim ? "text-[var(--text-tertiary)]" : "text-[var(--text-secondary)]"}`}>
                {label}
            </span>
            <span className="font-mono text-[12px] font-semibold tabular-nums text-foreground">{value}</span>
        </div>
    );
}
