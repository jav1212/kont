import { SupabaseClient } from '@supabase/supabase-js';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import { ISalesInvoiceRepository } from '../../domain/repository/sales-invoice.repository';
import {
    SalesInvoice,
    SalesInvoiceItem,
    SalesInvoiceStatus,
    VatRate,
    ItemCurrency,
    AdjustmentKind,
    IgtfConcept,
} from '../../domain/sales-invoice';

interface InvoiceRpcRow {
    id:                string;
    empresa_id:        string;
    cliente_id:        string;
    cliente_nombre:    string | null;
    cliente_rif:       string | null;
    cliente_direccion: string | null;
    numero_factura:    string;
    numero_control:    string | null;
    fecha:             string;
    periodo:           string;
    periodo_manual:    boolean | null;
    fecha_vencimiento: string | null;
    condiciones_pago:  string | null;
    estado:            string | null;
    subtotal:          number | string | null;
    iva_monto:         number | string | null;
    total:             number | string | null;
    notas:             string | null;
    tasa_dolar:        number | string | null;
    tasa_decimales:    number | null;
    descuento_tipo:    string | null;
    descuento_valor:   number | string | null;
    descuento_monto:   number | string | null;
    recargo_tipo:      string | null;
    recargo_valor:     number | string | null;
    recargo_monto:     number | string | null;
    igtf_percepcion_aplica:      boolean | null;
    igtf_percepcion_concepto:    string | null;
    igtf_percepcion_porcentaje:  number | string | null;
    igtf_percepcion_base_divisa: number | string | null;
    igtf_percepcion_base_bs:     number | string | null;
    igtf_percepcion_monto:       number | string | null;
    confirmada_at:     string | null;
    items:             InvoiceItemRpcRow[] | null;
    created_at:        string | null;
    updated_at:        string | null;
}

interface InvoiceItemRpcRow {
    id:              string;
    factura_id:      string;
    producto_id:     string | null;
    producto_nombre: string | null;
    descripcion:     string | null;
    cantidad:        number | string | null;
    precio_unitario: number | string | null;
    total_linea:     number | string | null;
    iva_alicuota:    string | null;
    moneda:          string | null;
    precio_moneda:   number | string | null;
    tasa_dolar:      number | string | null;
    descuento_tipo:  string | null;
    descuento_valor: number | string | null;
    descuento_monto: number | string | null;
    recargo_tipo:    string | null;
    recargo_valor:   number | string | null;
    recargo_monto:   number | string | null;
    base_iva:        number | string | null;
    iva_incluido:    boolean | null;
}

const num = (v: number | string | null | undefined, fallback = 0): number =>
    v == null || v === '' ? fallback : Number(v);

const adjKind = (v: string | null | undefined): AdjustmentKind | null =>
    v === 'monto' || v === 'porcentaje' ? v : null;

const stringifyAdj = (v: AdjustmentKind | null | undefined): string => v ?? '';
const stringifyNum = (v: number | null | undefined): string =>
    v != null && Number.isFinite(v) && v !== 0 ? String(v) : '';

