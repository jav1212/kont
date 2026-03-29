// Application layer — creates or updates a chart-of-accounts entry.
// Validates code uniqueness invariant at application level before delegating to repo.
import { Result }                              from '@/src/core/domain/result';
import { IAccountRepository, SaveAccountInput } from '../../domain/repository/account.repository';

export class SaveAccountUseCase {
    constructor(private readonly repo: IAccountRepository) {}

    async execute(input: SaveAccountInput): Promise<Result<string>> {
        if (!input.companyId) return Result.fail('companyId is required');
        if (!input.code.trim()) return Result.fail('Account code is required');
        if (!input.name.trim()) return Result.fail('Account name is required');
        if (!['asset', 'liability', 'equity', 'revenue', 'expense'].includes(input.type)) {
            return Result.fail('Invalid account type');
        }
        return this.repo.save(input);
    }
}
