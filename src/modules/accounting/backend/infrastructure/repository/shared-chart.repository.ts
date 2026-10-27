import { SupabaseClient } from '@supabase/supabase-js';
import { IChartRepository } from '../../domain/repository/chart.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import { AccountChart } from '../../domain/account-chart';

interface RawChartRow {
    id: string;
    company_id: string;
    name: string;
    account_count: number;
    created_at: string;
    updated_at: string;
}

export class SharedChartRepository implements IChartRepository {
    constructor(private readonly source: ISource<SupabaseClient>, private readonly tenantId: string) {}

    async findByCompany(companyId: string): Promise<Result<AccountChart[]>> {
        try {
            const { data, error } = await this.source.instance.rpc('shared_accounting_charts_get', {
                p_tenant_id: this.tenantId,
                p_company_id: companyId,
            });
            if (error) return Result.fail(error.message);
            return Result.success(((data as RawChartRow[]) ?? []).map((row) => ({
                id: row.id,
                companyId: row.company_id,
                name: row.name,
                accountCount: Number(row.account_count ?? 0),
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            })));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error fetching charts');
        }
    }

}
