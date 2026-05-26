// rpc-purchase-invoice.repository.ts — Supabase RPC adapter for the PurchaseInvoice entity.
// Role: infrastructure — implements IPurchaseInvoiceRepository via Postgres RPC.
// Invariant: all DB RPC function names are unchanged (DB contract).
import { SupabaseClient } from '@supabase/supabase-js';
import { IPurchaseInvoiceRepository } from '../../domain/repository/purchase-invoice.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import {
    PurchaseInvoice,
    PurchaseInvoiceItem,
    InvoiceStatus,
    VatRate,
    ItemCurrency,
    AdjustmentKind,
} from '../../domain/purchase-invoice';
import type { InvoiceTax, TaxBase, AdjustmentKind as AdjKind } from '@/src/modules/inventory/shared/totals';
import {
    MigratePurchaseInvoicesResult,
    MigratedInvoice,
    SkippedInvoice,
    CreatedSupplierRef,
    CreatedProductRef,
} from '../../domain/migrate-purchase-invoices';

// Infrastructure DTO — shape of the raw Postgres RPC row for invoice header.
interface InvoiceRpcRow {
  id: string | null;
  empresa_id: string;
  proveedor_id: string;
  proveedor_nombre: string | null;
  numero_factura: string | null;
  numero_control: string | null;
  fecha: string;
  periodo: string;
  periodo_manual: boolean | null;
  estado: string | null;
  subtotal: number | null;
  iva_porcentaje: number | null;
  iva_monto: number | null;
  total: number | null;
  notas: string | null;
  tasa_dolar: number | string | null;
  tasa_decimales: number | null;
  descuento_tipo: string | null;
  descuento_valor: number | string | null;
  descuento_monto: number | string | null;
  recargo_tipo: string | null;
  recargo_valor: number | string | null;
  recargo_monto: number | string | null;
  retencion_iva_pct:   number | string | null;
  retencion_iva_monto: number | string | null;
  comprobante_retencion_iva_numero: string | null;
  islr_concepto:           string | null;
  islr_porcentaje:         number | string | null;
  islr_base_retencion:     number | string | null;
  islr_sustraendo:         number | string | null;
  islr_monto:              number | string | null;
  islr_unidad_tributaria:  number | string | null;
  comprobante_islr_numero: string | null;
  igtf_aplica:             boolean | null;
  igtf_porcentaje:         number | string | null;
  igtf_base_divisa:        number | string | null;
  igtf_base_bs:            number | string | null;
  igtf_monto:              number | string | null;
  impuestos:               unknown[] | null;
  confirmada_at: string | null;
  items: InvoiceItemRpcRow[] | null;
  items_count: number | string | null;
  created_at: string | null;
  updated_at: string | null;
}

// Infrastructure DTO — shape of one line item in the RPC response.
interface InvoiceItemRpcRow {
  id: string;
  factura_id: string;
  producto_id: string;
  producto_nombre: string | null;
  cantidad: number | null;
  costo_unitario: number | null;
  costo_total: number | null;
  iva_alicuota: string | null;
  moneda: string | null;
  costo_moneda: number | null;
  tasa_dolar: number | null;
  descuento_tipo: string | null;
  descuento_valor: number | string | null;
  descuento_monto: number | string | null;
  recargo_tipo: string | null;
  recargo_valor: number | string | null;
  recargo_monto: number | string | null;
  base_iva: number | string | null;
  iva_incluido: boolean | null;
}

const num = (v: number | string | null | undefined, fallback = 0): number =>
    v == null || v === '' ? fallback : Number(v);

const adjKind = (v: string | null | undefined): AdjustmentKind | null =>
    v === 'monto' || v === 'porcentaje' ? v : null;

const stringifyAdj = (v: AdjustmentKind | null | undefined): string => v ?? '';
const stringifyNum = (v: number | null | undefined): string =>
    v != null && Number.isFinite(v) && v !== 0 ? String(v) : '';

