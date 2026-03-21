import { SupabaseClient } from '@supabase/supabase-js';
import { IFacturaCompraRepository } from '../../domain/repository/factura-compra.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import { FacturaCompra, FacturaCompraItem, EstadoFactura, IvaAlicuota } from '../../domain/factura-compra';

export class RpcFacturaCompraRepository implements IFacturaCompraRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly userId: string,
    ) {}

    async findByEmpresa(empresaId: string): Promise<Result<FacturaCompra[]>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_facturas_get', {
                    p_user_id:    this.userId,
                    p_empresa_id: empresaId,
                });
            if (error) return Result.fail(error.message);
            return Result.success((data as any[] ?? []).map(this.mapToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error al obtener facturas');
        }
    }

    async findById(facturaId: string): Promise<Result<FacturaCompra>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_factura_get', {
                    p_user_id:    this.userId,
                    p_factura_id: facturaId,
                });
            if (error) return Result.fail(error.message);
            if (!data) return Result.fail('Factura no encontrada');
            return Result.success(this.mapToDomain(data));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error al obtener factura');
        }
    }

    async save(factura: FacturaCompra, items: FacturaCompraItem[]): Promise<Result<FacturaCompra>> {
        try {
            const facturaRow = {
                id:              factura.id ?? '',
                empresa_id:      factura.empresaId,
                proveedor_id:    factura.proveedorId,
                numero_factura:  factura.numeroFactura,
                numero_control:  factura.numeroControl ?? '',
                fecha:           factura.fecha,
                iva_porcentaje:  factura.ivaPorcentaje,
                notas:           factura.notas,
            };
            const itemsRow = items.map((i) => ({
                producto_id:    i.productoId,
                cantidad:       i.cantidad,
                costo_unitario: i.costoUnitario,
                costo_total:    i.costoTotal,
                iva_alicuota:   i.ivaAlicuota ?? 'general_16',
                moneda:         i.moneda ?? 'B',
                costo_moneda:   i.costoMoneda ?? null,
                tasa_dolar:     i.tasaDolar ?? null,
            }));
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_factura_save', {
                    p_user_id: this.userId,
                    p_factura: facturaRow,
                    p_items:   itemsRow,
                });
            if (error) return Result.fail(error.message);
            return Result.success(this.mapToDomain(data));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error al guardar factura');
        }
    }

    async delete(facturaId: string): Promise<Result<void>> {
        try {
            const { error } = await this.source.instance
                .rpc('tenant_inventario_factura_delete', {
                    p_user_id:    this.userId,
                    p_factura_id: facturaId,
                });
            if (error) return Result.fail(error.message);
            return Result.success(undefined);
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error al eliminar factura');
        }
    }

    async confirmar(facturaId: string): Promise<Result<FacturaCompra>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_factura_confirmar', {
                    p_user_id:    this.userId,
                    p_factura_id: facturaId,
                });
            if (error) return Result.fail(error.message);
            return Result.success(this.mapToDomain(data));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error al confirmar factura');
        }
    }

    private mapToDomain(data: any): FacturaCompra {
        const items: FacturaCompraItem[] | undefined = data.items
            ? (data.items as any[]).map((i: any) => ({
                  id:             i.id,
                  facturaId:      i.factura_id,
                  productoId:     i.producto_id,
                  productoNombre: i.producto_nombre,
                  cantidad:       Number(i.cantidad ?? 0),
                  costoUnitario:  Number(i.costo_unitario ?? 0),
                  costoTotal:     Number(i.costo_total ?? 0),
                  ivaAlicuota:    (i.iva_alicuota ?? 'general_16') as IvaAlicuota,
                  moneda:         (i.moneda === 'D' ? 'D' : 'B') as import('../../domain/factura-compra').MonedaItem,
                  costoMoneda:    i.costo_moneda != null ? Number(i.costo_moneda) : null,
                  tasaDolar:      i.tasa_dolar   != null ? Number(i.tasa_dolar)   : null,
              }))
            : undefined;

        return {
            id:              data.id,
            empresaId:       data.empresa_id,
            proveedorId:     data.proveedor_id,
            proveedorNombre: data.proveedor_nombre,
            numeroFactura:   data.numero_factura ?? '',
            numeroControl:   data.numero_control ?? '',
            fecha:           data.fecha,
            periodo:         data.periodo,
            estado:          (data.estado ?? 'borrador') as EstadoFactura,
            subtotal:        Number(data.subtotal ?? 0),
            ivaPorcentaje:   Number(data.iva_porcentaje ?? 16),
            ivaMonto:        Number(data.iva_monto ?? 0),
            total:           Number(data.total ?? 0),
            notas:           data.notas ?? '',
            confirmadaAt:    data.confirmada_at ?? null,
            items,
            createdAt:       data.created_at,
            updatedAt:       data.updated_at,
        };
    }
}
