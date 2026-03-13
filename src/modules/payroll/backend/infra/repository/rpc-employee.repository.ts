import { SupabaseClient } from '@supabase/supabase-js';
import { IEmployeeRepository } from '../../domain/repository/employee.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import { Employee } from '../../domain/employee';

export class RpcEmployeeRepository implements IEmployeeRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly userId: string,
    ) {}

    async findByCompany(companyId: string): Promise<Result<Employee[]>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_employees_get_by_company', {
                    p_user_id:    this.userId,
                    p_company_id: companyId,
                });
            if (error) return Result.fail(error.message);
            return Result.success((data as any[] ?? []).map(this.mapToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Fetch error');
        }
    }

    async upsertByCedula(employees: Employee[]): Promise<Result<void>> {
        try {
            if (employees.length === 0) return Result.success();
            const rows = employees.map((e) => ({
                id:              e.cedula,
                company_id:      e.companyId,
                cedula:          e.cedula,
                nombre:          e.nombre,
                cargo:           e.cargo,
                salario_mensual: e.salarioMensual,
                estado:          e.estado,
            }));
            const { error } = await this.source.instance
                .rpc('tenant_employees_upsert', {
                    p_user_id:   this.userId,
                    p_employees: rows,
                });
            if (error) return Result.fail(error.message);
            return Result.success();
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Upsert error');
        }
    }

    async deleteByIds(ids: string[]): Promise<Result<void>> {
        try {
            if (ids.length === 0) return Result.success();
            const { error } = await this.source.instance
                .rpc('tenant_employees_delete', {
                    p_user_id: this.userId,
                    p_ids:     ids,
                });
            if (error) return Result.fail(error.message);
            return Result.success();
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Delete error');
        }
    }

    private mapToDomain(data: any): Employee {
        return {
            id:             data.id,
            companyId:      data.company_id,
            cedula:         data.cedula,
            nombre:         data.nombre,
            cargo:          data.cargo,
            salarioMensual: data.salario_mensual,
            estado:         data.estado,
        };
    }
}
