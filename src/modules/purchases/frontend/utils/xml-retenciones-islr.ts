// =============================================================================
// SENIAT — XML mensual de Retenciones ISLR sobre Compras
//
// Ensambla el XML `<RelacionRetencionesISLR>` con los detalles de las
// facturas de compra confirmadas con retención ISLR > 0 en el período. Usa
// el constructor genérico de `shared/utils/islr-xml-builder` (mismo que
// nómina), pero pasando `codigoConcepto` por ítem (no fijo en "001").
//
// Nota: si el agente además tiene retenciones de nómina (concepto 001), debe
// generar el XML de nómina aparte y consolidar los detalles antes de subir
// al portal SENIAT (un solo XML por agente por período). El portal admite
// múltiples archivos en una misma declaración pero la práctica común es uno
// consolidado.
// =============================================================================

import {
    buildIslrXmlGeneric,
    formatRifRetenido,
    formatFechaOperacion,
    downloadXmlFile,
    type IslrXmlGenericItem,
} from "@/src/shared/frontend/utils/islr-xml-builder";
import type { IslrRetentionExportPayload } from "../../backend/domain/islr-retentions-export";

export interface BuildPurchaseIslrXmlInput {
    payload: IslrRetentionExportPayload;
}

/**
 * Construye el XML mensual de retenciones ISLR sobre compras a partir del
 * payload del RPC. Lanza si no hay retenciones — el caller debe validar
 * antes y mostrar un mensaje al usuario.
 */
export function buildPurchaseIslrXml({ payload }: BuildPurchaseIslrXmlInput): string {
    if (!payload.rows.length) {
        throw new Error("No hay retenciones de ISLR sobre compras en el período seleccionado.");
    }

    const yyyy  = parseInt(payload.periodYyyymm.slice(0, 4), 10);
    const mm    = parseInt(payload.periodYyyymm.slice(4, 6), 10);

    // Para proveedores PJ usamos defaultLetter='J', para PN se usaría 'V'.
    // No tenemos esa información granular en el payload — pero el RIF normalmente
    // ya viene con letra prefijada en la BD (RIF venezolano siempre la incluye).
    const items: IslrXmlGenericItem[] = payload.rows.map((r) => ({
        rifRetenido:         formatRifRetenido(r.supplierRif, r.supplierName, 'J'),
        numeroFactura:       r.invoiceNumber || '0',
        numeroControl:       r.controlNumber || 'NA',
        fechaOperacion:      formatFechaOperacion(r.operationDate),
        codigoConcepto:      r.conceptCode,
        montoOperacion:      r.operationAmount,
        porcentajeRetencion: r.percentage,
    }));

    return buildIslrXmlGeneric({
        companyRif: payload.agentRif,
        year:       yyyy,
        month:      mm,
        items,
    });
}

/** Convención de nombre: `RetISLR_{RIF}_{AAAAMM}.xml`. */
export function defaultPurchaseIslrXmlFilename(agentRif: string, periodYyyymm: string): string {
    const cleanRif = (agentRif ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    return `RetISLR_${cleanRif}_${periodYyyymm}.xml`;
}

export { downloadXmlFile };
