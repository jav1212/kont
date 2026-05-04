import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import {
    IIgtfFortnightlyRepository,
    IgtfFortnightlyReport,
} from '../domain/igtf-fortnightly-report';

interface Input {
    companyId: string;
    year:      number;
    month:     number;
    quincena:  1 | 2;
}

export class GetIgtfFortnightlyReportUseCase extends UseCase<Input, IgtfFortnightlyReport> {
    constructor(private readonly repo: IIgtfFortnightlyRepository) { super(); }
    async execute(input: Input): Promise<Result<IgtfFortnightlyReport>> {
        if (!input.companyId) return Result.fail('companyId is required');
        if (!Number.isInteger(input.year)  || input.year  < 2000) return Result.fail('Invalid year');
        if (!Number.isInteger(input.month) || input.month < 1 || input.month > 12) return Result.fail('Invalid month (1-12)');
        if (input.quincena !== 1 && input.quincena !== 2) return Result.fail('Invalid quincena (1 o 2)');
        return this.repo.getQuincenaReport(input);
    }
}
