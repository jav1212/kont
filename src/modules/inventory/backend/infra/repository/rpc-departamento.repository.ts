import { SupabaseClient } from '@supabase/supabase-js';
import { IDepartamentoRepository } from '../../domain/repository/departamento.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import { Departamento } from '../../domain/departamento';

export class RpcDepartamentoRepository implements IDepartamentoRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly userId: string,
    ) {}

    async findByEmpresa(empresaId: string): Promise<Result<Departamento[]>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_departamentos_get', {
                    p_user_id:    this.userId,
                    p_empresa_id: empresaId,
                });
            if (error) return Result.fail(error.message);
            return Result.success((data as any[] ?? []).map(this.mapToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error al obtener departamentos');
        }
    }

    async upsert(departamento: Departamento): Promise<Result<Departamento>> {
        try {
            const row = {
                id:          departamento.id ?? '',
                empresa_id:  departamento.empresaId,
                nombre:      departamento.nombre,
                descripcion: departamento.descripcion ?? '',
                activo:      departamento.activo,
            };
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_departamentos_upsert', {
                    p_user_id: this.userId,
                    p_data:    row,
                });
            if (error) return Result.fail(error.message);
            return Result.success(this.mapToDomain(data));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error al guardar departamento');
        }
    }

    async delete(id: string): Promise<Result<void>> {
        try {
            const { error } = await this.source.instance
                .rpc('tenant_inventario_departamentos_delete', {
                    p_user_id: this.userId,
                    p_id:      id,
                });
            if (error) return Result.fail(error.message);
            return Result.success();
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error al eliminar departamento');
        }
    }

    private mapToDomain(data: any): Departamento {
        return {
            id:          data.id,
            empresaId:   data.empresa_id,
            nombre:      data.nombre,
            descripcion: data.descripcion ?? '',
            activo:      Boolean(data.activo ?? true),
            createdAt:   data.created_at,
        };
    }
}
