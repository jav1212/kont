import { Result }                               from '@/src/core/domain/result';
import { IChartRepository, ImportAccountInput } from '../../domain/repository/chart.repository';

export interface ImportChartInput {
    companyId: string;
    name:      string;
    accounts:  ImportAccountInput[];
}

export class ImportChartUseCase {
    constructor(private readonly repo: IChartRepository) {}

    execute(input: ImportChartInput): Promise<Result<string>> {
        if (!input.companyId)    return Promise.resolve(Result.fail('companyId is required'));
        if (!input.name.trim())  return Promise.resolve(Result.fail('El nombre del plan es obligatorio'));
        if (!input.accounts.length) return Promise.resolve(Result.fail('El archivo no contiene cuentas'));
        return this.repo.import(input.companyId, input.name, input.accounts);
    }
}
