import { SupabaseClient } from '@supabase/supabase-js';
import { IMovimientoRepository } from '../../domain/repository/movimiento.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import { Movimiento, KardexEntry } from '../../domain/movimiento';

export class RpcMovimientoRepository implements IMovimientoRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly userId: string,
    ) {}

    async findByEmpresa(empresaId: string, periodo?: string): Promise<Result<Movimiento[]>> {
        try {
            const params: Record<string, unknown> = {
                p_user_id:    this.userId,
                p_empresa_id: empresaId,
            };
            if (periodo) params['p_periodo'] = periodo;

            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_movimientos_get', params);
            if (error) return Result.fail(error.message);
            return Result.success((data as Record<string, unknown>[] ?? []).map(this.mapToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error al obtener movimientos');
        }
    }

    async save(movimiento: Movimiento): Promise<Result<Movimiento>> {
        try {
            const row = {
                id:                    movimiento.id ?? '',
                empresa_id:            movimiento.empresaId,
                producto_id:           movimiento.productoId,
                tipo:                  movimiento.tipo,
                fecha:                 movimiento.fecha,
                periodo:               movimiento.periodo,
                cantidad:              movimiento.cantidad,
                costo_unitario:        movimiento.costoUnitario,
                costo_total:           movimiento.costoTotal,
                saldo_cantidad:        movimiento.saldoCantidad,
                referencia:            movimiento.referencia,
                notas:                 movimiento.notas,
                transformacion_id:     movimiento.transformacionId ?? null,
                moneda:       movimiento.moneda ?? 'B',
                costo_moneda: movimiento.costoMoneda ?? null,
                tasa_dolar:   movimiento.tasaDolar ?? null,
            };
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_movimientos_save', {
                    p_user_id: this.userId,
                    p_row:     row,
                });
            if (error) return Result.fail(error.message);
            return Result.success(this.mapToDomain(data));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error al guardar movimiento');
        }
    }

    async getKardex(empresaId: string, productoId: string): Promise<Result<KardexEntry[]>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_kardex', {
                    p_user_id:     this.userId,
                    p_empresa_id:  empresaId,
                    p_producto_id: productoId,
                });
            if (error) return Result.fail(error.message);
            return Result.success((data as Record<string, unknown>[] ?? []).map(this.mapToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error al obtener kardex');
        }
    }

    async delete(id: string): Promise<Result<void>> {
        try {
            const { error } = await this.source.instance
                .rpc('tenant_inventario_movimiento_delete', {
                    p_user_id: this.userId,
                    p_id:      id,
                });
            if (error) return Result.fail(error.message);
            return Result.success(undefined);
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error al eliminar movimiento');
        }
    }

    async updateMeta(id: string, fecha: string, referencia: string, notas: string): Promise<Result<Movimiento>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_movimiento_update_meta', {
                    p_user_id:    this.userId,
                    p_id:         id,
                    p_fecha:      fecha,
                    p_referencia: referencia,
                    p_notas:      notas,
                });
            if (error) return Result.fail(error.message);
            return Result.success(this.mapToDomain(data));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error al actualizar movimiento');
        }
    }

    private mapToDomain(data: Record<string, unknown>): Movimiento {
        return {
            id:               data.id,
            empresaId:        data.empresa_id,
            productoId:       data.producto_id,
            tipo:             data.tipo,
            fecha:            data.fecha,
            periodo:          data.periodo,
            cantidad:         Number(data.cantidad ?? 0),
            costoUnitario:    Number(data.costo_unitario ?? 0),
            costoTotal:       Number(data.costo_total ?? 0),
            saldoCantidad:    Number(data.saldo_cantidad ?? 0),
            referencia:           data.referencia ?? '',
            notas:                data.notas ?? '',
            transformacionId:     data.transformacion_id ?? null,
            moneda:               (data.moneda === 'D' ? 'D' : 'B') as 'B' | 'D',
            costoMoneda:  data.costo_moneda != null ? Number(data.costo_moneda) : null,
            tasaDolar:    data.tasa_dolar   != null ? Number(data.tasa_dolar)   : null,
            createdAt:    data.created_at,
        };
    }
}
