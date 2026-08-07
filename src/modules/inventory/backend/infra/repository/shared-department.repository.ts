import { SupabaseClient } from '@supabase/supabase-js';
import { Result } from '@/src/core/domain/result';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Department } from '../../domain/department';
import { IDepartmentRepository } from '../../domain/repository/department.repository';

type RawDepartment = {
    id: string | null;
    company_id: string;
    name: string;
    description: string | null;
    active: boolean | null;
    created_at: string | null;
};

export class SharedDepartmentRepository implements IDepartmentRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly tenantId: string,
    ) {}

    async findByCompany(companyId: string): Promise<Result<Department[]>> {
        try {
            const { data, error } = await this.source.instance
                .from('shared_inventory_departments').select('*')
                .eq('tenant_id', this.tenantId).eq('company_id', companyId)
                .order('name', { ascending: true });
            if (error) return Result.fail(error.message);
            return Result.success(((data as RawDepartment[]) ?? []).map(row => this.map(row)));
        } catch (error) {
            return Result.fail(error instanceof Error ? error.message : 'Failed to fetch departments');
        }
    }

    async upsert(department: Department): Promise<Result<Department>> {
        try {
            const row = {
                tenant_id: this.tenantId,
                id: department.id ?? crypto.randomUUID(),
                company_id: department.companyId,
                name: department.name,
                description: department.description ?? '',
                active: department.active,
            };
            const { data, error } = await this.source.instance
                .from('shared_inventory_departments').upsert(row, { onConflict: 'tenant_id,id' })
                .select('*').single();
            if (error) return Result.fail(error.message);
            return Result.success(this.map(data as RawDepartment));
        } catch (error) {
            return Result.fail(error instanceof Error ? error.message : 'Failed to save department');
        }
    }

    async delete(id: string): Promise<Result<void>> {
        try {
            const { error } = await this.source.instance
                .from('shared_inventory_departments').delete()
                .eq('tenant_id', this.tenantId).eq('id', id);
            return error ? Result.fail(error.message) : Result.success();
        } catch (error) {
            return Result.fail(error instanceof Error ? error.message : 'Failed to delete department');
        }
    }

    private map(row: RawDepartment): Department {
        return {
            id: row.id ?? undefined,
            companyId: row.company_id,
            name: row.name,
            description: row.description ?? '',
            active: Boolean(row.active ?? true),
            createdAt: row.created_at ?? undefined,
        };
    }
}
