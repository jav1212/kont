import { SupabaseClient } from '@supabase/supabase-js';
import { IProveedorRepository } from '../../domain/repository/proveedor.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import { Proveedor } from '../../domain/proveedor';

export class RpcProveedorRepository implements IProveedorRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly userId: string,
    ) {}

    async findByEmpresa(empresaId: string): Promise<Result<Proveedor[]>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_proveedores_get', {
                    p_user_id:    this.userId,
                    p_empresa_id: empresaId,
                });
            if (error) return Result.fail(error.message);
            return Result.success((data as any[] ?? []).map(this.mapToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error al obtener proveedores');
        }
    }

    async upsert(proveedor: Proveedor): Promise<Result<Proveedor>> {
        try {
            const row = {
                id:         proveedor.id ?? '',
                empresa_id: proveedor.empresaId,
                rif:        proveedor.rif,
                nombre:     proveedor.nombre,
                contacto:   proveedor.contacto,
                telefono:   proveedor.telefono,
                email:      proveedor.email,
                direccion:  proveedor.direccion,
                notas:      proveedor.notas,
                activo:     proveedor.activo,
            };
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_proveedores_upsert', {
                    p_user_id: this.userId,
                    p_row:     row,
                });
            if (error) return Result.fail(error.message);
            return Result.success(this.mapToDomain(data));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error al guardar proveedor');
        }
    }

    async delete(id: string): Promise<Result<void>> {
        try {
            const { error } = await this.source.instance
                .rpc('tenant_inventario_proveedores_delete', {
                    p_user_id: this.userId,
                    p_id:      id,
                });
            if (error) return Result.fail(error.message);
            return Result.success();
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error al eliminar proveedor');
        }
    }

    private mapToDomain(data: any): Proveedor {
        return {
            id:        data.id,
            empresaId: data.empresa_id,
            rif:       data.rif ?? '',
            nombre:    data.nombre,
            contacto:  data.contacto ?? '',
            telefono:  data.telefono ?? '',
            email:     data.email ?? '',
            direccion: data.direccion ?? '',
            notas:     data.notas ?? '',
            activo:    Boolean(data.activo ?? true),
            createdAt: data.created_at,
            updatedAt: data.updated_at,
        };
    }
}