export class RpcSalesInvoiceRepository implements ISalesInvoiceRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly userId: string,
    ) {}

    async findByCompany(companyId: string): Promise<Result<SalesInvoice[]>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_ventas_facturas_get', {
                    p_user_id:    this.userId,
                    p_empresa_id: companyId,
                });
            if (error) return Result.fail(error.message);
            return Result.success(((data as InvoiceRpcRow[]) ?? []).map(this.mapToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Failed to fetch sales invoices');
        }
    }

    async findById(id: string): Promise<Result<SalesInvoice>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_ventas_factura_get', { p_user_id: this.userId, p_factura_id: id });
            if (error) return Result.fail(error.message);
            if (!data) return Result.fail('Invoice not found');
            return Result.success(this.mapToDomain(data as InvoiceRpcRow));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Failed to fetch sales invoice');
        }
    }

    async save(invoice: SalesInvoice, items: SalesInvoiceItem[]): Promise<Result<SalesInvoice>> {
        try {
            const invoiceRow = {
                id:                invoice.id ?? '',
                empresa_id:        invoice.companyId,
                cliente_id:        invoice.customerId,
                numero_factura:    invoice.invoiceNumber ?? '',
                numero_control:    invoice.controlNumber ?? '',
                fecha:             invoice.date,
                periodo:           invoice.period ?? '',
                periodo_manual:    invoice.periodoManual ? 'true' : '',
                fecha_vencimiento: invoice.dueDate ?? '',
                condiciones_pago:  invoice.paymentTerms ?? '',
                notas:             invoice.notes ?? '',
                tasa_dolar:        invoice.dollarRate   != null ? String(invoice.dollarRate)   : '',
                tasa_decimales:    invoice.rateDecimals != null ? String(invoice.rateDecimals) : '',
                descuento_tipo:    stringifyAdj(invoice.descuentoTipo),
                descuento_valor:   stringifyNum(invoice.descuentoValor),
                descuento_monto:   stringifyNum(invoice.descuentoMonto),
                recargo_tipo:      stringifyAdj(invoice.recargoTipo),
                recargo_valor:     stringifyNum(invoice.recargoValor),
                recargo_monto:     stringifyNum(invoice.recargoMonto),
                igtf_percepcion_aplica:      invoice.igtfPerceptionApplies ? 'true' : '',
                igtf_percepcion_concepto:    invoice.igtfPerceptionConcept ?? '',
                igtf_percepcion_porcentaje:  stringifyNum(invoice.igtfPerceptionPercentage),
                igtf_percepcion_base_divisa: stringifyNum(invoice.igtfPerceptionForeignBase),
                igtf_percepcion_base_bs:     stringifyNum(invoice.igtfPerceptionLocalBase),
            };
            const itemsRow = items.map((i) => ({
                producto_id:    i.productId ?? '',
                descripcion:    i.description,
                cantidad:       i.quantity,
                precio_unitario:i.unitPrice,
                total_linea:    i.totalLine,
                iva_alicuota:   i.vatRate ?? 'general_16',
                moneda:         i.currency ?? 'B',
                precio_moneda:  i.currencyPrice ?? null,
                tasa_dolar:     i.dollarRate ?? null,
                descuento_tipo: stringifyAdj(i.descuentoTipo),
                descuento_valor:stringifyNum(i.descuentoValor),
                descuento_monto:stringifyNum(i.descuentoMonto),
                recargo_tipo:   stringifyAdj(i.recargoTipo),
                recargo_valor:  stringifyNum(i.recargoValor),
                recargo_monto:  stringifyNum(i.recargoMonto),
                base_iva:       i.baseIVA != null ? String(i.baseIVA) : '',
                iva_incluido:   i.ivaIncluido ? 'true' : '',
            }));
            const { data, error } = await this.source.instance
                .rpc('tenant_ventas_factura_save', {
                    p_user_id: this.userId,
                    p_factura: invoiceRow,
                    p_items:   itemsRow,
                });
            if (error) return Result.fail(error.message);
            return Result.success(this.mapToDomain(data as InvoiceRpcRow));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Failed to save sales invoice');
        }
    }

    async confirm(id: string): Promise<Result<SalesInvoice>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_ventas_factura_confirmar', { p_user_id: this.userId, p_factura_id: id });
            if (error) return Result.fail(error.message);
            return Result.success(this.mapToDomain(data as InvoiceRpcRow));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Failed to confirm sales invoice');
        }
    }

    async unconfirm(id: string): Promise<Result<SalesInvoice>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_ventas_factura_desconfirmar', { p_user_id: this.userId, p_factura_id: id });
            if (error) return Result.fail(error.message);
            return Result.success(this.mapToDomain(data as InvoiceRpcRow));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Failed to unconfirm sales invoice');
        }
    }

    async delete(id: string): Promise<Result<void>> {
        try {
            const { error } = await this.source.instance
                .rpc('tenant_ventas_factura_delete', { p_user_id: this.userId, p_factura_id: id });
            if (error) return Result.fail(error.message);
            return Result.success();
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Failed to delete sales invoice');
        }
    }

    private mapToDomain(row: InvoiceRpcRow): SalesInvoice {
        const items: SalesInvoiceItem[] | undefined = Array.isArray(row.items)
            ? row.items.map((i) => ({
                id:             i.id,
                invoiceId:      i.factura_id,
                productId:      i.producto_id ?? null,
                productName:    i.producto_nombre ?? undefined,
                description:    i.descripcion ?? '',
                quantity:       num(i.cantidad),
                unitPrice:      num(i.precio_unitario),
                totalLine:      num(i.total_linea),
                vatRate:        ((i.iva_alicuota ?? 'general_16') as VatRate),
                currency:       (i.moneda === 'D' ? 'D' : 'B') as ItemCurrency,
                currencyPrice:  i.precio_moneda != null ? Number(i.precio_moneda) : null,
                dollarRate:     i.tasa_dolar    != null ? Number(i.tasa_dolar)    : null,
                descuentoTipo:  adjKind(i.descuento_tipo),
                descuentoValor: num(i.descuento_valor),
                descuentoMonto: num(i.descuento_monto),
                recargoTipo:    adjKind(i.recargo_tipo),
                recargoValor:   num(i.recargo_valor),
                recargoMonto:   num(i.recargo_monto),
                baseIVA:        num(i.base_iva, num(i.total_linea)),
                ivaIncluido:    i.iva_incluido === true,
            }))
            : undefined;

        return {
            id:              row.id,
            companyId:       row.empresa_id,
            customerId:      row.cliente_id,
            customerName:    row.cliente_nombre ?? undefined,
            customerRif:     row.cliente_rif    ?? undefined,
            customerAddress: row.cliente_direccion ?? undefined,
            invoiceNumber:   row.numero_factura,
            controlNumber:   row.numero_control ?? '',
            date:            row.fecha,
            period:          row.periodo,
            periodoManual:   row.periodo_manual === true,
            dueDate:         row.fecha_vencimiento,
            paymentTerms:    row.condiciones_pago ?? 'contado',
            status:          ((row.estado ?? 'borrador') as SalesInvoiceStatus),
            subtotal:        num(row.subtotal),
            vatAmount:       num(row.iva_monto),
            total:           num(row.total),
            notes:           row.notas ?? '',
            dollarRate:      row.tasa_dolar     != null ? Number(row.tasa_dolar)     : null,
            rateDecimals:    row.tasa_decimales != null ? Number(row.tasa_decimales) : null,
            descuentoTipo:   adjKind(row.descuento_tipo),
            descuentoValor:  num(row.descuento_valor),
            descuentoMonto:  num(row.descuento_monto),
            recargoTipo:     adjKind(row.recargo_tipo),
            recargoValor:    num(row.recargo_valor),
            recargoMonto:    num(row.recargo_monto),
            igtfPerceptionApplies:     row.igtf_percepcion_aplica === true,
            igtfPerceptionConcept:   (row.igtf_percepcion_concepto ?? null) as IgtfConcept | null,
            igtfPerceptionPercentage: num(row.igtf_percepcion_porcentaje),
            igtfPerceptionForeignBase: num(row.igtf_percepcion_base_divisa),
            igtfPerceptionLocalBase:     num(row.igtf_percepcion_base_bs),
            igtfPerceptionAmount:      num(row.igtf_percepcion_monto),
            confirmedAt:     row.confirmada_at ?? null,
            items,
            createdAt:       row.created_at ?? undefined,
            updatedAt:       row.updated_at ?? undefined,
        };
    }
}
