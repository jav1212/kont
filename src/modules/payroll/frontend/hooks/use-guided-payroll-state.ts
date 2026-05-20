"use client";

// Hook that owns the entire calculator state for the /payroll wizard.
// Single source of truth — the page and step components stay presentational.
//
// Behaviours:
//   - Hydrate row defs / alícuotas / cesta / PDF visibility from PayrollSettings
//     when settingsLoadedAt advances (handles A→B→A tenant switches, REQ-008)
//   - Auto-fill calendar earnings when period changes
//   - Fetch BCV rate once on mount, then only on manual refresh
//   - Filter "second-half" deductions when computing first quincena
//   - Cesta Ticket visible in 2ª quincena (quincenal) or last week (semanal)

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useEmployee } from "./use-employee";
import { usePayrollHistory } from "./use-payroll-history";
import { usePayrollSettings } from "./use-payroll-settings";
import { calculateWeeklyFactor } from "../utils/payroll-helper";
import {
    getQuincenaInfo,
    getWeekInfo,
    getMondaysOfMonth,
    type Quincena,
    type PeriodoMode,
} from "../utils/period-info";
import {
    makeEarningsFromDefs,
    extractEarningDefs,
    makeDeductionsFromDefs,
    makeBonusesFromDefs,
    makeHorasExtrasFromDefs,
    buildSettings,
} from "../utils/settings-builders";
import type {
    EarningRow,
    DeductionRow,
    BonusRow,
    HorasExtrasRow,
    EarningValue,
    DeductionValue,
    BonusValue,
} from "../types/payroll-types";
import type { PdfVisibility } from "../../backend/domain/payroll-settings";
import type { EmployeeResult } from "../components/payroll-employee-table";
import { getTodayIsoDate } from "@/src/shared/frontend/utils/local-date";
import { notify } from "@/src/shared/frontend/notify";

export type SaveMsg = { ok: boolean; text: string } | null;

