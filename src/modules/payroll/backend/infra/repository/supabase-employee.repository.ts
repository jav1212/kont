import { SupabaseClient } from "@supabase/supabase-js";
import { ISource } from "@/src/shared/backend/source/domain/repository/source.repository";
import { IEmployeeRepository } from "../../domain/repository/employee.repository";
import { Employee, SalaryHistoryEntry } from "../../domain/employee";
import { Result } from "@/src/core/domain/result";

export class SupabaseEmployeeRepository implements IEmployeeRepository {
    private readonly TABLE         = "employees";
    private readonly HISTORY_TABLE = "employee_salary_history";

    constructor(private readonly source: ISource<SupabaseClient>) {}

    async findByCompany(companyId: string): Promise<Result<Employee[]>> {
        try {
            const { data, error } = await this.source.instance
                .from(this.TABLE)
                .select("*")
                .eq("company_id", companyId)
                .order("nombre", { ascending: true });

            if (error) return Result.fail(error.message);
            return Result.success((data ?? []).map(this.mapToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : "Fetch error");
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
            }));

            const { error } = await this.source.instance
                .from(this.TABLE)
                .upsert(rows, { onConflict: "id", ignoreDuplicates: false });

            if (error) return Result.fail(error.message);
            return Result.success();
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : "Upsert error");
        }
    }

    async deleteByIds(ids: string[]): Promise<Result<void>> {
        try {
            if (ids.length === 0) return Result.success();
            const { error } = await this.source.instance
                .from(this.TABLE)
                .delete()
                .in("id", ids);
            if (error) return Result.fail(error.message);
            return Result.success();
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : "Delete error");
        }
    }

    async getSalaryHistory(companyId: string, cedula: string): Promise<Result<SalaryHistoryEntry[]>> {
        try {
            const { data, error } = await this.source.instance
                .from(this.HISTORY_TABLE)
                .select("id, salario_mensual, moneda, fecha_desde, created_at")
                .eq("company_id", companyId)
                .eq("employee_cedula", cedula)
                .order("fecha_desde", { ascending: false });

            if (error) return Result.fail(error.message);
            return Result.success((data ?? []).map((r: any) => ({
                id:             r.id,
                salarioMensual: r.salario_mensual,
                moneda:         r.moneda,
                fechaDesde:     r.fecha_desde,
                createdAt:      r.created_at,
            })));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : "History fetch error");
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
            moneda:         data.moneda ?? "VES",
            estado:         data.estado,
            fechaIngreso:   data.fecha_ingreso ?? null,
        };
    }
}
