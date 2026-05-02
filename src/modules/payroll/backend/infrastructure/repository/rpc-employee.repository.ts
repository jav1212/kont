// Infrastructure layer — Supabase RPC implementation of IEmployeeRepository.
import { SupabaseClient } from '@supabase/supabase-js';
import { IEmployeeRepository } from '../../domain/repository/employee.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import { Employee, SalaryHistoryEntry } from '../../domain/employee';

// Raw DB row shapes returned by tenant_employees_* RPCs — never exported beyond this file.
import { EmployeeMoneda, EmployeeEstado } from '../../domain/employee';

// Raw DB row shapes returned by tenant_employees_* RPCs — never exported beyond this file.
interface RawEmployeeRow {
    id:              string;
    company_id:      string;
    cedula:          string;
    nombre:          string;
    cargo:           string;
    salario_mensual: number;
    moneda:          string | null;
    estado:          string;
    fecha_ingreso:   string | null;
    porcentaje_islr: number | null;
}

interface RawSalaryHistoryRow {
    id:              string;
    salario_mensual: number;
    moneda:          string;
    fecha_desde:     string;
    created_at:      string;
}

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
            return Result.success(((data as RawEmployeeRow[]) ?? []).map(this.mapToDomain));
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
                moneda:          e.moneda ?? "VES",
                fecha_ingreso:   e.fechaIngreso ?? null,
                porcentaje_islr: e.porcentajeIslr ?? 0,
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

    async renameCedula(companyId: string, oldCedula: string, newCedula: string): Promise<Result<void>> {
        try {
            const { error } = await this.source.instance
                .rpc('tenant_employees_rename_cedula', {
                    p_user_id:    this.userId,
                    p_company_id: companyId,
                    p_old_cedula: oldCedula,
                    p_new_cedula: newCedula,
                });
            if (error) return Result.fail(error.message);
            return Result.success();
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Rename cedula error');
        }
    }

    async getSalaryHistory(companyId: string, cedula: string): Promise<Result<SalaryHistoryEntry[]>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_employee_salary_history', {
                    p_user_id:          this.userId,
                    p_company_id:       companyId,
                    p_employee_cedula:  cedula,
                });
            if (error) return Result.fail(error.message);
            return Result.success(((data as RawSalaryHistoryRow[]) ?? []).map((r): SalaryHistoryEntry => ({
                id:             r.id,
                salarioMensual: r.salario_mensual,
                moneda:         r.moneda as EmployeeMoneda,
                fechaDesde:     r.fecha_desde,
                createdAt:      r.created_at,
            })));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'History fetch error');
        }
    }

    private mapToDomain(row: RawEmployeeRow): Employee {
        return {
            id:             row.id,
            companyId:      row.company_id,
            cedula:         row.cedula,
            nombre:         row.nombre,
            cargo:          row.cargo,
            salarioMensual: row.salario_mensual,
            moneda:         (row.moneda ?? "VES") as EmployeeMoneda,
            estado:         row.estado as EmployeeEstado,
            fechaIngreso:   row.fecha_ingreso ?? null,
            porcentajeIslr: row.porcentaje_islr != null ? Number(row.porcentaje_islr) : 0,
        };
    }
}
