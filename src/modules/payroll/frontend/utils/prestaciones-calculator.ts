// ============================================================================
// SOCIAL BENEFITS (PRESTACIONES) CALCULATOR — Art. 142 LOTTT
// Computes the accumulated social benefits balance, projected profit sharing,
// and earned vacation days per employee, all offline.
// ============================================================================

export interface SocialBenefitsSummary {
    // Seniority
    hireDate:            string;
    cutoffDate:          string;
    totalDays:           number;
    yearsOfService:      number;
    completeMonths:      number;

    // Social Benefits (Art. 142)
    quarterlyDays:       number;   // 5 days/month accumulated
    extraDays:           number;   // 2 days/year from year 2
    totalSeniorityDays:  number;
    integratedDailySalary: number;
    seniorityIndemnityBalance: number;   // totalSeniorityDays × integratedDailySalary

    // Vacations (Art. 190-196 LOTTT)
    baseVacationDays:    number;   // 15 + 1 per year from year 2
    earnedVacationDays:  number;   // proportional to current period
    vacationAmount:      number;

    // Vacation Bonus
    baseVacationBonusDays: number;
    earnedVacationBonusDays: number;
    vacationBonusAmount: number;

    // Profit Sharing (Art. 131 LOTTT)
    profitSharingDays:   number;
    annualProfitSharing: number;   // full year projection
    fractionalProfitSharing: number; // fractional part of current year

    // Estimated grand total (seniority + vac + bonus + fractional profit sharing)
    estimatedTotal:      number;
}

interface SocialBenefitsOptions {
    salaryVES:         number;
    hireDate:          string;   // YYYY-MM-DD
    cutoffDate:        string;   // YYYY-MM-DD
    profitSharingDays: number;   // e.g. 15-120 days
    vacationBonusDays: number;   // base e.g. 15
}

export function calculateSocialBenefits(options: SocialBenefitsOptions): SocialBenefitsSummary | null {
    const { salaryVES, hireDate, cutoffDate, profitSharingDays, vacationBonusDays } = options;
    if (!hireDate || salaryVES <= 0) return null;

    const hire = new Date(hireDate + "T00:00:00");
    const cut  = new Date(cutoffDate + "T00:00:00");
    if (cut <= hire) return null;

    const msPerDay    = 86400000;
    const totalDays   = Math.floor((cut.getTime() - hire.getTime()) / msPerDay);
    const yearsOfService = Math.floor(totalDays / 365);
    const completeMonths = Math.floor(totalDays / 30.4375);

    // ── Integrated daily salary (360-day commercial year practice in Venezuela) ──
    const baseDailySalary = salaryVES / 30;
    const profitSharingQuota = baseDailySalary * profitSharingDays / 360;
    const vacationBonusQuota = baseDailySalary * vacationBonusDays / 360;
    const integratedDailySalary = baseDailySalary + profitSharingQuota + vacationBonusQuota;

    // ── Social Benefits (Art. 142) ───────────────────────────────────────────
    // Quarterly: 5 days/month accumulated from start
    const quarterlyDays = completeMonths * 5;

    // Extra: annual deposit grows 2 days per year of service (cumulative).
    const daysOfLastYear = totalDays % 365;
    const fullExtraDays  = yearsOfService <= 16
        ? yearsOfService * Math.max(0, yearsOfService - 1)
        : 240 + 30 * (yearsOfService - 16);
    const extraDays = fullExtraDays
        + (yearsOfService >= 1 && daysOfLastYear > 182 ? Math.min(30, 2 * yearsOfService) : 0);
    const totalSeniorityDays      = quarterlyDays + extraDays;
    const seniorityIndemnityBalance = totalSeniorityDays * integratedDailySalary;

    // ── Vacations (Art. 190-196) ─────────────────────────────────────────────
    const baseVacationDays = Math.min(30, 15 + Math.max(0, yearsOfService - 1));
    const daysSinceAnniv   = yearsOfService >= 1 ? daysOfLastYear : totalDays;
    const earnedVacationDays = baseVacationDays * (daysSinceAnniv / 365);
    const vacationAmount     = (salaryVES / 30) * earnedVacationDays;

    // ── Vacation Bonus ───────────────────────────────────────────────────────
    const baseVacationBonusDays = Math.min(30, vacationBonusDays + Math.max(0, yearsOfService - 1));
    const earnedVacationBonusDays = baseVacationBonusDays * (daysSinceAnniv / 365);
    const vacationBonusAmount     = (salaryVES / 30) * earnedVacationBonusDays;

    // ── Profit Sharing (Art. 131) ────────────────────────────────────────────
    const annualProfitSharing = (salaryVES / 30) * profitSharingDays;
    const yearStart           = new Date(cut.getFullYear(), 0, 1);
    const refStartDate        = hire > yearStart ? hire : yearStart;
    const daysInCurrentYear   = Math.floor((cut.getTime() - refStartDate.getTime()) / msPerDay);
    const fractionalProfitSharing = (salaryVES / 30) * profitSharingDays * (daysInCurrentYear / 365);

    const estimatedTotal = seniorityIndemnityBalance + vacationAmount + vacationBonusAmount + fractionalProfitSharing;

    return {
        hireDate, cutoffDate, totalDays, yearsOfService, completeMonths,
        quarterlyDays, extraDays, totalSeniorityDays,
        integratedDailySalary, seniorityIndemnityBalance,
        baseVacationDays, earnedVacationDays, vacationAmount,
        baseVacationBonusDays, earnedVacationBonusDays, vacationBonusAmount,
        profitSharingDays, annualProfitSharing, fractionalProfitSharing,
        estimatedTotal,
    };
}

