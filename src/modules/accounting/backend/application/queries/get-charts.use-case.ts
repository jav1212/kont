import { Result }           from '@/src/core/domain/result';
import { IChartRepository } from '../../domain/repository/chart.repository';
import { AccountChart }     from '../../domain/account-chart';

export class GetChartsUseCase {
    constructor(private readonly repo: IChartRepository) {}

    execute(companyId: string): Promise<Result<AccountChart[]>> {
        if (!companyId) return Promise.resolve(Result.fail('companyId is required'));
        return this.repo.findByCompany(companyId);
    }
}
