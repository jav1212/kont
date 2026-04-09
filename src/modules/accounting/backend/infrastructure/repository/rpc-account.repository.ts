// Infrastructure layer — Supabase RPC implementation of IAccountRepository.
import { SupabaseClient }                          from '@supabase/supabase-js';
import { IAccountRepository, SaveAccountInput }    from '../../domain/repository/account.repository';
import { ISource }                                 from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result }                                  from '@/src/core/domain/result';
import { Account }                                 from '../../domain/account';

interface RawAccountRow {
    id:          string;
    company_id:  string;
    chart_id:    string | null;
    code:        string;
    name:        string;
    type:        string;
    parent_code: string | null;
    is_active:   boolean;
    is_group:    boolean;
    created_at:  string;
    updated_at:  string;
}

export class RpcAccountRepository implements IAccountRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly userId: string,
    ) {}

    async findByCompany(companyId: string): Promise<Result<Account[]>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_accounting_accounts_get', {
                    p_user_id:    this.userId,
                    p_company_id: companyId,
                });
            if (error) return Result.fail(error.message);
            return Result.success(((data as RawAccountRow[]) ?? []).map(this.mapToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error fetching accounts');
        }
    }

    async save(input: SaveAccountInput): Promise<Result<string>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_accounting_account_upsert', {
                    p_user_id: this.userId,
                    p_account: {
                        id:          input.id ?? null,
                        company_id:  input.companyId,
                        code:        input.code,
                        name:        input.name,
                        type:        input.type,
                        parent_code: input.parentCode,
                        is_active:   input.isActive,
                    },
                });
            if (error) return Result.fail(error.message);
            return Result.success(data as string);
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error saving account');
        }
    }

    async delete(accountId: string): Promise<Result<void>> {
        try {
            const { error } = await this.source.instance
                .rpc('tenant_accounting_account_delete', {
                    p_user_id:   this.userId,
                    p_account_id: accountId,
                });
            if (error) return Result.fail(error.message);
            return Result.success(undefined);
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error deleting account');
        }
    }

    private mapToDomain(row: RawAccountRow): Account {
        return {
            id:         row.id,
            companyId:  row.company_id,
            chartId:    row.chart_id,
            code:       row.code,
            name:       row.name,
            type:       row.type as Account['type'],
            parentCode: row.parent_code,
            isActive:   row.is_active,
            isGroup:    row.is_group,
            createdAt:  row.created_at,
            updatedAt:  row.updated_at,
        };
    }
}