// ── Annual advance (Art. 142.a/142.b + Art. 144 LOTTT) ──────────────────────
// Many employers settle seniority once a year instead of keeping a running
// guarantee balance: they pay a fixed number of days (commonly 45 = 75% of the
// 60 days of Art. 142.a) plus that year's Art. 142.b additional days, all at
// the current integrated salary and without trust interest. Prior years are
// already settled, so only the calendar year of the cutoff date is computed.

export interface AnnualSeniorityAdvance {
    periodStart:           string;   // YYYY-MM-DD, Jan 1 or the hire date
    periodMonths:          number;   // complete months worked in the period (0-12)
    configuredDays:        number;   // days for a full year, as entered
    seniorityDays:         number;   // configuredDays prorated by periodMonths
    extraDays:             number;   // Art. 142.b days earned at the last anniversary
    totalDays:             number;
    seniorityAmount:       number;
    extraAmount:           number;
    totalAmount:           number;
}

interface AnnualSeniorityAdvanceOptions {
    hireDate:              string;   // YYYY-MM-DD
    cutoffDate:            string;   // YYYY-MM-DD
    yearsOfService:        number;   // completed years at the cutoff date
    integratedDailySalary: number;
    annualDays:            number;   // e.g. 45
}

function toIsoDate(date: Date): string {
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${m}-${d}`;
}

export function calculateAnnualSeniorityAdvance(options: AnnualSeniorityAdvanceOptions): AnnualSeniorityAdvance {
    const { hireDate, cutoffDate, yearsOfService, integratedDailySalary, annualDays } = options;

    const hire      = new Date(hireDate + "T00:00:00");
    const cut       = new Date(cutoffDate + "T00:00:00");
    const yearStart = new Date(cut.getFullYear(), 0, 1);
    const start     = hire > yearStart ? hire : yearStart;

    // Calendar months between the period start and the day after the cutoff, so
    // Jan 1 → Dec 31 counts as exactly 12 months.
    const end = new Date(cut.getFullYear(), cut.getMonth(), cut.getDate() + 1);
    const rawMonths = (end.getFullYear() - start.getFullYear()) * 12
        + (end.getMonth() - start.getMonth())
        - (end.getDate() < start.getDate() ? 1 : 0);
    const periodMonths = Math.min(12, Math.max(0, rawMonths));

    const seniorityDays = annualDays * periodMonths / 12;
    // Same progression as the accumulated calculation: year N of service earns
    // 2 × (N − 1) additional days, capped at 30.
    const extraDays     = Math.min(30, 2 * Math.max(0, yearsOfService - 1));
    const totalDays     = seniorityDays + extraDays;

    const seniorityAmount = seniorityDays * integratedDailySalary;
    const extraAmount     = extraDays * integratedDailySalary;

    return {
        periodStart: toIsoDate(start),
        periodMonths,
        configuredDays: annualDays,
        seniorityDays,
        extraDays,
        totalDays,
        seniorityAmount,
        extraAmount,
        totalAmount: seniorityAmount + extraAmount,
    };
}

// ── CSV Export ────────────────────────────────────────────────────────────────

interface SocialBenefitsExportRow {
    name:     string;
    idNumber: string;
    role:     string;
    summary:  SocialBenefitsSummary;
}

export function socialBenefitsToCsv(rows: SocialBenefitsExportRow[], cutoffDate: string): string {
    const fmt = (n: number) => n.toFixed(2).replace(".", ",");
    const header = [
        "Nombre","Cédula","Cargo","Fecha Ingreso","Antigüedad (años)","Meses",
        "Días Trimestr.","Días Adic.","Días Total",
        "Sal. Integral Diario","Saldo Prestaciones",
        "Días Vac. Ganados","Monto Vacaciones",
        "Días Bono Ganados","Monto Bono Vac.",
        "Días Util.","Util. Anuales","Util. Fracc.",
        "Total Estimado",
    ].join(";");

    const dataRows = rows.map(({ name, idNumber, role, summary: s }) => [
        name, idNumber, role, s.hireDate, s.yearsOfService, s.completeMonths,
        s.quarterlyDays, s.extraDays, s.totalSeniorityDays,
        fmt(s.integratedDailySalary), fmt(s.seniorityIndemnityBalance),
        fmt(s.earnedVacationDays), fmt(s.vacationAmount),
        fmt(s.earnedVacationBonusDays), fmt(s.vacationBonusAmount),
        s.profitSharingDays, fmt(s.annualProfitSharing), fmt(s.fractionalProfitSharing),
        fmt(s.estimatedTotal),
    ].join(";"));

    return [
        `# Prestaciones Sociales al ${cutoffDate}`,
        header,
        ...dataRows,
    ].join("\n");
}

export function downloadSocialBenefitsCsv(rows: SocialBenefitsExportRow[], cutoffDate: string) {
    const csv  = socialBenefitsToCsv(rows, cutoffDate);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `prestaciones_${cutoffDate.replaceAll("-", "")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}
