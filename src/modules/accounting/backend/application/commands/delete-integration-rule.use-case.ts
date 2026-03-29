// Application layer — removes an accounting integration rule.
import { Result }                    from '@/src/core/domain/result';
import { IIntegrationRuleRepository } from '../../domain/repository/integration-rule.repository';

export class DeleteIntegrationRuleUseCase {
    constructor(private readonly repo: IIntegrationRuleRepository) {}

    async execute(ruleId: string): Promise<Result<void>> {
        if (!ruleId) return Result.fail('ruleId is required');
        return this.repo.delete(ruleId);
    }
}
