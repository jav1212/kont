// Infrastructure layer — Supabase RPC implementation of ICestaTicketRunRepository.
import { SupabaseClient } from '@supabase/supabase-js';
import { ICestaTicketRunRepository, SaveCestaTicketRunInput } from '../../domain/repository/cesta-ticket-run.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import { CestaTicketRun } from '../../domain/cesta-ticket-run';
import { CestaTicketReceipt } from '../../domain/cesta-ticket-receipt';

// Raw DB row shapes returned by tenant_cesta_ticket_* RPCs — never exported beyond this file.
interface RawCestaTicketRunRow {
    id:            string;
    company_id:    string;
    period_start:  string;
    period_end:    string;
    monto_usd:     number;
    exchange_rate: number;
    status:        string;
    confirmed_at:  string;
    created_at:    string;
}

interface RawCestaTicketReceiptRow {
    id:              string;
    run_id:          string;
    company_id:      string;
    employee_id:     string;
    employee_cedula: string;
    employee_nombre: string;
    employee_cargo:  string;
    monto_usd:       number;
    monto_ves:       number;
    created_at:      string;
}

export class RpcCestaTicketRunRepository implements ICestaTicketRunRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly userId: string,
    ) {}

    async save(input: SaveCestaTicketRunInput): Promise<Result<string>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_cesta_ticket_run_save', {
                    p_user_id:  this.userId,
                    p_run:      input.run,
                    p_receipts: input.receipts,
                    p_status:   input.run.status ?? 'confirmed',
                });
            if (error) return Result.fail(error.message);
            return Result.success(data as string);
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error saving cesta ticket');
        }
    }

    async findByCompany(companyId: string): Promise<Result<CestaTicketRun[]>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_cesta_ticket_runs_by_company', {
                    p_user_id:    this.userId,
                    p_company_id: companyId,
                });
            if (error) return Result.fail(error.message);
            return Result.success(((data as RawCestaTicketRunRow[]) ?? []).map(this.mapRunToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error fetching cesta ticket history');
        }
    }

    async findReceiptsByRun(runId: string): Promise<Result<CestaTicketReceipt[]>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_cesta_ticket_receipts_by_run', {
                    p_user_id: this.userId,
                    p_run_id:  runId,
                });
            if (error) return Result.fail(error.message);
            return Result.success(((data as RawCestaTicketReceiptRow[]) ?? []).map(this.mapReceiptToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error fetching cesta ticket receipts');
        }
    }

    private mapRunToDomain(row: RawCestaTicketRunRow): CestaTicketRun {
        return {
            id:           row.id,
            companyId:    row.company_id,
            periodStart:  row.period_start,
            periodEnd:    row.period_end,
            montoUsd:     Number(row.monto_usd),
            exchangeRate: Number(row.exchange_rate),
            status:       row.status,
            confirmedAt:  row.confirmed_at,
            createdAt:    row.created_at,
        };
    }

    private mapReceiptToDomain(row: RawCestaTicketReceiptRow): CestaTicketReceipt {
        return {
            id:              row.id,
            runId:           row.run_id,
            companyId:       row.company_id,
            employeeId:      row.employee_id,
            employeeCedula:  row.employee_cedula,
            employeeNombre:  row.employee_nombre,
            employeeCargo:   row.employee_cargo,
            montoUsd:        Number(row.monto_usd),
            montoVes:        Number(row.monto_ves),
            createdAt:       row.created_at,
        };
    }
}
