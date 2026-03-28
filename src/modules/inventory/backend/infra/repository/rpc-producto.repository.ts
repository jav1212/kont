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
            return Result.success((data as Record<string, unknown>[] ?? []).map(this.mapToDomain));
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
                costo_promedio:   producto.costoPromedio,
                activo:           producto.activo,
                departamento_id:  producto.departamentoId ?? null,
                iva_tipo:         producto.ivaTipo ?? 'general',
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

    private mapToDomain(data: Record<string, unknown>): Producto {
        return {
            id:                 data.id as string | undefined,
            empresaId:          data.empresa_id as string,
            codigo:             (data.codigo as string | null) ?? '',
            nombre:             data.nombre as string,
            descripcion:        (data.descripcion as string | null) ?? '',
            tipo:               data.tipo as import('../../domain/producto').TipoProducto,
            unidadMedida:       data.unidad_medida as import('../../domain/producto').UnidadMedida,
            metodoValuacion:    data.metodo_valuacion as import('../../domain/producto').MetodoValuacion,
            existenciaActual:   Number(data.existencia_actual ?? 0),
            costoPromedio:      Number(data.costo_promedio ?? 0),
            activo:             Boolean(data.activo ?? true),
            departamentoId:     data.departamento_id != null ? String(data.departamento_id) : undefined,
            departamentoNombre: data.departamento_nombre != null ? String(data.departamento_nombre) : undefined,
            ivaTipo:            (data.iva_tipo === 'exento' ? 'exento' : 'general') as import('../../domain/producto').IvaTipo,
            createdAt:          data.created_at as string | undefined,
            updatedAt:          data.updated_at as string | undefined,
        };
    }
}
