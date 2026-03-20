import { SupabaseClient } from '@supabase/supabase-js';
import { IProductoRepository } from '../../domain/repository/producto.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import { Producto } from '../../domain/producto';

export class RpcProductoRepository implements IProductoRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly userId: string,
    ) {}

    async findByEmpresa(empresaId: string): Promise<Result<Producto[]>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_productos_get', {
                    p_user_id:    this.userId,
                    p_empresa_id: empresaId,
                });
            if (error) return Result.fail(error.message);
            return Result.success((data as any[] ?? []).map(this.mapToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error al obtener productos');
        }
    }

    async upsert(producto: Producto): Promise<Result<Producto>> {
        try {
            const row = {
                id:               producto.id ?? '',
                empresa_id:       producto.empresaId,
                codigo:           producto.codigo,
                nombre:           producto.nombre,
                descripcion:      producto.descripcion,
                tipo:             producto.tipo,
                unidad_medida:    producto.unidadMedida,
                metodo_valuacion: producto.metodoValuacion,
                existencia_actual: producto.existenciaActual,
                existencia_minima: producto.existenciaMinima,
                costo_promedio:   producto.costoPromedio,
                activo:           producto.activo,
            };
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_productos_upsert', {
                    p_user_id: this.userId,
                    p_row:     row,
                });
            if (error) return Result.fail(error.message);
            return Result.success(this.mapToDomain(data));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error al guardar producto');
        }
    }

    async delete(id: string): Promise<Result<void>> {
        try {
            const { error } = await this.source.instance
                .rpc('tenant_inventario_productos_delete', {
                    p_user_id: this.userId,
                    p_id:      id,
                });
            if (error) return Result.fail(error.message);
            return Result.success();
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error al eliminar producto');
        }
    }

    private mapToDomain(data: any): Producto {
        return {
            id:               data.id,
            empresaId:        data.empresa_id,
            codigo:           data.codigo ?? '',
            nombre:           data.nombre,
            descripcion:      data.descripcion ?? '',
            tipo:             data.tipo,
            unidadMedida:     data.unidad_medida,
            metodoValuacion:  data.metodo_valuacion,
            existenciaActual: Number(data.existencia_actual ?? 0),
            existenciaMinima: Number(data.existencia_minima ?? 0),
            costoPromedio:    Number(data.costo_promedio ?? 0),
            activo:           Boolean(data.activo ?? true),
            createdAt:        data.created_at,
            updatedAt:        data.updated_at,
        };
    }
}
