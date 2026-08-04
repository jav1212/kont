import { SupabaseClient } from '@supabase/supabase-js';
import { Result } from '@/src/core/domain/result';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Employee, EmployeeEstado, EmployeeMoneda, SalaryHistoryEntry } from '../../domain/employee';
import { IEmployeeRepository } from '../../domain/repository/employee.repository';

type RawEmployee = {
    id: string; company_id: string; cedula: string; nombre: string; cargo: string;
    salario_mensual: number; moneda: string | null; estado: string;
    fecha_ingreso: string | null; porcentaje_islr: number | null;
    tarifa_hora: number | null; modalidad_pago: string | null;
    tarifa_hora_moneda: string | null;
};

/** Shared-schema adapter for the employees pilot. */
export class SharedEmployeeRepository implements IEmployeeRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly tenantId: string,
    ) {}

    async findByCompany(companyId: string): Promise<Result<Employee[]>> {
        try {
            const { data, error } = await this.source.instance
                .from('shared_employees').select('*')
                .eq('tenant_id', this.tenantId).eq('company_id', companyId)
                .order('nombre', { ascending: true });
            if (error) return Result.fail(error.message);
            return Result.success(((data as RawEmployee[]) ?? []).map(row => this.mapToDomain(row)));
        } catch (error) {
            return Result.fail(error instanceof Error ? error.message : 'Fetch error');
        }
    }

    async upsertByCedula(employees: Employee[]): Promise<Result<void>> {
        if (employees.length === 0) return Result.success();
        try {
            const rows = employees.map(employee => ({
                tenant_id: this.tenantId,
                id: employee.cedula,
                company_id: employee.companyId,
                cedula: employee.cedula,
                nombre: employee.nombre,
                cargo: employee.cargo,
                salario_mensual: employee.salarioMensual,
                estado: employee.estado,
                moneda: employee.moneda ?? 'VES',
                fecha_ingreso: employee.fechaIngreso ?? null,
                porcentaje_islr: employee.porcentajeIslr ?? 0,
                tarifa_hora: employee.tarifaHora ?? 0,
                modalidad_pago: employee.modalidadPago ?? 'diario',
                tarifa_hora_moneda: employee.tarifaHoraMoneda ?? 'VES',
            }));
            const { error } = await this.source.instance
                .from('shared_employees').upsert(rows, { onConflict: 'tenant_id,id' });
            return error ? Result.fail(error.message) : Result.success();
        } catch (error) {
            return Result.fail(error instanceof Error ? error.message : 'Upsert error');
        }
    }

    async deleteByIds(ids: string[]): Promise<Result<void>> {
        if (ids.length === 0) return Result.success();
        try {
            const { error } = await this.source.instance
                .from('shared_employees').delete()
                .eq('tenant_id', this.tenantId).in('id', ids);
            return error ? Result.fail(error.message) : Result.success();
        } catch (error) {
            return Result.fail(error instanceof Error ? error.message : 'Delete error');
        }
    }

    async renameCedula(companyId: string, oldCedula: string, newCedula: string): Promise<Result<void>> {
        try {
            const { error } = await this.source.instance
                .from('shared_employees')
                .update({ id: newCedula, cedula: newCedula })
                .eq('tenant_id', this.tenantId)
                .eq('company_id', companyId)
                .eq('id', oldCedula);
            return error ? Result.fail(error.message) : Result.success();
        } catch (error) {
            return Result.fail(error instanceof Error ? error.message : 'Rename cedula error');
        }
    }

    async getSalaryHistory(companyId: string, cedula: string): Promise<Result<SalaryHistoryEntry[]>> {
        try {
            const { data, error } = await this.source.instance
                .from('shared_employee_salary_history').select('*')
                .eq('tenant_id', this.tenantId)
                .eq('company_id', companyId)
                .eq('employee_cedula', cedula)
                .order('fecha_desde', { ascending: false });
            if (error) return Result.fail(error.message);
            return Result.success((data ?? []).map(row => ({
                id: row.id,
                salarioMensual: Number(row.salario_mensual),
                moneda: row.moneda as EmployeeMoneda,
                fechaDesde: row.fecha_desde,
                createdAt: row.created_at,
            })));
        } catch (error) {
            return Result.fail(error instanceof Error ? error.message : 'History fetch error');
        }
    }

    private mapToDomain(row: RawEmployee): Employee {
        return {
            id: row.id,
            companyId: row.company_id,
            cedula: row.cedula,
            nombre: row.nombre,
            cargo: row.cargo,
            salarioMensual: Number(row.salario_mensual),
            moneda: (row.moneda ?? 'VES') as EmployeeMoneda,
            estado: row.estado as EmployeeEstado,
            fechaIngreso: row.fecha_ingreso,
            porcentajeIslr: row.porcentaje_islr == null ? 0 : Number(row.porcentaje_islr),
            tarifaHora: row.tarifa_hora == null ? 0 : Number(row.tarifa_hora),
            modalidadPago: row.modalidad_pago === 'hora' ? 'hora' : 'diario',
            tarifaHoraMoneda: (row.tarifa_hora_moneda ?? 'VES') as Employee['tarifaHoraMoneda'],
        };
    }
}
