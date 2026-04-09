import { Result }           from '@/src/core/domain/result';
import { IChartRepository } from '../../domain/repository/chart.repository';

export class DeleteChartUseCase {
    constructor(private readonly repo: IChartRepository) {}

    execute(chartId: string): Promise<Result<void>> {
        if (!chartId) return Promise.resolve(Result.fail('chartId is required'));
        return this.repo.delete(chartId);
    }
}
