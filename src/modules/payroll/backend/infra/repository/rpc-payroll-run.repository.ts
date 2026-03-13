import { SupabaseClient } from '@supabase/supabase-js';
import { IPayrollRunRepository, SavePayrollRunInput } from '../../domain/repository/payroll-run.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import { PayrollRun } from '../../domain/payroll-run';
import { PayrollReceipt } from '../../domain/payroll-receipt';

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
            return Result.fail(err instanceof Error ? err.message : 'Error al guardar nómina');
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
            return Result.success((data as any[] ?? []).map(this.mapRunToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error al obtener historial');
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
            return Result.success((data as any[] ?? []).map(this.mapReceiptToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error al obtener recibos');
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
