import { SupabaseClient } from '@supabase/supabase-js';
import { ITransformacionRepository } from '../../domain/repository/transformacion.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import { Transformacion } from '../../domain/transformacion';

export class RpcTransformacionRepository implements ITransformacionRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly userId: string,
    ) {}

    async findByEmpresa(empresaId: string): Promise<Result<Transformacion[]>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_transformaciones_get', {
                    p_user_id:    this.userId,
                    p_empresa_id: empresaId,
                });
            if (error) return Result.fail(error.message);
            return Result.success((data as any[] ?? []).map(this.mapToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error al obtener transformaciones');
        }
    }

    async save(transformacion: Transformacion): Promise<Result<Transformacion>> {
        try {
            const row = {
                id:                    transformacion.id ?? '',
                empresa_id:            transformacion.empresaId,
                descripcion:           transformacion.descripcion,
                fecha:                 transformacion.fecha,
                periodo:               transformacion.periodo,
                producto_terminado_id: transformacion.productoTerminadoId ?? '',
                cantidad_producida:    transformacion.cantidadProducida,
                notas:                 transformacion.notas,
            };
            const consumos = (transformacion.consumos ?? []).map((c) => ({
                producto_id:    c.productoId,
                cantidad:       c.cantidad,
                costo_unitario: c.costoUnitario,
            }));
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_transformacion_save', {
                    p_user_id:        this.userId,
                    p_transformacion: row,
                    p_consumos:       consumos,
                });
            if (error) return Result.fail(error.message);
            return Result.success(this.mapToDomain(data));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error al guardar transformación');
        }
    }

    private mapToDomain(data: any): Transformacion {
        return {
            id:                   data.id,
            empresaId:            data.empresa_id,
            descripcion:          data.descripcion ?? '',
            fecha:                data.fecha,
            periodo:              data.periodo,
            productoTerminadoId:  data.producto_terminado_id ?? null,
            cantidadProducida:    Number(data.cantidad_producida ?? 0),
            notas:                data.notas ?? '',
            createdAt:            data.created_at,
        };
    }
}
