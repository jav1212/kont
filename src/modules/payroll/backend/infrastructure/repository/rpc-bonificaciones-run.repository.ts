// Infrastructure layer — Supabase RPC implementation of IBonificacionesRunRepository.
import { SupabaseClient } from '@supabase/supabase-js';
import { IBonificacionesRunRepository, SaveBonificacionesRunInput } from '../../domain/repository/bonificaciones-run.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import { BonificacionesRun } from '../../domain/bonificaciones-run';
import { BonificacionesReceipt, BonificacionesBonusLineSnapshot } from '../../domain/bonificaciones-receipt';

interface RawBonificacionesRunRow {
    id:             string;
    company_id:     string;
    period_start:   string;
    period_end:     string;
    exchange_rate:  number;
    total_ves:      number;
    employee_count: number;
    line_count:     number;
    status:         string;
    confirmed_at:   string;
    created_at:     string;
}

interface RawBonificacionesReceiptRow {
    id:              string;
    run_id:          string;
    company_id:      string;
    employee_id:     string;
    employee_cedula: string;
    employee_nombre: string;
    employee_cargo:  string;
    total_ves:       number;
    bonus_lines:     unknown;     // jsonb — array de líneas
    created_at:      string;
}

function normalizeBonusLines(raw: unknown): BonificacionesBonusLineSnapshot[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((line) => {
        const obj = line as Record<string, unknown>;
        const currencyRaw = String(obj.currency ?? "USD").toUpperCase();
        const currency: "USD" | "VES" = currencyRaw === "VES" ? "VES" : "USD";
        return {
            label:     String(obj.label ?? ""),
            currency,
            amount:    Number(obj.amount ?? 0),
            amountVes: Number(obj.amountVes ?? obj.amount_ves ?? 0),
        };
    });
}

export class RpcBonificacionesRunRepository implements IBonificacionesRunRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly userId: string,
    ) {}

    async save(input: SaveBonificacionesRunInput): Promise<Result<string>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_bonificaciones_run_save', {
                    p_user_id:  this.userId,
                    p_run:      input.run,
                    p_receipts: input.receipts,
                    p_status:   input.run.status ?? 'confirmed',
                });
            if (error) return Result.fail(error.message);
            return Result.success(data as string);
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error saving bonificaciones');
        }
    }

    async findByCompany(companyId: string): Promise<Result<BonificacionesRun[]>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_bonificaciones_runs_by_company', {
                    p_user_id:    this.userId,
                    p_company_id: companyId,
                });
            if (error) return Result.fail(error.message);
            return Result.success(((data as RawBonificacionesRunRow[]) ?? []).map(this.mapRunToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error fetching bonificaciones history');
        }
    }

    async findReceiptsByRun(runId: string): Promise<Result<BonificacionesReceipt[]>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_bonificaciones_receipts_by_run', {
                    p_user_id: this.userId,
                    p_run_id:  runId,
                });
            if (error) return Result.fail(error.message);
            return Result.success(((data as RawBonificacionesReceiptRow[]) ?? []).map(this.mapReceiptToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error fetching bonificaciones receipts');
        }
    }

    private mapRunToDomain(row: RawBonificacionesRunRow): BonificacionesRun {
        return {
            id:             row.id,
            companyId:      row.company_id,
            periodStart:    row.period_start,
            periodEnd:      row.period_end,
            exchangeRate:   Number(row.exchange_rate),
            totalVes:       Number(row.total_ves),
            employeeCount:  Number(row.employee_count),
            lineCount:      Number(row.line_count),
            status:         row.status,
            confirmedAt:    row.confirmed_at,
            createdAt:      row.created_at,
        };
    }

    private mapReceiptToDomain(row: RawBonificacionesReceiptRow): BonificacionesReceipt {
        return {
            id:              row.id,
            runId:           row.run_id,
            companyId:       row.company_id,
            employeeId:      row.employee_id,
            employeeCedula:  row.employee_cedula,
            employeeNombre:  row.employee_nombre,
            employeeCargo:   row.employee_cargo,
            totalVes:        Number(row.total_ves),
            bonusLines:      normalizeBonusLines(row.bonus_lines),
            createdAt:       row.created_at,
        };
    }
}
