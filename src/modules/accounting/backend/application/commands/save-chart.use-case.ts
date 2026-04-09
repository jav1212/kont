import { Result }           from '@/src/core/domain/result';
import { IChartRepository } from '../../domain/repository/chart.repository';

export interface SaveChartInput {
    id?:       string;
    companyId: string;
    name:      string;
}

export class SaveChartUseCase {
    constructor(private readonly repo: IChartRepository) {}

    execute(input: SaveChartInput): Promise<Result<string>> {
        if (!input.companyId) return Promise.resolve(Result.fail('companyId is required'));
        if (!input.name.trim()) return Promise.resolve(Result.fail('El nombre del plan es obligatorio'));
        return this.repo.save(input);
    }
}
