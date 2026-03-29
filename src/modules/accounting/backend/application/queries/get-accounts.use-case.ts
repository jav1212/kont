// Query — retrieves all accounts in the chart of accounts for a given company.
import { Result }             from '@/src/core/domain/result';
import { Account }            from '../../domain/account';
import { IAccountRepository } from '../../domain/repository/account.repository';

export class GetAccountsUseCase {
    constructor(private readonly repo: IAccountRepository) {}

    async execute(companyId: string): Promise<Result<Account[]>> {
        if (!companyId) return Result.fail('companyId is required');
        return this.repo.findByCompany(companyId);
    }
}
