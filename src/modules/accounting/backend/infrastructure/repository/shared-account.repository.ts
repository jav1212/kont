import { SupabaseClient } from '@supabase/supabase-js';
import { IAccountRepository, SaveAccountInput } from '../../domain/repository/account.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import { Account } from '../../domain/account';

export class SharedAccountRepository implements IAccountRepository {
    constructor(private readonly source: ISource<SupabaseClient>, private readonly tenantId: string) {}

    async findByCompany(companyId: string): Promise<Result<Account[]>> {
        const { data, error } = await this.source.instance.rpc('shared_accounting_accounts_get', { p_tenant_id: this.tenantId, p_company_id: companyId });
        if (error) return Result.fail(error.message);
        return Result.success(((data as any[]) ?? []).map((row) => this.map(row)));
    }

    async save(input: SaveAccountInput): Promise<Result<string>> {
        const { data, error } = await this.source.instance.rpc('shared_accounting_account_upsert', { p_tenant_id: this.tenantId, p_account: { id: input.id ?? null, company_id: input.companyId, chart_id: input.chartId, code: input.code, name: input.name, type: input.type, parent_code: input.parentCode, is_active: input.isActive, is_group: input.isGroup, saldo_inicial: input.saldoInicial } });
        return error ? Result.fail(error.message) : Result.success(data as string);
    }

    async delete(accountId: string): Promise<Result<void>> {
        const { error } = await this.source.instance.rpc('shared_accounting_account_delete', { p_tenant_id: this.tenantId, p_account_id: accountId });
        return error ? Result.fail(error.message) : Result.success(undefined);
    }

    private map(row: any): Account {
        return { id: row.id, companyId: row.company_id, chartId: row.chart_id, code: row.code, name: row.name, type: row.type, parentCode: row.parent_code, isActive: row.is_active, isGroup: row.is_group, saldoInicial: Number(row.opening_balance ?? 0), createdAt: row.created_at, updatedAt: row.updated_at };
    }
}
