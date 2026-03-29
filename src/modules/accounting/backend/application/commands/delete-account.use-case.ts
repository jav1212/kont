// Application layer — removes an account from the chart of accounts.
// The underlying RPC enforces referential safety (no deletion if linked to posted entries).
import { Result }              from '@/src/core/domain/result';
import { IAccountRepository }  from '../../domain/repository/account.repository';

export class DeleteAccountUseCase {
    constructor(private readonly repo: IAccountRepository) {}

    async execute(accountId: string): Promise<Result<void>> {
        if (!accountId) return Result.fail('accountId is required');
        return this.repo.delete(accountId);
    }
}
