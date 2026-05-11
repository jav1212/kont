// =============================================================================
// Agregador mensual de Retenciones ISLR (per-empleado).
//
// Suma el bruto de todos los recibos confirmados del mes por cédula y aplica
// el `porcentajeIslr` declarado en el empleado para producir las filas que
// alimentan el PDF de Retenciones por Mes - Año.
//
// NOTA — duplicación deliberada con `islr-xml-modal.tsx:110-181`. La lógica
// de agregación es la misma, pero se reproduce aquí en lugar de extraerse
// porque el modal XML SENIAT está certificado (formato, validaciones RIF y
// fechaOperacion derivada del último periodEnd real) y mezclar ambos caminos
// acoplaría consumidores con políticas distintas:
//   - XML SENIAT: validación estricta de RIF, fechaOperacion = último periodEnd.
//   - PDF: tolerante a cédulas sin prefijo, fechas = último día calendario.
// =============================================================================

import type { PayrollRun, PayrollReceipt } from "@/src/modules/payroll/frontend/hooks/use-payroll-history";
import type { Employee } from "@/src/modules/payroll/frontend/hooks/use-employee";

export interface IslrMonthlyRow {
    cedula:         string;
    nombre:         string;
    porcentajeIslr: number;
    baseImponible:  number;   // bruto mensual acumulado (VES)
    retencion:      number;   // baseImponible × porcentajeIslr / 100
}

function runYearMonth(run: PayrollRun): { year: number; month: number } {
    const [y, m] = run.periodEnd.split("-");
    return { year: Number(y), month: Number(m) };
}

/**
 * Construye las filas mensuales de retenciones ISLR para un mes/año dados.
 * Solo considera runs `status === "confirmed"` cuyo `periodEnd` cae en el
 * mes solicitado. Empleados con bruto = 0 quedan fuera (no aparecen porque
 * nunca se insertaron en el Map). Empleados con bruto > 0 pero sin registro
 * en `employees` aparecen con `porcentajeIslr = 0` y el nombre que trae el
 * recibo (cédulas huérfanas tras borrado).
 */
export async function buildIslrMonthlyRows(
    runs: PayrollRun[],
    employees: Employee[],
    getReceipts: (runId: string) => Promise<PayrollReceipt[] | null>,
    year: number,
    month: number,
): Promise<IslrMonthlyRow[]> {
    const monthRuns = runs.filter((r) => {
        if (r.status !== "confirmed") return false;
        const ym = runYearMonth(r);
        return ym.year === year && ym.month === month;
    });

    if (monthRuns.length === 0) return [];

    const allReceipts = await Promise.all(
        monthRuns.map(async (r) => (await getReceipts(r.id)) ?? []),
    );

    // Bruto acumulado por cédula + último nombre visto (fallback a empleados).
    const acumulado = new Map<string, { nombre: string; base: number }>();
    allReceipts.flat().forEach((rcp) => {
        const gross = rcp.calculationData?.gross
            ?? (rcp.totalEarnings + rcp.totalBonuses);
        const prev = acumulado.get(rcp.employeeCedula);
        acumulado.set(rcp.employeeCedula, {
            nombre: prev?.nombre ?? rcp.employeeNombre,
            base:   (prev?.base ?? 0) + gross,
        });
    });

    const empByCedula = new Map(employees.map((e) => [e.cedula, e]));

    const rows: IslrMonthlyRow[] = Array.from(acumulado.entries()).map(([cedula, { nombre, base }]) => {
        const emp = empByCedula.get(cedula);
        const porcentajeIslr = emp?.porcentajeIslr ?? 0;
        const baseImponible  = round2(base);
        const retencion      = round2(baseImponible * porcentajeIslr / 100);
        return {
            cedula,
            nombre: emp?.nombre ?? nombre,
            porcentajeIslr,
            baseImponible,
            retencion,
        };
    });

    rows.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    return rows;
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}
