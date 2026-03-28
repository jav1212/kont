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
            return Result.success((data as Record<string, unknown>[] ?? []).map(this.mapToDomain));
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

    private mapToDomain(data: Record<string, unknown>): Transformacion {
        return {
            id:                  data.id as string | undefined,
            empresaId:           data.empresa_id as string,
            descripcion:         (data.descripcion as string | null) ?? '',
            fecha:               data.fecha as string,
            periodo:             data.periodo as string,
            productoTerminadoId: (data.producto_terminado_id as string | null) ?? null,
            cantidadProducida:   Number(data.cantidad_producida ?? 0),
            notas:               (data.notas as string | null) ?? '',
            createdAt:           data.created_at as string | undefined,
        };
    }
}