export function useGuidedPayrollState() {
    const { companyId, company } = useCompany();
    const { employees: allEmployees, loading: empLoading } = useEmployee(companyId);
    const { confirm, saveDraft, runs } = usePayrollHistory(companyId);
    const {
        settings: savedSettings,
        loading: settingsLoading,
        loadedAt: settingsLoadedAt,
        save: saveSettings,
    } = usePayrollSettings(companyId);

    // ── Period ──────────────────────────────────────────────────────────────
    const now = new Date();
    const [selYear, setSelYear] = useState(now.getFullYear());
    const [selMonth, setSelMonth] = useState(now.getMonth() + 1);
    const [selQuincena, setSelQuincena] = useState<Quincena>(now.getDate() <= 15 ? 1 : 2);
    const [periodoMode, setPeriodoMode] = useState<PeriodoMode>("quincenal");

    const [selWeekMonday, setSelWeekMonday] = useState<string>(() => {
        const d = new Date();
        const diff = d.getDay() === 0 ? -6 : 1 - d.getDay();
        d.setDate(d.getDate() + diff);
        const pad = (n: number) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    });

    const quincenaInfo = useMemo(
        () => getQuincenaInfo(selYear, selMonth, selQuincena),
        [selYear, selMonth, selQuincena],
    );
    const mondaysOfMonth = useMemo(
        () => getMondaysOfMonth(selYear, selMonth),
        [selYear, selMonth],
    );
    const weekInfo = useMemo(() => getWeekInfo(selWeekMonday), [selWeekMonday]);

    useEffect(() => {
        if (periodoMode !== "semanal") return;
        const mondays = getMondaysOfMonth(selYear, selMonth);
        if (mondays.length > 0 && !mondays.includes(selWeekMonday)) {
            setSelWeekMonday(mondays[0]);
        }
    }, [selYear, selMonth, periodoMode, selWeekMonday]);

    const activePeriodInfo = periodoMode === "quincenal" ? quincenaInfo : weekInfo;

    // Filter employees by hire date: an employee whose fechaIngreso is after the
    // period end didn't exist yet for that payroll. Employees without fechaIngreso
    // (legacy rows) are kept to avoid breaking historical data.
    const periodEndIso = activePeriodInfo.endDate;
    const employees = useMemo(
        () => allEmployees.filter((e) => !e.fechaIngreso || e.fechaIngreso <= periodEndIso),
        [allEmployees, periodEndIso],
    );
    const employeesExcludedByDate = useMemo(
        () => allEmployees.filter((e) => e.fechaIngreso && e.fechaIngreso > periodEndIso),
        [allEmployees, periodEndIso],
    );

    const isLastWeekOfMonth =
        periodoMode === "semanal" &&
        mondaysOfMonth.length > 0 &&
        selWeekMonday === mondaysOfMonth[mondaysOfMonth.length - 1];

    // En modo semanal, tratamos como "segunda quincena" solo la última semana del mes.
    // Esto hace que F.A.O.V, INCES y demás retenciones "Solo 2da" se apliquen únicamente
    // en la última semana, y que INCES patronal (que depende de quincena === 2) también
    // se calcule una sola vez al mes.
    const activeQuincena: 1 | 2 =
        periodoMode === "semanal" ? (isLastWeekOfMonth ? 2 : 1) : selQuincena;

    // Default rule: monthly benefits (cesta ticket + bono socio-económico) ride
    // along with the 2nd quincena or the last week of the month. Per-payroll
    // overrides below let the user force-include or force-exclude when paid
    // outside the default period (e.g., 1st quincena by exception).
    const defaultBenefitsInPeriod =
        (periodoMode === "quincenal" && selQuincena === 2) || isLastWeekOfMonth;

    const [includeCestaTicketOverride, setIncludeCestaTicketOverride] =
        useState<boolean | null>(null);
    const [includeBonoSocioEconomicoOverride, setIncludeBonoSocioEconomicoOverride] =
        useState<boolean | null>(null);

    const showCestaTicket        = includeCestaTicketOverride        ?? defaultBenefitsInPeriod;
    const showBonoSocioEconomico = includeBonoSocioEconomicoOverride ?? defaultBenefitsInPeriod;

    // Per-employee opt-out for cesta ticket and bono socio económico. Empty set
    // = todos los activos reciben (comportamiento histórico). El usuario destilda
    // a quien no aplique. Vive solo en estado de calculadora, no se persiste.
    const [cestaTicketExcluded, setCestaTicketExcluded] = useState<Set<string>>(() => new Set());
    const [bonoGuerraExcluded,  setBonoGuerraExcluded]  = useState<Set<string>>(() => new Set());

    // Per-employee monto override para esta nómina. Mapa cedula → raw input
    // (string para no perder formato mientras se tipea). Si una cédula no está
    // en el mapa, usa el monto global. La moneda la dicta el selector global
    // (cestaTicketCurrency / bonoGuerraCurrency). Efímero: se resetea al
    // cambiar de período.
    const [cestaTicketOverrides, setCestaTicketOverrides] = useState<Map<string, string>>(() => new Map());
    const [bonoGuerraOverrides,  setBonoGuerraOverrides]  = useState<Map<string, string>>(() => new Map());

    const toggleCestaTicketRecipient = useCallback((cedula: string) => {
        setCestaTicketExcluded((s) => {
            const next = new Set(s);
            if (next.has(cedula)) next.delete(cedula); else next.add(cedula);
            return next;
        });
    }, []);
    const toggleBonoGuerraRecipient = useCallback((cedula: string) => {
        setBonoGuerraExcluded((s) => {
            const next = new Set(s);
            if (next.has(cedula)) next.delete(cedula); else next.add(cedula);
            return next;
        });
    }, []);

    const setCestaTicketOverride = useCallback((cedula: string, raw: string) => {
        setCestaTicketOverrides((m) => {
            const next = new Map(m);
            if (raw === "") next.delete(cedula); else next.set(cedula, raw);
            return next;
        });
    }, []);
    const setBonoGuerraOverride = useCallback((cedula: string, raw: string) => {
        setBonoGuerraOverrides((m) => {
            const next = new Map(m);
            if (raw === "") next.delete(cedula); else next.set(cedula, raw);
            return next;
        });
    }, []);

    // Reset overrides whenever the period selection changes — overrides are
    // tied to "this payroll", so a new period means a fresh decision.
    useEffect(() => {
        setIncludeCestaTicketOverride(null);
        setIncludeBonoSocioEconomicoOverride(null);
        setCestaTicketExcluded(new Set());
        setBonoGuerraExcluded(new Set());
        setCestaTicketOverrides(new Map());
        setBonoGuerraOverrides(new Map());
    }, [periodoMode, selYear, selMonth, selQuincena, selWeekMonday]);

    // ── Reference salary + BCV ─────────────────────────────────────────────
    const [exchangeRate, setExchangeRate] = useState("79.59");
    const [monthlySalary, setMonthlySalary] = useState("130.00");
    const [bcvDate, setBcvDate] = useState(() => getTodayIsoDate());
    const [bcvLoading, setBcvLoading] = useState(false);
    const [bcvFetchError, setBcvFetchError] = useState<string | null>(null);

    const fetchBcvRate = useCallback(async () => {
        setBcvLoading(true);
        setBcvFetchError(null);
        try {
            const res = await fetch(`/api/bcv/rate?date=${bcvDate}`);
            const data = await res.json();
            if (!res.ok) {
                setBcvFetchError(data.error ?? "Error al consultar.");
                return;
            }
            setExchangeRate(String(data.rate));
        } catch {
            setBcvFetchError("No se pudo conectar con la API BCV.");
        } finally {
            setBcvLoading(false);
        }
    }, [bcvDate]);

    // ── Row lists ───────────────────────────────────────────────────────────
    const [earningRows, setEarningRows] = useState<EarningRow[]>(() =>
        makeEarningsFromDefs(
            savedSettings.earningRowDefs,
            quincenaInfo.weekdays,
            quincenaInfo.saturdays,
            quincenaInfo.sundays,
            quincenaInfo.holidays,
        ),
    );
    const [deductionRows, setDeductionRows] = useState<DeductionRow[]>(() =>
        makeDeductionsFromDefs(savedSettings.deductionRowDefs),
    );
    const [bonusRows, setBonusRows] = useState<BonusRow[]>(() =>
        makeBonusesFromDefs(savedSettings.bonusRowDefs),
    );

    const [diasUtilidades, setDiasUtilidades] = useState(String(savedSettings.diasUtilidades));
    const [diasBonoVacacional, setDiasBonoVacacional] = useState(
        String(savedSettings.diasBonoVacacional),
    );
    const [salaryMode, setSalaryMode] = useState<"mensual" | "integral">(savedSettings.salaryMode);
    const [cestaTicketUSD, setCestaTicketUSD] = useState(String(savedSettings.cestaTicketUSD));
    const [bonoGuerraUSD, setBonoGuerraUSD]   = useState(String(savedSettings.bonoGuerraUSD));
    // Moneda activa del input "Monto por empleado". Si es "VES" el número
    // anterior se interpreta como bolívares y el USD se deriva con la tasa BCV
    // al construir el payload. El nombre del state se mantiene como *USD por
    // retrocompatibilidad con el resto del hook.
    const [cestaTicketCurrency, setCestaTicketCurrency] =
        useState<"USD" | "VES">(savedSettings.cestaTicketCurrency);
    const [bonoGuerraCurrency,  setBonoGuerraCurrency]  =
        useState<"USD" | "VES">(savedSettings.bonoGuerraCurrency);

    const [horasExtrasGlobal, setHorasExtrasGlobal] = useState<HorasExtrasRow[]>(() =>
        makeHorasExtrasFromDefs(savedSettings.horasExtrasGlobalRows),
    );
    const updateHorasExtrasGlobal = useCallback(
        (id: string, u: HorasExtrasRow) =>
            setHorasExtrasGlobal((rs) => rs.map((r) => (r.id === id ? u : r))),
        [],
    );

    const [salarioMinimoInput, setSalarioMinimoInput] = useState(
        savedSettings.salarioMinimoRef > 0 ? String(savedSettings.salarioMinimoRef) : "",
    );

    const [pdfVisibility, setPdfVisibility] = useState<PdfVisibility>(savedSettings.pdfVisibility);

    // ── Save settings UI state ──────────────────────────────────────────────
    const [saveLoading, setSaveLoading] = useState(false);
    const [saveMsg, setSaveMsg] = useState<SaveMsg>(null);

    // ── Re-apply saved settings when company / tenant changes ───────────────
    const appliedLoadRef = useRef(0);
    useEffect(() => {
        if (settingsLoading) return;
        if (settingsLoadedAt === 0) return;
        if (settingsLoadedAt === appliedLoadRef.current) return;
        appliedLoadRef.current = settingsLoadedAt;

        setDiasUtilidades(String(savedSettings.diasUtilidades));
        setDiasBonoVacacional(String(savedSettings.diasBonoVacacional));
        setSalaryMode(savedSettings.salaryMode);
        setCestaTicketUSD(String(savedSettings.cestaTicketUSD));
        setBonoGuerraUSD(String(savedSettings.bonoGuerraUSD));
        setCestaTicketCurrency(savedSettings.cestaTicketCurrency);
        setBonoGuerraCurrency(savedSettings.bonoGuerraCurrency);
        setSalarioMinimoInput(
            savedSettings.salarioMinimoRef > 0 ? String(savedSettings.salarioMinimoRef) : "",
        );
        setHorasExtrasGlobal(makeHorasExtrasFromDefs(savedSettings.horasExtrasGlobalRows));
        setPdfVisibility(savedSettings.pdfVisibility);
        setDeductionRows(makeDeductionsFromDefs(savedSettings.deductionRowDefs));
        setBonusRows(makeBonusesFromDefs(savedSettings.bonusRowDefs));
        setEarningRows(
            makeEarningsFromDefs(
                savedSettings.earningRowDefs,
                activePeriodInfo.weekdays,
                activePeriodInfo.saturdays,
                activePeriodInfo.sundays,
                activePeriodInfo.holidays,
            ),
        );
    }, [settingsLoadedAt, settingsLoading, savedSettings, activePeriodInfo]);

    // ── Auto-fill calendar earnings when period changes ─────────────────────
    const earningRowsRef = useRef(earningRows);
    earningRowsRef.current = earningRows;

    const handleAutoFill = useCallback(() => {
        setEarningRows(
            makeEarningsFromDefs(
                extractEarningDefs(earningRowsRef.current),
                activePeriodInfo.weekdays,
                activePeriodInfo.saturdays,
                activePeriodInfo.sundays,
                activePeriodInfo.holidays,
            ),
        );
    }, [activePeriodInfo]);
    useEffect(() => {
        handleAutoFill();
    }, [handleAutoFill]);

    // ── Fetch BCV rate once on mount ────────────────────────────────────────
    const didInitialBcvFetch = useRef(false);
    useEffect(() => {
        if (didInitialBcvFetch.current) return;
        didInitialBcvFetch.current = true;
        void fetchBcvRate();
    }, [fetchBcvRate]);

    // ── Save settings handler ───────────────────────────────────────────────
    const handleSaveSettings = useCallback(async () => {
        if (!companyId) return;
        setSaveLoading(true);
        setSaveMsg(null);
        const diasUtilNum = Math.max(0, parseFloat(diasUtilidades) || 15);
        const diasBonoNum = Math.max(0, parseFloat(diasBonoVacacional) || 15);
        const err = await saveSettings(
            buildSettings(
                earningRows,
                deductionRows,
                bonusRows,
                diasUtilNum,
                diasBonoNum,
                salaryMode,
                parseFloat(cestaTicketUSD) || 40,
                parseFloat(bonoGuerraUSD) || 200,
                cestaTicketCurrency,
                bonoGuerraCurrency,
                Math.max(0, parseFloat(salarioMinimoInput) || 0),
                horasExtrasGlobal,
                pdfVisibility,
            ),
        );
        setSaveLoading(false);
        setSaveMsg(err ? { ok: false, text: err } : { ok: true, text: "Configuración guardada" });
        setTimeout(() => setSaveMsg(null), 3000);
    }, [
        companyId,
        earningRows,
        deductionRows,
        bonusRows,
        diasUtilidades,
        diasBonoVacacional,
        salaryMode,
        cestaTicketUSD,
        bonoGuerraUSD,
        cestaTicketCurrency,
        bonoGuerraCurrency,
        salarioMinimoInput,
        horasExtrasGlobal,
        pdfVisibility,
        saveSettings,
    ]);

    // ── Derived ─────────────────────────────────────────────────────────────
    const mondaysInMonth = activePeriodInfo.mondays;
    const dailyRate = useMemo(() => (parseFloat(monthlySalary) || 0) / 30, [monthlySalary]);
    const weeklyRate = useMemo(
        () => calculateWeeklyFactor(parseFloat(monthlySalary) || 0),
        [monthlySalary],
    );
    const bcvRate = useMemo(() => parseFloat(exchangeRate) || 0, [exchangeRate]);
    const weeklyBase = useMemo(() => weeklyRate * mondaysInMonth, [weeklyRate, mondaysInMonth]);
    const salarioMinimo = useMemo(
        () => Math.max(0, parseFloat(salarioMinimoInput) || 0),
        [salarioMinimoInput],
    );
    const cappedWeeklyBase = useMemo(
        () => (salarioMinimo > 0 ? Math.min(weeklyBase, 10 * salarioMinimo) : weeklyBase),
        [weeklyBase, salarioMinimo],
    );

    const diasUtilNum = useMemo(
        () => Math.max(0, parseFloat(diasUtilidades) || 15),
        [diasUtilidades],
    );
    const diasBonoNum = useMemo(
        () => Math.max(0, parseFloat(diasBonoVacacional) || 15),
        [diasBonoVacacional],
    );
    const refSalary = useMemo(() => parseFloat(monthlySalary) || 0, [monthlySalary]);
    const alicuotaUtil = useMemo(
        () => (refSalary / 30) * (diasUtilNum / 360),
        [refSalary, diasUtilNum],
    );
    const alicuotaBono = useMemo(
        () => (refSalary / 30) * (diasBonoNum / 360),
        [refSalary, diasBonoNum],
    );
    const integralBase = useMemo(
        () => refSalary + alicuotaUtil + alicuotaBono,
        [refSalary, alicuotaUtil, alicuotaBono],
    );

    const earningValues = useMemo<EarningValue[]>(
        () =>
            earningRows.map((r) => ({
                ...r,
                computed: r.useDaily
                    ? (parseFloat(r.quantity) || 0) * dailyRate * (parseFloat(r.multiplier) || 1)
                    : parseFloat(r.quantity) || 0,
            })),
        [earningRows, dailyRate],
    );

    const deductionValues = useMemo<DeductionValue[]>(
        () =>
            deductionRows
                .filter((r) => !(r.quincenaRule === "second-half" && activeQuincena === 1))
                .map((r) => {
                    if (r.mode === "fixed") return { ...r, computed: parseFloat(r.rate) || 0 };
                    const base =
                        r.base === "weekly-capped"
                            ? cappedWeeklyBase
                            : r.base === "weekly"
                                ? weeklyBase
                                : r.base === "integral"
                                    ? integralBase
                                    : refSalary;
                    return { ...r, computed: base * ((parseFloat(r.rate) || 0) / 100) };
                }),
        [deductionRows, activeQuincena, weeklyBase, cappedWeeklyBase, integralBase, refSalary],
    );

    const bonusValues = useMemo<BonusValue[]>(
        () =>
            bonusRows.map((r) => {
                const raw = parseFloat(r.amount) || 0;
                return {
                    ...r,
                    computed: r.currency === "VES" ? raw : raw * bcvRate,
                };
            }),
        [bonusRows, bcvRate],
    );

    const totalEarnings = useMemo(
        () => earningValues.reduce((s, r) => s + r.computed, 0),
        [earningValues],
    );
    const totalDeductions = useMemo(
        () => deductionValues.reduce((s, r) => s + r.computed, 0),
        [deductionValues],
    );
    const totalBonuses = useMemo(
        () => bonusValues.reduce((s, r) => s + r.computed, 0),
        [bonusValues],
    );

    // ── Row mutators ────────────────────────────────────────────────────────
    const updateEarning = useCallback(
        (id: string, u: EarningRow) =>
            setEarningRows((rs) => rs.map((r) => (r.id === id ? u : r))),
        [],
    );
    const removeEarning = useCallback(
        (id: string) => setEarningRows((rs) => rs.filter((r) => r.id !== id)),
        [],
    );
    const addEarning = useCallback(
        (b: EarningRow) => setEarningRows((rs) => [...rs, b]),
        [],
    );
    const updateDeduction = useCallback(
        (id: string, u: DeductionRow) =>
            setDeductionRows((rs) => rs.map((r) => (r.id === id ? u : r))),
        [],
    );
    const removeDeduction = useCallback(
        (id: string) => setDeductionRows((rs) => rs.filter((r) => r.id !== id)),
        [],
    );
    const addDeduction = useCallback(
        (b: DeductionRow) => setDeductionRows((rs) => [...rs, b]),
        [],
    );
    const updateBonus = useCallback(
        (id: string, u: BonusRow) =>
            setBonusRows((rs) => rs.map((r) => (r.id === id ? u : r))),
        [],
    );
    const removeBonus = useCallback(
        (id: string) => setBonusRows((rs) => rs.filter((r) => r.id !== id)),
        [],
    );
    const addBonus = useCallback(
        (b: BonusRow) => setBonusRows((rs) => [...rs, b]),
        [],
    );

    // ── Duplicate confirmed period guard ────────────────────────────────────
    const periodAlreadyConfirmed = useMemo(
        () =>
            runs.some(
                (r) =>
                    r.companyId === companyId &&
                    r.periodStart === activePeriodInfo.startDate &&
                    r.periodEnd === activePeriodInfo.endDate &&
                    r.status === "confirmed",
            ),
        [runs, companyId, activePeriodInfo],
    );

    // ── Persistence: confirm / draft ────────────────────────────────────────
    const buildPayload = useCallback(
        (results: EmployeeResult[]) => {
            if (!companyId) return null;
            return {
                run: {
                    companyId,
                    periodStart: activePeriodInfo.startDate,
                    periodEnd: activePeriodInfo.endDate,
                    exchangeRate: bcvRate,
                },
                receipts: results.map((r) => ({
                    companyId,
                    employeeId: r.cedula,
                    employeeCedula: r.cedula,
                    employeeNombre: r.nombre,
                    employeeCargo: r.cargo,
                    monthlySalary: r.salarioMensual,
                    totalEarnings: r.totalEarnings,
                    totalDeductions: r.totalDeductions,
                    totalBonuses: r.totalBonuses,
                    netPay: r.net,
                    calculationData: {
                        gross: r.gross,
                        netUsd: r.netUSD,
                        mondaysInMonth,
                        diasUtilidades: diasUtilNum,
                        diasBonoVacacional: diasBonoNum,
                        alicuotaUtil: r.alicuotaUtil,
                        alicuotaBono: r.alicuotaBono,
                        salarioIntegral: r.salarioIntegral,
                        earningLines:   r.earningLines,
                        bonusLines:     r.bonusLines,
                        deductionLines: r.deductionLines,
                    },
                })),
            };
        },
        [companyId, activePeriodInfo, bcvRate, mondaysInMonth, diasUtilNum, diasBonoNum],
    );

    const handleConfirm = useCallback(
        async (results: EmployeeResult[]): Promise<boolean> => {
            const payload = buildPayload(results);
            if (!payload) { notify.error("No hay empresa seleccionada"); return false; }
            return confirm(payload);
        },
        [buildPayload, confirm],
    );

    const handleSaveDraft = useCallback(
        async (
            results: EmployeeResult[],
        ): Promise<{ runId: string | null }> => {
            const payload = buildPayload(results);
            if (!payload) { notify.error("No hay empresa seleccionada"); return { runId: null }; }
            return saveDraft(payload);
        },
        [buildPayload, saveDraft],
    );

    return {
        // Tenancy / data
        companyId,
        company,
        employees,
        employeesExcludedByDate,
        empLoading,
        runs,

        // Settings persistence
        settingsLoading,
        saveLoading,
        saveMsg,
        handleSaveSettings,

        // Period
        periodoMode,
        setPeriodoMode,
        selYear,
        setSelYear,
        selMonth,
        setSelMonth,
        selQuincena,
        setSelQuincena,
        selWeekMonday,
        setSelWeekMonday,
        mondaysOfMonth,
        quincenaInfo,
        weekInfo,
        activePeriodInfo,
        activeQuincena,
        isLastWeekOfMonth,
        defaultBenefitsInPeriod,
        showCestaTicket,
        showBonoSocioEconomico,
        includeCestaTicketOverride,
        setIncludeCestaTicketOverride,
        includeBonoSocioEconomicoOverride,
        setIncludeBonoSocioEconomicoOverride,
        mondaysInMonth,

        // BCV
        exchangeRate,
        setExchangeRate,
        bcvDate,
        setBcvDate,
        bcvLoading,
        bcvFetchError,
        fetchBcvRate,
        bcvRate,

        // Reference salary
        monthlySalary,
        setMonthlySalary,
        dailyRate,
        weeklyRate,
        weeklyBase,

        // Salario mínimo
        salarioMinimoInput,
        setSalarioMinimoInput,
        salarioMinimo,
        cappedWeeklyBase,

        // Alícuotas / salary mode
        diasUtilidades,
        setDiasUtilidades,
        diasBonoVacacional,
        setDiasBonoVacacional,
        diasUtilNum,
        diasBonoNum,
        salaryMode,
        setSalaryMode,
        refSalary,
        alicuotaUtil,
        alicuotaBono,
        integralBase,

        // Cesta ticket
        cestaTicketUSD,
        setCestaTicketUSD,
        cestaTicketCurrency,
        setCestaTicketCurrency,
        cestaTicketExcluded,
        toggleCestaTicketRecipient,
        setCestaTicketExcluded,
        cestaTicketOverrides,
        setCestaTicketOverride,
        setCestaTicketOverrides,

        // Bono Socio Económico de Ayuda Alimenticia (Art. 105 LOTTT — beneficio social no remunerativo)
        bonoGuerraUSD,
        setBonoGuerraUSD,
        bonoGuerraCurrency,
        setBonoGuerraCurrency,
        bonoGuerraExcluded,
        toggleBonoGuerraRecipient,
        setBonoGuerraExcluded,
        bonoGuerraOverrides,
        setBonoGuerraOverride,
        setBonoGuerraOverrides,

        // PDF visibility
        pdfVisibility,
        setPdfVisibility,

        // Earnings
        earningRows,
        addEarning,
        updateEarning,
        removeEarning,
        earningValues,
        totalEarnings,

        // Deductions
        deductionRows,
        addDeduction,
        updateDeduction,
        removeDeduction,
        deductionValues,
        totalDeductions,

        // Bonuses
        bonusRows,
        addBonus,
        updateBonus,
        removeBonus,
        bonusValues,
        totalBonuses,

        // Horas extras
        horasExtrasGlobal,
        updateHorasExtrasGlobal,

        // Confirm / draft
        handleConfirm,
        handleSaveDraft,
        periodAlreadyConfirmed,
    };
}

export type GuidedPayrollState = ReturnType<typeof useGuidedPayrollState>;
