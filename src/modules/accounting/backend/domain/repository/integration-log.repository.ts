// Repository contract for the accounting integration log.
import { Result }               from '@/src/core/domain/result';
import { IntegrationLogEntry }  from '../integration-log';

export interface SaveLogInput {
    companyId:    string;
    source:       string;
    sourceRef:    string;
    entryId:      string | null;
    status:       string;
    errorMessage: string | null;
}

export interface IIntegrationLogRepository {
    findByCompany(companyId: string, limit?: number): Promise<Result<IntegrationLogEntry[]>>;
    save(input: SaveLogInput): Promise<Result<string>>;
}
