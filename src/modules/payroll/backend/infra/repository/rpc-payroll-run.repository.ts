import { SupabaseClient } from '@supabase/supabase-js';
import { IPayrollRunRepository, SavePayrollRunInput } from '../../domain/repository/payroll-run.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import { PayrollRun } from '../../domain/payroll-run';
import { PayrollReceipt, ReceiptCalculationData } from '../../domain/payroll-receipt';

// Raw DB row shapes returned by tenant_payroll_* RPCs — never exported beyond this file.
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

export class RpcPayrollRunRepository implements IPayrollRunRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly userId: string,
    ) {}

    async save(input: SavePayrollRunInput): Promise<Result<string>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_payroll_run_save', {
                    p_user_id: this.userId,
                    p_run:     input.run,
                    p_receipts: input.receipts,
                });
            if (error) return Result.fail(error.message);
            return Result.success(data as string);
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error saving payroll');
        }
    }

    async findByCompany(companyId: string): Promise<Result<PayrollRun[]>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_payroll_runs_by_company', {
                    p_user_id:    this.userId,
                    p_company_id: companyId,
                });
            if (error) return Result.fail(error.message);
            return Result.success(((data as RawPayrollRunRow[]) ?? []).map(this.mapRunToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error fetching history');
        }
    }

    async findReceiptsByRun(runId: string): Promise<Result<PayrollReceipt[]>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_payroll_receipts_by_run', {
                    p_user_id: this.userId,
                    p_run_id:  runId,
                });
            if (error) return Result.fail(error.message);
            return Result.success(((data as RawPayrollReceiptRow[]) ?? []).map(this.mapReceiptToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error fetching receipts');
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
