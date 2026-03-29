// Application layer — creates or updates an accounting integration rule.
import { Result }                                                    from '@/src/core/domain/result';
import { IIntegrationRuleRepository, SaveIntegrationRuleInput }     from '../../domain/repository/integration-rule.repository';

const VALID_SOURCES   = ['payroll', 'inventory_purchase', 'inventory_movement'] as const;
const VALID_AMOUNTS   = ['total_earnings', 'total_deductions', 'net_pay', 'subtotal', 'vat_amount', 'total', 'total_cost'] as const;

export class SaveIntegrationRuleUseCase {
    constructor(private readonly repo: IIntegrationRuleRepository) {}

    async execute(input: SaveIntegrationRuleInput): Promise<Result<string>> {
        if (!input.companyId)         return Result.fail('companyId is required');
        if (!VALID_SOURCES.includes(input.source as typeof VALID_SOURCES[number])) {
            return Result.fail('Invalid source');
        }
        if (!input.debitAccountId)    return Result.fail('debitAccountId is required');
        if (!input.creditAccountId)   return Result.fail('creditAccountId is required');
        if (input.debitAccountId === input.creditAccountId) {
            return Result.fail('Debit and credit accounts must be different');
        }
        if (!VALID_AMOUNTS.includes(input.amountField as typeof VALID_AMOUNTS[number])) {
            return Result.fail('Invalid amountField');
        }
        return this.repo.save(input);
    }
}
