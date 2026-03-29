// Infrastructure layer — Supabase RPC implementation of IIntegrationRuleRepository.
import { SupabaseClient }                                            from '@supabase/supabase-js';
import { IIntegrationRuleRepository, SaveIntegrationRuleInput }     from '../../domain/repository/integration-rule.repository';
import { ISource }                                                   from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result }                                                    from '@/src/core/domain/result';
import { IntegrationRule, IntegrationSource, AmountField }          from '../../domain/integration-rule';

interface RawRuleRow {
    id:                string;
    company_id:        string;
    source:            string;
    debit_account_id:  string;
    credit_account_id: string;
    amount_field:      string;
    description:       string;
    is_active:         boolean;
    created_at:        string;
    updated_at:        string;
}

export class RpcIntegrationRuleRepository implements IIntegrationRuleRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly userId: string,
    ) {}

    async findByCompany(companyId: string, integrationSource?: IntegrationSource): Promise<Result<IntegrationRule[]>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_accounting_integration_rules_get', {
                    p_user_id:    this.userId,
                    p_company_id: companyId,
                    p_source:     integrationSource ?? null,
                });
            if (error) return Result.fail(error.message);
            return Result.success(((data as RawRuleRow[]) ?? []).map(this.mapToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error fetching integration rules');
        }
    }

    async save(input: SaveIntegrationRuleInput): Promise<Result<string>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_accounting_integration_rule_save', {
                    p_user_id: this.userId,
                    p_rule: {
                        id:                input.id ?? null,
                        company_id:        input.companyId,
                        source:            input.source,
                        debit_account_id:  input.debitAccountId,
                        credit_account_id: input.creditAccountId,
                        amount_field:      input.amountField,
                        description:       input.description,
                        is_active:         input.isActive,
                    },
                });
            if (error) return Result.fail(error.message);
            return Result.success(data as string);
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error saving integration rule');
        }
    }

    async delete(ruleId: string): Promise<Result<void>> {
        try {
            const { error } = await this.source.instance
                .rpc('tenant_accounting_integration_rule_delete', {
                    p_user_id: this.userId,
                    p_rule_id: ruleId,
                });
            if (error) return Result.fail(error.message);
            return Result.success(undefined);
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error deleting integration rule');
        }
    }

    private mapToDomain(row: RawRuleRow): IntegrationRule {
        return {
            id:              row.id,
            companyId:       row.company_id,
            source:          row.source as IntegrationSource,
            debitAccountId:  row.debit_account_id,
            creditAccountId: row.credit_account_id,
            amountField:     row.amount_field as AmountField,
            description:     row.description,
            isActive:        row.is_active,
            createdAt:       row.created_at,
            updatedAt:       row.updated_at,
        };
    }
}
