import { SupabaseClient } from '@supabase/supabase-js';
import { Result } from '@/src/core/domain/result';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { PayrollRun } from '../../domain/payroll-run';
import { PayrollReceipt, ReceiptCalculationData } from '../../domain/payroll-receipt';
import { IPayrollRunRepository, SavePayrollRunInput, UnconfirmedRun } from '../../domain/repository/payroll-run.repository';

type RawRun = { id: string; company_id: string; period_start: string; period_end: string; exchange_rate: number; status: string; confirmed_at: string; created_at: string };
type RawReceipt = { id: string; run_id: string; company_id: string; employee_id: string; employee_cedula: string; employee_nombre: string; employee_cargo: string; monthly_salary: number; total_earnings: number; total_deductions: number; total_bonuses: number; net_pay: number; calculation_data: ReceiptCalculationData | null; created_at: string };

/** Shared-schema adapter for the payroll history pilot. */
export class SharedPayrollRunRepository implements IPayrollRunRepository {
    constructor(private readonly source: ISource<SupabaseClient>, private readonly tenantId: string) {}

    async save(input: SavePayrollRunInput): Promise<Result<string>> {
        const runId = crypto.randomUUID();
        try {
            const { error: runError } = await this.source.instance.from('shared_payroll_runs').insert({
                tenant_id: this.tenantId,
                id: runId,
                company_id: input.run.companyId,
                period_start: input.run.periodStart,
                period_end: input.run.periodEnd,
                exchange_rate: input.run.exchangeRate,
                status: input.run.status ?? 'confirmed',
            });
            if (runError) return Result.fail(runError.message);

            const receipts = input.receipts.map(receipt => ({
                tenant_id: this.tenantId,
                id: crypto.randomUUID(),
                run_id: runId,
                company_id: receipt.companyId,
                employee_id: receipt.employeeId ?? receipt.employeeCedula,
                employee_cedula: receipt.employeeCedula,
                employee_nombre: receipt.employeeNombre,
                employee_cargo: receipt.employeeCargo,
                monthly_salary: receipt.monthlySalary,
                total_earnings: receipt.totalEarnings,
                total_deductions: receipt.totalDeductions,
                total_bonuses: receipt.totalBonuses,
                net_pay: receipt.netPay,
                calculation_data: receipt.calculationData,
            }));
            if (receipts.length > 0) {
                const { error: receiptError } = await this.source.instance.from('shared_payroll_receipts').insert(receipts);
                if (receiptError) {
                    await this.source.instance.from('shared_payroll_runs').delete().eq('tenant_id', this.tenantId).eq('id', runId);
                    return Result.fail(receiptError.message);
                }
            }
            return Result.success(runId);
        } catch (error) {
            return Result.fail(error instanceof Error ? error.message : 'Error saving payroll');
        }
    }

    async findByCompany(companyId: string): Promise<Result<PayrollRun[]>> {
        try {
            const { data, error } = await this.source.instance.from('shared_payroll_runs').select('*')
                .eq('tenant_id', this.tenantId).eq('company_id', companyId).order('confirmed_at', { ascending: false });
            if (error) return Result.fail(error.message);
            return Result.success(((data as RawRun[]) ?? []).map(row => ({
                id: row.id, companyId: row.company_id, periodStart: row.period_start, periodEnd: row.period_end,
                exchangeRate: Number(row.exchange_rate), status: row.status, confirmedAt: row.confirmed_at, createdAt: row.created_at,
            })));
        } catch (error) { return Result.fail(error instanceof Error ? error.message : 'Error fetching history'); }
    }

    async findReceiptsByRun(runId: string): Promise<Result<PayrollReceipt[]>> {
        try {
            const { data, error } = await this.source.instance.from('shared_payroll_receipts').select('*')
                .eq('tenant_id', this.tenantId).eq('run_id', runId).order('employee_nombre', { ascending: true });
            if (error) return Result.fail(error.message);
            return Result.success(((data as RawReceipt[]) ?? []).map(row => ({
                id: row.id, runId: row.run_id, companyId: row.company_id, employeeId: row.employee_id,
                employeeCedula: row.employee_cedula, employeeNombre: row.employee_nombre, employeeCargo: row.employee_cargo,
                monthlySalary: Number(row.monthly_salary), totalEarnings: Number(row.total_earnings), totalDeductions: Number(row.total_deductions),
                totalBonuses: Number(row.total_bonuses), netPay: Number(row.net_pay),
                calculationData: row.calculation_data ?? { gross: 0, netUsd: 0, mondaysInMonth: 0 }, createdAt: row.created_at,
            })));
        } catch (error) { return Result.fail(error instanceof Error ? error.message : 'Error fetching receipts'); }
    }

    async unconfirm(runId: string): Promise<Result<UnconfirmedRun>> {
        try {
            const { data, error } = await this.source.instance.from('shared_payroll_runs').update({ status: 'draft' })
                .eq('tenant_id', this.tenantId).eq('id', runId).select('id,company_id').single();
            if (error) return Result.fail(error.message);
            return Result.success({ id: data.id, companyId: data.company_id });
        } catch (error) { return Result.fail(error instanceof Error ? error.message : 'Error unconfirming payroll'); }
    }
}
