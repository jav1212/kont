// Infrastructure layer — Supabase RPC implementation of IChartRepository.
import { SupabaseClient }                                   from '@supabase/supabase-js';
import { IChartRepository, ImportAccountInput }             from '../../domain/repository/chart.repository';
import { ISource }                                          from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result }                                           from '@/src/core/domain/result';
import { AccountChart }                                     from '../../domain/account-chart';

interface RawChartRow {
    id:            string;
    company_id:    string;
    name:          string;
    account_count: number;
    created_at:    string;
    updated_at:    string;
}

export class RpcChartRepository implements IChartRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly userId: string,
    ) {}

    async findByCompany(companyId: string): Promise<Result<AccountChart[]>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_accounting_charts_get', {
                    p_user_id:    this.userId,
                    p_company_id: companyId,
                });
            if (error) return Result.fail(error.message);
            return Result.success(((data as RawChartRow[]) ?? []).map(this.mapToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error fetching charts');
        }
    }

    async save(chart: { id?: string; companyId: string; name: string }): Promise<Result<string>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_accounting_chart_save', {
                    p_user_id: this.userId,
                    p_chart: {
                        id:         chart.id ?? null,
                        company_id: chart.companyId,
                        name:       chart.name,
                    },
                });
            if (error) return Result.fail(error.message);
            return Result.success(data as string);
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error saving chart');
        }
    }

    async delete(chartId: string): Promise<Result<void>> {
        try {
            const { error } = await this.source.instance
                .rpc('tenant_accounting_chart_delete', {
                    p_user_id:  this.userId,
                    p_chart_id: chartId,
                });
            if (error) return Result.fail(error.message);
            return Result.success(undefined);
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error deleting chart');
        }
    }

    async import(companyId: string, name: string, accounts: ImportAccountInput[]): Promise<Result<string>> {
        try {
            const payload = accounts.map((a) => ({
                code:        a.code,
                name:        a.name,
                type:        a.type,
                parent_code: a.parentCode,
                is_group:    a.isGroup,
            }));
            const { data, error } = await this.source.instance
                .rpc('tenant_accounting_chart_import', {
                    p_user_id:    this.userId,
                    p_company_id: companyId,
                    p_name:       name,
                    p_accounts:   JSON.stringify(payload),
                });
            if (error) return Result.fail(error.message);
            return Result.success(data as string);
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error importing chart');
        }
    }

    private mapToDomain(row: RawChartRow): AccountChart {
        return {
            id:           row.id,
            companyId:    row.company_id,
            name:         row.name,
            accountCount: Number(row.account_count),
            createdAt:    row.created_at,
            updatedAt:    row.updated_at,
        };
    }
}
