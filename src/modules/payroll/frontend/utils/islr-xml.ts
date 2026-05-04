// =============================================================================
// SENIAT — Relación de Retenciones ISLR (Salarios — Concepto 001)
//
// Wrapper específico para nómina sobre el constructor genérico en
// `src/shared/frontend/utils/islr-xml-builder.ts`. Mantiene la API pública
// usada por `islr-xml-modal.tsx` (consumidor exclusivo en payroll).
//
// Diferencia respecto al concepto 001 (sueldos):
//   - NumeroFactura / NumeroControl: derivados del último día del mes
//     (DDMMYYYY) — convención de nómina, ya que no hay factura ni control real.
//   - FechaOperacion: último periodEnd pagado en el mes (configurable).
//   - CodigoConcepto: siempre "001".
//
// Para retenciones sobre compras/servicios (códigos 002-086), usar
// directamente `buildIslrXmlGeneric` desde el shared.
// =============================================================================

import {
    buildIslrXmlGeneric,
    formatRifAgente,
    formatRifRetenido as formatRifRetenidoGeneric,
    formatFechaOperacion,
    formatNumeroFactura,
    lastDayOfMonth,
    prettifyIslrXml,
    downloadXmlFile,
    type IslrXmlGenericItem,
} from "@/src/shared/frontend/utils/islr-xml-builder";

// Re-exports para compatibilidad con consumidores existentes.
export {
    formatRifAgente,
    formatFechaOperacion,
    formatNumeroFactura,
    lastDayOfMonth,
    prettifyIslrXml,
    downloadXmlFile,
};

const CODIGO_CONCEPTO_SUELDOS = "001";

/**
 * Wrapper específico para nómina: la cédula del empleado se asume tipo 'V'
 * cuando no trae prefijo. Lanza error claro indicando al empleado a corregir.
 */
export function formatRifRetenido(cedula: string, nombre?: string): string {
    return formatRifRetenidoGeneric(cedula, nombre, 'V');
}

// ── Tipos públicos (API original — consumida por islr-xml-modal) ─────────────

export interface IslrXmlItem {
    cedula:           string;   // tal como viene del empleado
    nombre?:          string;   // opcional, sólo para mensajes de error
    montoOperacion:   number;   // bruto mensual acumulado (VES)
    porcentajeIslr:   number;   // % declarado en AR-I (0-100)
}

export interface BuildIslrXmlInput {
    companyRif:    string;
    year:          number;
    month:         number;
    /** Fecha del último periodEnd pagado en el mes (ISO YYYY-MM-DD). */
    fechaOperacion?: string;
    items:         IslrXmlItem[];
}

// ── Generador específico de nómina ───────────────────────────────────────────

/**
 * Construye el XML mensual de retenciones ISLR para sueldos (concepto 001).
 * Internamente normaliza los items al shape genérico y delega al builder
 * compartido en `shared/`.
 */
export function buildIslrXml(input: BuildIslrXmlInput): string {
    const { companyRif, year, month, items } = input;

    if (!items.length) {
        throw new Error("No hay empleados con pagos en el período seleccionado.");
    }

    const fechaIso  = input.fechaOperacion ?? lastDayOfMonth(year, month);
    const numeroRef = formatNumeroFactura(fechaIso);
    const fechaOp   = formatFechaOperacion(fechaIso);

    const generic: IslrXmlGenericItem[] = items.map((it) => ({
        rifRetenido:         formatRifRetenido(it.cedula, it.nombre),
        numeroFactura:       numeroRef,
        numeroControl:       numeroRef,
        fechaOperacion:      fechaOp,
        codigoConcepto:      CODIGO_CONCEPTO_SUELDOS,
        montoOperacion:      it.montoOperacion,
        porcentajeRetencion: it.porcentajeIslr,
    }));

    return buildIslrXmlGeneric({ companyRif, year, month, items: generic });
}