export class RpcPurchaseInvoiceRepository implements IPurchaseInvoiceRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly userId: string,
    ) {}

    async findByCompany(companyId: string): Promise<Result<PurchaseInvoice[]>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_facturas_get', {
                    p_user_id:    this.userId,
                    p_empresa_id: companyId,
                });
            if (error) return Result.fail(error.message);
            return Result.success((data as InvoiceRpcRow[] ?? []).map(this.mapToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Failed to fetch purchase invoices');
        }
    }

    async findById(invoiceId: string): Promise<Result<PurchaseInvoice>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_factura_get', {
                    p_user_id:    this.userId,
                    p_factura_id: invoiceId,
                });
            if (error) return Result.fail(error.message);
            if (!data) return Result.fail('Invoice not found');
            return Result.success(this.mapToDomain(data as InvoiceRpcRow));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Failed to fetch purchase invoice');
        }
    }

    async save(invoice: PurchaseInvoice, items: PurchaseInvoiceItem[]): Promise<Result<PurchaseInvoice>> {
        try {
            const invoiceRow = {
                id:             invoice.id ?? '',
                empresa_id:     invoice.companyId,
                proveedor_id:   invoice.supplierId,
                numero_factura: invoice.invoiceNumber,
                numero_control: invoice.controlNumber ?? '',
                fecha:          invoice.date,
                periodo:        invoice.period ?? '',
                periodo_manual: invoice.periodoManual ? 'true' : '',
                iva_porcentaje: invoice.vatPercentage,
                notas:          invoice.notes,
                tasa_dolar:     invoice.dollarRate   != null ? String(invoice.dollarRate)   : '',
                tasa_decimales: invoice.rateDecimals != null ? String(invoice.rateDecimals) : '',
                descuento_tipo:  stringifyAdj(invoice.descuentoTipo),
                descuento_valor: stringifyNum(invoice.descuentoValor),
                descuento_monto: stringifyNum(invoice.descuentoMonto),
                recargo_tipo:    stringifyAdj(invoice.recargoTipo),
                recargo_valor:   stringifyNum(invoice.recargoValor),
                recargo_monto:   stringifyNum(invoice.recargoMonto),
                retencion_iva_pct: stringifyNum(invoice.retencionIvaPct),
                islr_concepto:          invoice.islrConcepto ?? '',
                islr_porcentaje:        stringifyNum(invoice.islrPorcentaje),
                islr_base_retencion:    stringifyNum(invoice.islrBaseRetencion),
                islr_sustraendo:        stringifyNum(invoice.islrSustraendo),
                islr_unidad_tributaria: stringifyNum(invoice.islrUnidadTributaria),
                igtf_aplica:            invoice.igtfAplica ? 'true' : '',
                igtf_porcentaje:        stringifyNum(invoice.igtfPorcentaje),
                igtf_base_divisa:       stringifyNum(invoice.igtfBaseDivisa),
                igtf_base_bs:           stringifyNum(invoice.igtfBaseBs),
                impuestos:              JSON.stringify(invoice.impuestos ?? []),
            };
            const itemsRow = items.map((i) => ({
                producto_id:    i.productId,
                cantidad:       i.quantity,
                costo_unitario: i.unitCost,
                costo_total:    i.totalCost,
                iva_alicuota:   i.vatRate ?? 'general_16',
                moneda:         i.currency ?? 'B',
                costo_moneda:   i.currencyCost ?? null,
                tasa_dolar:     i.dollarRate ?? null,
                descuento_tipo:  stringifyAdj(i.descuentoTipo),
                descuento_valor: stringifyNum(i.descuentoValor),
                descuento_monto: stringifyNum(i.descuentoMonto),
                recargo_tipo:    stringifyAdj(i.recargoTipo),
                recargo_valor:   stringifyNum(i.recargoValor),
                recargo_monto:   stringifyNum(i.recargoMonto),
                base_iva:       i.baseIVA != null ? String(i.baseIVA) : '',
                iva_incluido:   i.ivaIncluido ? 'true' : '',
            }));
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_factura_save', {
                    p_user_id: this.userId,
                    p_factura: invoiceRow,
                    p_items:   itemsRow,
                });
            if (error) return Result.fail(error.message);
            return Result.success(this.mapToDomain(data as InvoiceRpcRow));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Failed to save purchase invoice');
        }
    }

    async delete(invoiceId: string): Promise<Result<void>> {
        try {
            const { error } = await this.source.instance
                .rpc('tenant_inventario_factura_delete', {
                    p_user_id:    this.userId,
                    p_factura_id: invoiceId,
                });
            if (error) return Result.fail(error.message);
            return Result.success();
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Failed to delete purchase invoice');
        }
    }

    async confirm(invoiceId: string): Promise<Result<PurchaseInvoice>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_factura_confirmar', {
                    p_user_id:    this.userId,
                    p_factura_id: invoiceId,
                });
            if (error) return Result.fail(error.message);
            return Result.success(this.mapToDomain(data as InvoiceRpcRow));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Failed to confirm purchase invoice');
        }
    }

    async imputeItems(invoiceId: string, items: PurchaseInvoiceItem[]): Promise<Result<PurchaseInvoice>> {
        try {
            const itemsRow = items.map((i) => ({
                producto_id:    i.productId,
                cantidad:       i.quantity,
                costo_unitario: i.unitCost,
                costo_total:    i.totalCost,
                iva_alicuota:   i.vatRate ?? 'general_16',
                moneda:         i.currency ?? 'B',
                costo_moneda:   i.currencyCost ?? null,
                tasa_dolar:     i.dollarRate ?? null,
                descuento_tipo:  stringifyAdj(i.descuentoTipo),
                descuento_valor: stringifyNum(i.descuentoValor),
                descuento_monto: stringifyNum(i.descuentoMonto),
                recargo_tipo:    stringifyAdj(i.recargoTipo),
                recargo_valor:   stringifyNum(i.recargoValor),
                recargo_monto:   stringifyNum(i.recargoMonto),
                base_iva:       i.baseIVA != null ? String(i.baseIVA) : '',
                iva_incluido:   i.ivaIncluido ? 'true' : '',
            }));
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_factura_imputar_items', {
                    p_user_id:    this.userId,
                    p_factura_id: invoiceId,
                    p_items:      itemsRow,
                });
            if (error) return Result.fail(error.message);
            return Result.success(this.mapToDomain(data as InvoiceRpcRow));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Failed to impute purchase invoice items');
        }
    }

    async unconfirm(invoiceId: string): Promise<Result<PurchaseInvoice>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_factura_desconfirmar', {
                    p_user_id:    this.userId,
                    p_factura_id: invoiceId,
                });
            if (error) return Result.fail(error.message);
            return Result.success(this.mapToDomain(data as InvoiceRpcRow));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Failed to unconfirm purchase invoice');
        }
    }

    async migrate(
        invoiceIds:      string[],
        targetCompanyId: string,
        targetPeriod?:   string | null,
    ): Promise<Result<MigratePurchaseInvoicesResult>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_factura_migrate', {
                    p_user_id:            this.userId,
                    p_factura_ids:        invoiceIds,
                    p_empresa_destino_id: targetCompanyId,
                    p_periodo_destino:    targetPeriod ?? null,
                });
            if (error) return Result.fail(error.message);
            return Result.success(mapMigrationResult(data));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Failed to migrate purchase invoices');
        }
    }

    private mapToDomain(row: InvoiceRpcRow): PurchaseInvoice {
        const items: PurchaseInvoiceItem[] | undefined = Array.isArray(row.items)
            ? row.items.map((i) => ({
                id:           i.id,
                invoiceId:    i.factura_id,
                productId:    i.producto_id,
                productName:  i.producto_nombre ?? undefined,
                quantity:     num(i.cantidad),
                unitCost:     num(i.costo_unitario),
                totalCost:    num(i.costo_total),
                vatRate:      ((i.iva_alicuota ?? 'general_16') as VatRate),
                currency:     (i.moneda === 'D' ? 'D' : 'B') as ItemCurrency,
                currencyCost: i.costo_moneda != null ? Number(i.costo_moneda) : null,
                dollarRate:   i.tasa_dolar   != null ? Number(i.tasa_dolar)   : null,
                descuentoTipo:  adjKind(i.descuento_tipo),
                descuentoValor: num(i.descuento_valor),
                descuentoMonto: num(i.descuento_monto),
                recargoTipo:    adjKind(i.recargo_tipo),
                recargoValor:   num(i.recargo_valor),
                recargoMonto:   num(i.recargo_monto),
                baseIVA:        num(i.base_iva, num(i.costo_total)),
                ivaIncluido:    i.iva_incluido === true,
            }))
            : undefined;

        return {
            id:            row.id ?? undefined,
            companyId:     row.empresa_id,
            supplierId:    row.proveedor_id,
            supplierName:  row.proveedor_nombre ?? undefined,
            invoiceNumber: row.numero_factura ?? '',
            controlNumber: row.numero_control ?? '',
            date:          row.fecha,
            period:        row.periodo,
            periodoManual: row.periodo_manual === true,
            status:        ((row.estado ?? 'borrador') as InvoiceStatus),
            subtotal:      num(row.subtotal),
            vatPercentage: num(row.iva_porcentaje, 16),
            vatAmount:     num(row.iva_monto),
            total:         num(row.total),
            notes:         row.notas ?? '',
            dollarRate:    row.tasa_dolar     != null ? Number(row.tasa_dolar)     : null,
            rateDecimals:  row.tasa_decimales != null ? Number(row.tasa_decimales) : null,
            descuentoTipo:  adjKind(row.descuento_tipo),
            descuentoValor: num(row.descuento_valor),
            descuentoMonto: num(row.descuento_monto),
            recargoTipo:    adjKind(row.recargo_tipo),
            recargoValor:   num(row.recargo_valor),
            recargoMonto:   num(row.recargo_monto),
            retencionIvaPct:   num(row.retencion_iva_pct),
            retencionIvaMonto: num(row.retencion_iva_monto),
            comprobanteRetencionIvaNumero: row.comprobante_retencion_iva_numero ?? null,
            islrConcepto:          row.islr_concepto ?? null,
            islrPorcentaje:        num(row.islr_porcentaje),
            islrBaseRetencion:     num(row.islr_base_retencion),
            islrSustraendo:        num(row.islr_sustraendo),
            islrMonto:             num(row.islr_monto),
            islrUnidadTributaria:  row.islr_unidad_tributaria != null && row.islr_unidad_tributaria !== '' ? Number(row.islr_unidad_tributaria) : undefined,
            comprobanteIslrNumero: row.comprobante_islr_numero ?? null,
            igtfAplica:            row.igtf_aplica === true,
            igtfPorcentaje:        num(row.igtf_porcentaje),
            igtfBaseDivisa:        num(row.igtf_base_divisa),
            igtfBaseBs:            num(row.igtf_base_bs),
            igtfMonto:             num(row.igtf_monto),
            impuestos: Array.isArray(row.impuestos)
                ? (row.impuestos as Array<Record<string, unknown>>).map((t): InvoiceTax => ({
                    nombre: String(t.nombre ?? ''),
                    tipo:   (t.tipo === 'monto' || t.tipo === 'porcentaje' ? t.tipo : 'porcentaje') as AdjKind,
                    valor:  num(t.valor as number | string | null),
                    base:   (t.base === 'post_iva' ? 'post_iva' : 'pre_iva') as TaxBase,
                    monto:  num(t.monto as number | string | null),
                }))
                : [],
            confirmedAt:   row.confirmada_at ?? null,
            items,
            itemsCount:    row.items_count != null ? Number(row.items_count) : undefined,
            createdAt:     row.created_at ?? undefined,
            updatedAt:     row.updated_at ?? undefined,
        };
    }
}

