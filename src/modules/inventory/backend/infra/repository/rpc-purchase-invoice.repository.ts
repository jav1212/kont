// rpc-purchase-invoice.repository.ts — Supabase RPC adapter for the PurchaseInvoice entity.
// Role: infrastructure — implements IPurchaseInvoiceRepository via Postgres RPC.
// Invariant: all DB RPC function names are unchanged (DB contract).
import { SupabaseClient } from '@supabase/supabase-js';
import { IPurchaseInvoiceRepository } from '../../domain/repository/purchase-invoice.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import { PurchaseInvoice, PurchaseInvoiceItem, InvoiceStatus, VatRate, ItemCurrency } from '../../domain/purchase-invoice';

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
  estado: string | null;
  subtotal: number | null;
  iva_porcentaje: number | null;
  iva_monto: number | null;
  total: number | null;
  notas: string | null;
  confirmada_at: string | null;
  items: InvoiceItemRpcRow[] | null;
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
}

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
                iva_porcentaje: invoice.vatPercentage,
                notas:          invoice.notes,
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

    private mapToDomain(row: InvoiceRpcRow): PurchaseInvoice {
        const items: PurchaseInvoiceItem[] | undefined = Array.isArray(row.items)
            ? row.items.map((i) => ({
                id:           i.id,
                invoiceId:    i.factura_id,
                productId:    i.producto_id,
                productName:  i.producto_nombre ?? undefined,
                quantity:     Number(i.cantidad ?? 0),
                unitCost:     Number(i.costo_unitario ?? 0),
                totalCost:    Number(i.costo_total ?? 0),
                vatRate:      ((i.iva_alicuota ?? 'general_16') as VatRate),
                currency:     (i.moneda === 'D' ? 'D' : 'B') as ItemCurrency,
                currencyCost: i.costo_moneda != null ? Number(i.costo_moneda) : null,
                dollarRate:   i.tasa_dolar   != null ? Number(i.tasa_dolar)   : null,
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
            status:        ((row.estado ?? 'borrador') as InvoiceStatus),
            subtotal:      Number(row.subtotal ?? 0),
            vatPercentage: Number(row.iva_porcentaje ?? 16),
            vatAmount:     Number(row.iva_monto ?? 0),
            total:         Number(row.total ?? 0),
            notes:         row.notas ?? '',
            confirmedAt:   row.confirmada_at ?? null,
            items,
            createdAt:     row.created_at ?? undefined,
            updatedAt:     row.updated_at ?? undefined,
        };
    }
}
