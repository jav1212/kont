import { SupabaseClient } from '@supabase/supabase-js';
import { IChartRepository, ImportAccountInput } from '../../domain/repository/chart.repository';
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

    async save(chart: { id?: string; companyId: string; name: string }): Promise<Result<string>> {
        try {
            const { data, error } = await this.source.instance.rpc('shared_accounting_chart_save', {
                p_tenant_id: this.tenantId,
                p_chart: { id: chart.id ?? null, company_id: chart.companyId, name: chart.name },
            });
            if (error) return Result.fail(error.message);
            return Result.success(data as string);
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error saving chart');
        }
    }

    async delete(chartId: string): Promise<Result<void>> {
        try {
            const { error } = await this.source.instance.rpc('shared_accounting_chart_delete', {
                p_tenant_id: this.tenantId,
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
            const { data, error } = await this.source.instance.rpc('shared_accounting_chart_import', {
                p_tenant_id: this.tenantId,
                p_company_id: companyId,
                p_name: name,
                p_accounts: accounts.map((account) => ({
                    code: account.code,
                    name: account.name,
                    type: account.type,
                    parent_code: account.parentCode,
                    is_group: account.isGroup,
                })),
            });
            if (error) return Result.fail(error.message);
            return Result.success(data as string);
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error importing chart');
        }
    }
}