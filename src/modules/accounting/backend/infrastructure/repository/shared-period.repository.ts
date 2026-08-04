import { SupabaseClient } from '@supabase/supabase-js';
import { IPeriodRepository, SavePeriodInput } from '../../domain/repository/period.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import { AccountingPeriod } from '../../domain/accounting-period';

interface RawPeriodRow {
    id: string; company_id: string; name: string; start_date: string; end_date: string;
    status: string; closed_at: string | null; created_at: string; updated_at: string;
}

export class SharedPeriodRepository implements IPeriodRepository {
    constructor(private readonly source: ISource<SupabaseClient>, private readonly tenantId: string) {}

    async findByCompany(companyId: string): Promise<Result<AccountingPeriod[]>> {
        const { data, error } = await this.source.instance.rpc('shared_accounting_periods_get', {
            p_tenant_id: this.tenantId, p_company_id: companyId,
        });
        if (error) return Result.fail(error.message);
        return Result.success(((data as RawPeriodRow[]) ?? []).map(this.map));
    }

    async findOpenForDate(companyId: string, date: string): Promise<Result<AccountingPeriod | null>> {
        const { data, error } = await this.source.instance.rpc('shared_accounting_period_find_open_for_date', {
            p_tenant_id: this.tenantId, p_company_id: companyId, p_date: date,
        });
        if (error) return Result.fail(error.message);
        return Result.success(data ? this.map(data as RawPeriodRow) : null);
    }

    async save(input: SavePeriodInput): Promise<Result<string>> {
        const { data, error } = await this.source.instance.rpc('shared_accounting_period_save', {
            p_tenant_id: this.tenantId,
            p_period: { id: input.id ?? null, company_id: input.companyId, name: input.name, start_date: input.startDate, end_date: input.endDate },
        });
        return error ? Result.fail(error.message) : Result.success(data as string);
    }

    async close(periodId: string): Promise<Result<void>> {
        const { error } = await this.source.instance.rpc('shared_accounting_period_close', {
            p_tenant_id: this.tenantId, p_period_id: periodId,
        });
        return error ? Result.fail(error.message) : Result.success(undefined);
    }

    private map(row: RawPeriodRow): AccountingPeriod {
        return { id: row.id, companyId: row.company_id, name: row.name, startDate: row.start_date, endDate: row.end_date, status: row.status as AccountingPeriod['status'], closedAt: row.closed_at, createdAt: row.created_at, updatedAt: row.updated_at };
    }
}