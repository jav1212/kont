// Query — retrieves integration rules for a company, optionally filtered by source.
import { Result }                                    from '@/src/core/domain/result';
import { IntegrationRule, IntegrationSource }        from '../../domain/integration-rule';
import { IIntegrationRuleRepository }               from '../../domain/repository/integration-rule.repository';

export interface GetIntegrationRulesInput {
    companyId: string;
    source?:   IntegrationSource;
}

export class GetIntegrationRulesUseCase {
    constructor(private readonly repo: IIntegrationRuleRepository) {}

    async execute(input: GetIntegrationRulesInput): Promise<Result<IntegrationRule[]>> {
        if (!input.companyId) return Result.fail('companyId is required');
        return this.repo.findByCompany(input.companyId, input.source);
    }
}
