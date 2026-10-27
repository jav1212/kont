import { SupabaseClient } from '@supabase/supabase-js';
import { IAccountRepository } from '../../domain/repository/account.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import { Account } from '../../domain/account';

interface AccountRow {
    id: string;
    company_id: string;
    chart_id: string | null;
    code: string;
    name: string;
    type: Account['type'];
    parent_code: string | null;
    is_active: boolean;
    is_group: boolean;
    opening_balance: number | string | null;
    created_at: string;
    updated_at: string;
}

export class SharedAccountRepository implements IAccountRepository {
    constructor(private readonly source: ISource<SupabaseClient>, private readonly tenantId: string) {}

    async findByCompany(companyId: string): Promise<Result<Account[]>> {
        const { data, error } = await this.source.instance.rpc('shared_accounting_accounts_get', { p_tenant_id: this.tenantId, p_company_id: companyId });
        if (error) return Result.fail(error.message);
        return Result.success(((data as AccountRow[] | null) ?? []).map((row) => this.map(row)));
    }

    private map(row: AccountRow): Account {
        return { id: row.id, companyId: row.company_id, chartId: row.chart_id, code: row.code, name: row.name, type: row.type, parentCode: row.parent_code, isActive: row.is_active, isGroup: row.is_group, saldoInicial: Number(row.opening_balance ?? 0), createdAt: row.created_at, updatedAt: row.updated_at };
    }
}
