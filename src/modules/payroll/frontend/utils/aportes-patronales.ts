// ============================================================================
// APORTES PATRONALES — cómputo y CSV
// Venezuela: IVSS patronal 9%, BANAVIH 2%, INCES 2% (+obrero 0.5%)
// ============================================================================

export interface AporteRow {
    cedula:         string;
    nombre:         string;
    cargo:          string;
    salarioVES:     number;  // base mensual en VES
    baseSso:        number;  // min(weeklyBase, 10×salMin)
    ssoPatronal:    number;  // 9% base semanal (semanas del período)
    faovPatronal:   number;  // 2% salario mensual
    incesPatronal:  number;  // 2% sobre total devengado en el período
    total:          number;
}

interface ComputeOpts {
    mondaysInMonth: number;
    salarioMinimo:  number;  // 0 = sin tope
}

/** Computes employer contributions for a single employee. */
export function computeAportes(
    emp: { salarioVES: number; gross: number; cedula: string; nombre: string; cargo: string },
    opts: ComputeOpts,
): AporteRow {
    const { mondaysInMonth, salarioMinimo } = opts;

    const weeklyRate  = (emp.salarioVES * 12) / 52;
    const weeklyBase  = weeklyRate * mondaysInMonth;
    const baseSso     = salarioMinimo > 0 ? Math.min(weeklyBase, 10 * salarioMinimo) : weeklyBase;

    const ssoPatronal   = baseSso * 0.09;          // IVSS Art. 104 (9%)
    const faovPatronal  = emp.salarioVES * 0.02;   // BANAVIH (2% mensual)
    const incesPatronal = emp.gross * 0.02;         // INCES patronal (2% sobre devengado)

    const total = ssoPatronal + faovPatronal + incesPatronal;

    return {
        cedula: emp.cedula, nombre: emp.nombre, cargo: emp.cargo,
        salarioVES: emp.salarioVES, baseSso,
        ssoPatronal, faovPatronal, incesPatronal, total,
    };
}

/** Generates CSV string of patronal contributions. */
export function aportesToCsv(rows: AporteRow[], meta: { companyName: string; periodLabel: string }): string {
    const fmt = (n: number) => n.toFixed(2).replace(".", ",");
    const header = [
        "Cédula", "Nombre", "Cargo", "Salario Mensual (Bs)", "Base SSO (Bs)",
        "SSO Patronal 9% (Bs)", "FAOV Patronal 2% (Bs)", "INCES Patronal 2% (Bs)", "Total Aportes (Bs)",
    ].join(";");

    const dataRows = rows.map((r) => [
        r.cedula, r.nombre, r.cargo,
        fmt(r.salarioVES), fmt(r.baseSso),
        fmt(r.ssoPatronal), fmt(r.faovPatronal), fmt(r.incesPatronal), fmt(r.total),
    ].join(";"));

    const totals = rows.reduce(
        (s, r) => ({ sso: s.sso + r.ssoPatronal, faov: s.faov + r.faovPatronal, inces: s.inces + r.incesPatronal, total: s.total + r.total }),
        { sso: 0, faov: 0, inces: 0, total: 0 },
    );
    const totalRow = ["TOTAL", "", "", "", "", fmt(totals.sso), fmt(totals.faov), fmt(totals.inces), fmt(totals.total)].join(";");

    const lines = [
        `# Aportes Patronales — ${meta.companyName} — ${meta.periodLabel}`,
        header,
        ...dataRows,
        totalRow,
    ];
    return lines.join("\n");
}

export function downloadAportesCsv(rows: AporteRow[], meta: { companyName: string; periodLabel: string }) {
    const csv  = aportesToCsv(rows, meta);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }); // BOM for Excel
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `aportes_patronales_${meta.periodLabel.replace(/\s+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}
