// Infrastructure layer — Supabase RPC implementation of IBonoGuerraRunRepository.
import { SupabaseClient } from '@supabase/supabase-js';
import { IBonoGuerraRunRepository, SaveBonoGuerraRunInput, UnconfirmedRun } from '../../domain/repository/bono-guerra-run.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import { BonoGuerraRun } from '../../domain/bono-guerra-run';
import { BonoGuerraReceipt } from '../../domain/bono-guerra-receipt';

// Raw DB row shapes returned by tenant_bono_guerra_* RPCs — never exported beyond this file.
interface RawBonoGuerraRunRow {
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

interface RawBonoGuerraReceiptRow {
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

export class RpcBonoGuerraRunRepository implements IBonoGuerraRunRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly userId: string,
    ) {}

    async save(input: SaveBonoGuerraRunInput): Promise<Result<string>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_bono_guerra_run_save', {
                    p_user_id:  this.userId,
                    p_run:      input.run,
                    p_receipts: input.receipts,
                    p_status:   input.run.status ?? 'confirmed',
                });
            if (error) return Result.fail(error.message);
            return Result.success(data as string);
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error saving bono de guerra');
        }
    }

    async findByCompany(companyId: string): Promise<Result<BonoGuerraRun[]>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_bono_guerra_runs_by_company', {
                    p_user_id:    this.userId,
                    p_company_id: companyId,
                });
            if (error) return Result.fail(error.message);
            return Result.success(((data as RawBonoGuerraRunRow[]) ?? []).map(this.mapRunToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error fetching bono de guerra history');
        }
    }

    async findReceiptsByRun(runId: string): Promise<Result<BonoGuerraReceipt[]>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_bono_guerra_receipts_by_run', {
                    p_user_id: this.userId,
                    p_run_id:  runId,
                });
            if (error) return Result.fail(error.message);
            return Result.success(((data as RawBonoGuerraReceiptRow[]) ?? []).map(this.mapReceiptToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error fetching bono de guerra receipts');
        }
    }

    async unconfirm(runId: string): Promise<Result<UnconfirmedRun>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_bono_guerra_run_unconfirm', {
                    p_user_id: this.userId,
                    p_run_id:  runId,
                });
            if (error) return Result.fail(error.message);
            const row = data as { id: string; company_id: string };
            return Result.success({ id: row.id, companyId: row.company_id });
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error unconfirming bono de guerra');
        }
    }

    private mapRunToDomain(row: RawBonoGuerraRunRow): BonoGuerraRun {
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

    private mapReceiptToDomain(row: RawBonoGuerraReceiptRow): BonoGuerraReceipt {
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
