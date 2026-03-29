// Query — retrieves the integration log for a company (most recent entries first).
import { Result }                  from '@/src/core/domain/result';
import { IntegrationLogEntry }     from '../../domain/integration-log';
import { IIntegrationLogRepository } from '../../domain/repository/integration-log.repository';

export interface GetIntegrationLogInput {
    companyId: string;
    limit?:    number;
}

export class GetIntegrationLogUseCase {
    constructor(private readonly repo: IIntegrationLogRepository) {}

    async execute(input: GetIntegrationLogInput): Promise<Result<IntegrationLogEntry[]>> {
        if (!input.companyId) return Result.fail('companyId is required');
        return this.repo.findByCompany(input.companyId, input.limit ?? 100);
    }
}
