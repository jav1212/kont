// Infrastructure layer — Supabase RPC implementation of IPeriodRepository.
import { SupabaseClient }                        from '@supabase/supabase-js';
import { IPeriodRepository, SavePeriodInput }    from '../../domain/repository/period.repository';
import { ISource }                               from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result }                                from '@/src/core/domain/result';
import { AccountingPeriod }                      from '../../domain/accounting-period';

interface RawPeriodRow {
    id:         string;
    company_id: string;
    name:       string;
    start_date: string;
    end_date:   string;
    status:     string;
    closed_at:  string | null;
    created_at: string;
    updated_at: string;
}

export class RpcPeriodRepository implements IPeriodRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly userId: string,
    ) {}

    async findByCompany(companyId: string): Promise<Result<AccountingPeriod[]>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_accounting_periods_get', {
                    p_user_id:    this.userId,
                    p_company_id: companyId,
                });
            if (error) return Result.fail(error.message);
            return Result.success(((data as RawPeriodRow[]) ?? []).map(this.mapToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error fetching periods');
        }
    }

    async findOpenForDate(companyId: string, date: string): Promise<Result<AccountingPeriod | null>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_accounting_period_find_open_for_date', {
                    p_user_id:    this.userId,
                    p_company_id: companyId,
                    p_date:       date,
                });
            if (error) return Result.fail(error.message);
            if (!data) return Result.success(null);
            const row = data as RawPeriodRow;
            return Result.success(this.mapToDomain(row));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error finding period');
        }
    }

    async save(input: SavePeriodInput): Promise<Result<string>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_accounting_period_save', {
                    p_user_id: this.userId,
                    p_period: {
                        id:         input.id ?? null,
                        company_id: input.companyId,
                        name:       input.name,
                        start_date: input.startDate,
                        end_date:   input.endDate,
                    },
                });
            if (error) return Result.fail(error.message);
            return Result.success(data as string);
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error saving period');
        }
    }

    async close(periodId: string): Promise<Result<void>> {
        try {
            const { error } = await this.source.instance
                .rpc('tenant_accounting_period_close', {
                    p_user_id:  this.userId,
                    p_period_id: periodId,
                });
            if (error) return Result.fail(error.message);
            return Result.success(undefined);
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error closing period');
        }
    }

    private mapToDomain(row: RawPeriodRow): AccountingPeriod {
        return {
            id:        row.id,
            companyId: row.company_id,
            name:      row.name,
            startDate: row.start_date,
            endDate:   row.end_date,
            status:    row.status as AccountingPeriod['status'],
            closedAt:  row.closed_at,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
}
