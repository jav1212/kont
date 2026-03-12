// src/backend/employee/infra/repository/supabase-employee.repository.ts

import { SupabaseClient } from "@supabase/supabase-js";
import { ISource } from "@/src/shared/backend/source/domain/repository/source.repository";
import { IEmployeeRepository } from "../../domain/repository/employee.repository";
import { Employee } from "../../domain/employee";
import { Result } from "@/src/core/domain/result";

export class SupabaseEmployeeRepository implements IEmployeeRepository {
    private readonly TABLE = "employees";

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
                id:              e.cedula,          // cedula es el PK
                company_id:      e.companyId,
                cedula:          e.cedula,
                nombre:          e.nombre,
                cargo:           e.cargo,
                salario_mensual: e.salarioMensual,
                estado:          e.estado,
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