// rpc-department.repository.ts — Supabase RPC adapter for the Department entity.
// Role: infrastructure — implements IDepartmentRepository via Postgres RPC.
// Invariant: all DB RPC function names are unchanged (DB contract).
import { SupabaseClient } from '@supabase/supabase-js';
import { IDepartmentRepository } from '../../domain/repository/department.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import { Department } from '../../domain/department';

// Infrastructure DTO — shape of the raw Postgres RPC row returned by tenant_inventario_departamentos_get.
interface DepartmentRpcRow {
  id: string | null;
  empresa_id: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean | null;
  created_at: string | null;
}

export class RpcDepartmentRepository implements IDepartmentRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly userId: string,
    ) {}

    async findByCompany(companyId: string): Promise<Result<Department[]>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_departamentos_get', {
                    p_user_id:    this.userId,
                    p_empresa_id: companyId,
                });
            if (error) return Result.fail(error.message);
            return Result.success((data as DepartmentRpcRow[] ?? []).map(this.mapToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Failed to fetch departments');
        }
    }

    async upsert(department: Department): Promise<Result<Department>> {
        try {
            const row = {
                id:          department.id ?? '',
                empresa_id:  department.companyId,
                nombre:      department.name,
                descripcion: department.description ?? '',
                activo:      department.active,
            };
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_departamentos_upsert', {
                    p_user_id: this.userId,
                    p_data:    row,
                });
            if (error) return Result.fail(error.message);
            return Result.success(this.mapToDomain(data as DepartmentRpcRow));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Failed to save department');
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
            return Result.fail(err instanceof Error ? err.message : 'Failed to delete department');
        }
    }

    private mapToDomain(row: DepartmentRpcRow): Department {
        return {
            id:          row.id ?? undefined,
            companyId:   row.empresa_id,
            name:        row.nombre,
            description: row.descripcion ?? '',
            active:      Boolean(row.activo ?? true),
            createdAt:   row.created_at ?? undefined,
        };
    }
}
