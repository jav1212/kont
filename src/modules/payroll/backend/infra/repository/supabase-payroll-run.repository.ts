import { SupabaseClient }          from "@supabase/supabase-js";
import { ISource }                  from "@/src/shared/backend/source/domain/repository/source.repository";
import { IPayrollRunRepository, SavePayrollRunInput } from "../../domain/repository/payroll-run.repository";
import { PayrollRun }               from "../../domain/payroll-run";
import { PayrollReceipt }           from "../../domain/payroll-receipt";
import { Result }                   from "@/src/core/domain/result";

export class SupabasePayrollRunRepository implements IPayrollRunRepository {
    private readonly RUNS_TABLE     = "payroll_runs";
    private readonly RECEIPTS_TABLE = "payroll_receipts";

    constructor(private readonly source: ISource<SupabaseClient>) {}

    async save(input: SavePayrollRunInput): Promise<Result<string>> {
        try {
            const { run, receipts } = input;

            // Generate IDs (Supabase text PK)
            const runId = crypto.randomUUID();

            const { error: runError } = await this.source.instance
                .from(this.RUNS_TABLE)
                .insert({
                    id:           runId,
                    company_id:   run.companyId,
                    period_start: run.periodStart,
                    period_end:   run.periodEnd,
                    exchange_rate: run.exchangeRate,
                    status:       "confirmed",
                });

            if (runError) return Result.fail(runError.message);

            const rows = receipts.map((r) => ({
                id:               crypto.randomUUID(),
                run_id:           runId,
                company_id:       r.companyId,
                employee_id:      r.employeeId ?? r.employeeCedula,
                employee_cedula:  r.employeeCedula,
                employee_nombre:  r.employeeNombre,
                employee_cargo:   r.employeeCargo,
                monthly_salary:   r.monthlySalary,
                total_earnings:   r.totalEarnings,
                total_deductions: r.totalDeductions,
                total_bonuses:    r.totalBonuses,
                net_pay:          r.netPay,
                calculation_data: r.calculationData,
            }));

            const { error: receiptError } = await this.source.instance
                .from(this.RECEIPTS_TABLE)
                .insert(rows);

            if (receiptError) return Result.fail(receiptError.message);

            return Result.success(runId);
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : "Error al guardar nómina");
        }
    }

    async findByCompany(companyId: string): Promise<Result<PayrollRun[]>> {
        try {
            const { data, error } = await this.source.instance
                .from(this.RUNS_TABLE)
                .select("*")
                .eq("company_id", companyId)
                .order("confirmed_at", { ascending: false });

            if (error) return Result.fail(error.message);
            return Result.success((data ?? []).map(this.mapRunToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : "Error al obtener historial");
        }
    }

    async findReceiptsByRun(runId: string): Promise<Result<PayrollReceipt[]>> {
        try {
            const { data, error } = await this.source.instance
                .from(this.RECEIPTS_TABLE)
                .select("*")
                .eq("run_id", runId)
                .order("employee_nombre", { ascending: true });

            if (error) return Result.fail(error.message);
            return Result.success((data ?? []).map(this.mapReceiptToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : "Error al obtener recibos");
        }
    }

    private mapRunToDomain(data: any): PayrollRun {
        return {
            id:           data.id,
            companyId:    data.company_id,
            periodStart:  data.period_start,
            periodEnd:    data.period_end,
            exchangeRate: data.exchange_rate,
            status:       data.status,
            confirmedAt:  data.confirmed_at,
            createdAt:    data.created_at,
        };
    }

    private mapReceiptToDomain(data: any): PayrollReceipt {
        return {
            id:              data.id,
            runId:           data.run_id,
            companyId:       data.company_id,
            employeeId:      data.employee_id,
            employeeCedula:  data.employee_cedula,
            employeeNombre:  data.employee_nombre,
            employeeCargo:   data.employee_cargo,
            monthlySalary:   data.monthly_salary,
            totalEarnings:   data.total_earnings,
            totalDeductions: data.total_deductions,
            totalBonuses:    data.total_bonuses,
            netPay:          data.net_pay,
            calculationData: data.calculation_data ?? { gross: 0, netUsd: 0, mondaysInMonth: 0 },
            createdAt:       data.created_at,
        };
    }
}