// ── Migration result mapper ─────────────────────────────────────────────────

interface MigrationRpcResponse {
    migrated?:          MigrationRpcMigrated[];
    skipped?:           MigrationRpcSkipped[];
    created_suppliers?: MigrationRpcCreatedSupplier[];
    created_products?:  MigrationRpcCreatedProduct[];
}

interface MigrationRpcMigrated {
    id:                string;
    source_empresa_id: string;
    target_empresa_id: string;
    was_confirmed:     boolean;
    fecha:             string;
    periodo:           string;
    subtotal:          number | string;
    iva_monto:         number | string;
    total:             number | string;
}

interface MigrationRpcSkipped {
    id:     string;
    reason: string;
}

interface MigrationRpcCreatedSupplier {
    id:     string;
    rif:    string | null;
    nombre: string;
}

interface MigrationRpcCreatedProduct {
    id:     string;
    codigo: string | null;
    nombre: string;
}

function mapMigrationResult(data: unknown): MigratePurchaseInvoicesResult {
    const r = (data ?? {}) as MigrationRpcResponse;

    const migrated: MigratedInvoice[] = (r.migrated ?? []).map((m) => ({
        id:               m.id,
        sourceCompanyId:  m.source_empresa_id,
        targetCompanyId:  m.target_empresa_id,
        wasConfirmed:     Boolean(m.was_confirmed),
        date:             m.fecha,
        period:           m.periodo ?? '',
        subtotal:         Number(m.subtotal ?? 0),
        vatAmount:        Number(m.iva_monto ?? 0),
        total:            Number(m.total ?? 0),
    }));

    const skipped: SkippedInvoice[] = (r.skipped ?? []).map((s) => ({
        id:     s.id,
        // RPC currently only emits 'already-in-target'; widen the type if more are added.
        reason: 'already-in-target',
    }));

    const createdSuppliers: CreatedSupplierRef[] = (r.created_suppliers ?? []).map((s) => ({
        id:     s.id,
        rif:    s.rif ?? '',
        nombre: s.nombre,
    }));

    const createdProducts: CreatedProductRef[] = (r.created_products ?? []).map((p) => ({
        id:     p.id,
        codigo: p.codigo ?? '',
        nombre: p.nombre,
    }));

    return { migrated, skipped, createdSuppliers, createdProducts };
}
