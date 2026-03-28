import { SupabaseClient }          from "@supabase/supabase-js";
import { ISource }                  from "@/src/shared/backend/source/domain/repository/source.repository";
import { IPayrollRunRepository, SavePayrollRunInput } from "../../domain/repository/payroll-run.repository";
import { PayrollRun }               from "../../domain/payroll-run";
import { PayrollReceipt, ReceiptCalculationData } from "../../domain/payroll-receipt";
import { Result }                   from "@/src/core/domain/result";

// Raw DB row shapes for direct Supabase queries — never exported beyond this file.
interface RawPayrollRunRow {
    id:            string;
    company_id:    string;
    period_start:  string;
    period_end:    string;
    exchange_rate: number;
    status:        string;
    confirmed_at:  string;
    created_at:    string;
}

interface RawPayrollReceiptRow {
    id:               string;
    run_id:           string;
    company_id:       string;
    employee_id:      string;
    employee_cedula:  string;
    employee_nombre:  string;
    employee_cargo:   string;
    monthly_salary:   number;
    total_earnings:   number;
    total_deductions: number;
    total_bonuses:    number;
    net_pay:          number;
    calculation_data: ReceiptCalculationData | null;
    created_at:       string;
}

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
            return Result.fail(err instanceof Error ? err.message : "Error saving payroll");
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
            return Result.fail(err instanceof Error ? err.message : "Error fetching history");
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
            return Result.fail(err instanceof Error ? err.message : "Error fetching receipts");
        }
    }

    private mapRunToDomain(row: RawPayrollRunRow): PayrollRun {
        return {
            id:           row.id,
            companyId:    row.company_id,
            periodStart:  row.period_start,
            periodEnd:    row.period_end,
            exchangeRate: row.exchange_rate,
            status:       row.status,
            confirmedAt:  row.confirmed_at,
            createdAt:    row.created_at,
        };
    }

    private mapReceiptToDomain(row: RawPayrollReceiptRow): PayrollReceipt {
        return {
            id:              row.id,
            runId:           row.run_id,
            companyId:       row.company_id,
            employeeId:      row.employee_id,
            employeeCedula:  row.employee_cedula,
            employeeNombre:  row.employee_nombre,
            employeeCargo:   row.employee_cargo,
            monthlySalary:   row.monthly_salary,
            totalEarnings:   row.total_earnings,
            totalDeductions: row.total_deductions,
            totalBonuses:    row.total_bonuses,
            netPay:          row.net_pay,
            calculationData: row.calculation_data ?? { gross: 0, netUsd: 0, mondaysInMonth: 0 },
            createdAt:       row.created_at,
        };
    }
}
