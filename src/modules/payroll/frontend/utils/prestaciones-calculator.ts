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
