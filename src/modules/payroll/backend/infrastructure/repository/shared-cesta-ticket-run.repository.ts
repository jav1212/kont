import { SupabaseClient } from '@supabase/supabase-js';
import { ICestaTicketRunRepository, SaveCestaTicketRunInput, UnconfirmedRun } from '../../domain/repository/cesta-ticket-run.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import { CestaTicketRun } from '../../domain/cesta-ticket-run';
import { CestaTicketReceipt } from '../../domain/cesta-ticket-receipt';

interface RawRun { id: string; company_id: string; period_start: string; period_end: string; monto_usd: number; exchange_rate: number; status: string; confirmed_at: string; created_at: string; }
interface RawReceipt { id: string; run_id: string; company_id: string; employee_id: string; employee_cedula: string; employee_nombre: string; employee_cargo: string; monto_usd: number; monto_ves: number; created_at: string; }

export class SharedCestaTicketRunRepository implements ICestaTicketRunRepository {
    constructor(private readonly source: ISource<SupabaseClient>, private readonly tenantId: string) {}

    async save(input: SaveCestaTicketRunInput): Promise<Result<string>> {
        try {
            const { data, error } = await this.source.instance.rpc('shared_payroll_cesta_ticket_run_save', {
                p_tenant_id: this.tenantId,
                p_run: { company_id: input.run.companyId, period_start: input.run.periodStart, period_end: input.run.periodEnd, monto_usd: input.run.montoUsd, exchange_rate: input.run.exchangeRate },
                p_receipts: input.receipts.map(receipt => ({ employee_id: receipt.employeeId ?? null, employee_cedula: receipt.employeeCedula, employee_nombre: receipt.employeeNombre, employee_cargo: receipt.employeeCargo, monto_usd: receipt.montoUsd, monto_ves: receipt.montoVes })),
                p_status: input.run.status ?? 'confirmed',
            });
            if (error) return Result.fail(error.message);
            return Result.success(data as string);
        } catch (err) { return Result.fail(err instanceof Error ? err.message : 'Error al guardar cesta ticket'); }
    }

    async findByCompany(companyId: string): Promise<Result<CestaTicketRun[]>> {
        try {
            const { data, error } = await this.source.instance.rpc('shared_payroll_cesta_ticket_runs_by_company', { p_tenant_id: this.tenantId, p_company_id: companyId });
            if (error) return Result.fail(error.message);
            return Result.success(((data as RawRun[]) ?? []).map(row => this.mapRun(row)));
        } catch (err) { return Result.fail(err instanceof Error ? err.message : 'Error al cargar historial de cesta ticket'); }
    }

    async findReceiptsByRun(runId: string): Promise<Result<CestaTicketReceipt[]>> {
        try {
            const { data, error } = await this.source.instance.rpc('shared_payroll_cesta_ticket_receipts_by_run', { p_tenant_id: this.tenantId, p_run_id: runId });
            if (error) return Result.fail(error.message);
            return Result.success(((data as RawReceipt[]) ?? []).map(row => this.mapReceipt(row)));
        } catch (err) { return Result.fail(err instanceof Error ? err.message : 'Error al cargar recibos de cesta ticket'); }
    }

    async unconfirm(runId: string): Promise<Result<UnconfirmedRun>> {
        try {
            const { data, error } = await this.source.instance.rpc('shared_payroll_cesta_ticket_run_unconfirm', { p_tenant_id: this.tenantId, p_run_id: runId });
            if (error) return Result.fail(error.message);
            const row = data as { id: string; company_id: string };
            return Result.success({ id: row.id, companyId: row.company_id });
        } catch (err) { return Result.fail(err instanceof Error ? err.message : 'Error al revertir cesta ticket'); }
    }

    private mapRun(row: RawRun): CestaTicketRun { return { id: row.id, companyId: row.company_id, periodStart: row.period_start, periodEnd: row.period_end, montoUsd: Number(row.monto_usd), exchangeRate: Number(row.exchange_rate), status: row.status, confirmedAt: row.confirmed_at, createdAt: row.created_at }; }
    private mapReceipt(row: RawReceipt): CestaTicketReceipt { return { id: row.id, runId: row.run_id, companyId: row.company_id, employeeId: row.employee_id, employeeCedula: row.employee_cedula, employeeNombre: row.employee_nombre, employeeCargo: row.employee_cargo, montoUsd: Number(row.monto_usd), montoVes: Number(row.monto_ves), createdAt: row.created_at }; }
}
