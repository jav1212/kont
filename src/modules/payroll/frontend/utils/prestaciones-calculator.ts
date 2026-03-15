// ============================================================================
// PRESTACIONES SOCIALES CALCULATOR — Art. 142 LOTTT
// Computa el balance acumulado de prestaciones, utilidades proyectadas
// y días de vacaciones ganados por empleado, todo de forma offline.
// ============================================================================

export interface PrestacionesResumen {
    // Antigüedad
    fechaIngreso:        string;
    fechaCorte:          string;
    totalDias:           number;
    anios:               number;
    mesesCompletos:      number;

    // Prestaciones (Art. 142)
    diasTrimestrales:    number;   // 5d/mes acumulados
    diasAdicionales:     number;   // 2d/año desde año 2
    diasTotales:         number;
    salarioIntegralDiario: number;
    saldoPrestaciones:   number;   // diasTotales × salarioIntegralDiario

    // Vacaciones (Art. 190-196 LOTTT)
    diasVacBase:         number;   // 15 + 1 por año desde año 2
    diasVacGanados:      number;   // proporcional al período actual
    montoVacaciones:     number;

    // Bono vacacional
    diasBonoBase:        number;
    diasBonoGanados:     number;
    montoBonoVacacional: number;

    // Utilidades (Art. 131 LOTTT)
    diasUtilidades:      number;
    utilidadesAnuales:   number;   // proyección año completo
    utilidadesFracc:     number;   // fracción del año actual

    // Gran total estimado (prestaciones + vac + bono + util fracc)
    totalEstimado:       number;
}

interface ComputeOptions {
    salarioVES:         number;
    fechaIngreso:       string;   // YYYY-MM-DD
    fechaCorte:         string;   // YYYY-MM-DD (hoy o fecha a consultar)
    diasUtil:           number;   // días de utilidades del plan (e.g. 15-120)
    diasBonoVac:        number;   // días de bono vacacional base (e.g. 15)
}

export function computePrestaciones(opts: ComputeOptions): PrestacionesResumen | null {
    const { salarioVES, fechaIngreso, fechaCorte, diasUtil, diasBonoVac } = opts;
    if (!fechaIngreso || salarioVES <= 0) return null;

    const ingreso = new Date(fechaIngreso + "T00:00:00");
    const corte   = new Date(fechaCorte   + "T00:00:00");
    if (corte <= ingreso) return null;

    const msDay       = 86400000;
    const totalDias   = Math.floor((corte.getTime() - ingreso.getTime()) / msDay);
    const anios       = Math.floor(totalDias / 365);
    const mesesCompletos = Math.floor(totalDias / 30.4375);

    // ── Salario integral diario (año comercial 360 días — práctica venezolana) ──
    const salarioDiario = salarioVES / 30;
    const alicuotaUtil  = salarioDiario * diasUtil    / 360;
    const alicuotaBono  = salarioDiario * diasBonoVac / 360;
    const salarioIntegralDiario = salarioDiario + alicuotaUtil + alicuotaBono;

    // ── Prestaciones (Art. 142) ──────────────────────────────────────────────
    // Trimestral: 5 días/mes acumulados desde el inicio
    const diasTrimestrales = mesesCompletos * 5;

    // Adicionales: el depósito anual CRECE 2 días por año de servicio (acumulativo).
    // Año 2: +2d, Año 3: +4d, Año 4: +6d ... → total acum = N×(N-1)
    // Cap Art.142: depósito anual máximo 30d (se alcanza en año 16).
    const diasUltAnio = totalDias % 365;
    const diasAdicFull = anios <= 16
        ? anios * Math.max(0, anios - 1)
        : 240 + 30 * (anios - 16);
    const diasAdicionales = diasAdicFull
        + (anios >= 1 && diasUltAnio > 182 ? Math.min(30, 2 * anios) : 0);
    const diasTotales      = diasTrimestrales + diasAdicionales;
    const saldoPrestaciones = diasTotales * salarioIntegralDiario;

    // ── Vacaciones (Art. 190-196) ────────────────────────────────────────────
    // Días base: 15 en el primer año, +1 por cada año adicional (hasta máx 30 o 15+15)
    const diasVacBase   = Math.min(30, 15 + Math.max(0, anios - 1));
    // Días ganados en el período actual (desde último aniversario)
    const diasDesdeAniv = anios >= 1 ? diasUltAnio : totalDias;
    const diasVacGanados = diasVacBase * (diasDesdeAniv / 365);
    const montoVacaciones = (salarioVES / 30) * diasVacGanados;

    // ── Bono vacacional ──────────────────────────────────────────────────────
    const diasBonoBase   = Math.min(30, diasBonoVac + Math.max(0, anios - 1));
    const diasBonoGanados = diasBonoBase * (diasDesdeAniv / 365);
    const montoBonoVacacional = (salarioVES / 30) * diasBonoGanados;

    // ── Utilidades (Art. 131) ────────────────────────────────────────────────
    const utilidadesAnuales = (salarioVES / 30) * diasUtil;
    // Fraccionadas: días trabajados en el año calendario actual
    const inicioAnio        = new Date(corte.getFullYear(), 0, 1);
    const refUtil           = ingreso > inicioAnio ? ingreso : inicioAnio;
    const diasEnAnio        = Math.floor((corte.getTime() - refUtil.getTime()) / msDay);
    const utilidadesFracc   = (salarioVES / 30) * diasUtil * (diasEnAnio / 365);

    const totalEstimado = saldoPrestaciones + montoVacaciones + montoBonoVacacional + utilidadesFracc;

    return {
        fechaIngreso, fechaCorte, totalDias, anios, mesesCompletos,
        diasTrimestrales, diasAdicionales, diasTotales,
        salarioIntegralDiario, saldoPrestaciones,
        diasVacBase, diasVacGanados, montoVacaciones,
        diasBonoBase, diasBonoGanados, montoBonoVacacional,
        diasUtilidades: diasUtil, utilidadesAnuales, utilidadesFracc,
        totalEstimado,
    };
}

// ── CSV export ────────────────────────────────────────────────────────────────

interface ExportRow {
    nombre: string;
    cedula: string;
    cargo:  string;
    resumen: PrestacionesResumen;
}

export function prestacionesToCsv(rows: ExportRow[], fechaCorte: string): string {
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

    const dataRows = rows.map(({ nombre, cedula, cargo, resumen: r }) => [
        nombre, cedula, cargo, r.fechaIngreso, r.anios, r.mesesCompletos,
        r.diasTrimestrales, r.diasAdicionales, r.diasTotales,
        fmt(r.salarioIntegralDiario), fmt(r.saldoPrestaciones),
        fmt(r.diasVacGanados), fmt(r.montoVacaciones),
        fmt(r.diasBonoGanados), fmt(r.montoBonoVacacional),
        r.diasUtilidades, fmt(r.utilidadesAnuales), fmt(r.utilidadesFracc),
        fmt(r.totalEstimado),
    ].join(";"));

    return [
        `# Prestaciones Sociales al ${fechaCorte}`,
        header,
        ...dataRows,
    ].join("\n");
}

export function downloadPrestacionesCsv(rows: ExportRow[], fechaCorte: string) {
    const csv  = prestacionesToCsv(rows, fechaCorte);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `prestaciones_${fechaCorte.replaceAll("-", "")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}
