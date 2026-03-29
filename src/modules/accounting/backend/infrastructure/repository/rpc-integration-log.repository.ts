// Infrastructure layer — Supabase RPC implementation of IIntegrationLogRepository.
import { SupabaseClient }                                      from '@supabase/supabase-js';
import { IIntegrationLogRepository, SaveLogInput }             from '../../domain/repository/integration-log.repository';
import { ISource }                                             from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result }                                              from '@/src/core/domain/result';
import { IntegrationLogEntry, IntegrationStatus }              from '../../domain/integration-log';

interface RawLogRow {
    id:            string;
    company_id:    string;
    source:        string;
    source_ref:    string;
    entry_id:      string | null;
    status:        string;
    error_message: string | null;
    created_at:    string;
}

export class RpcIntegrationLogRepository implements IIntegrationLogRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly userId: string,
    ) {}

    async findByCompany(companyId: string, limit = 100): Promise<Result<IntegrationLogEntry[]>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_accounting_integration_log_get', {
                    p_user_id:    this.userId,
                    p_company_id: companyId,
                    p_limit:      limit,
                });
            if (error) return Result.fail(error.message);
            return Result.success(((data as RawLogRow[]) ?? []).map(this.mapToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error fetching integration log');
        }
    }

    async save(input: SaveLogInput): Promise<Result<string>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_accounting_integration_log_save', {
                    p_user_id: this.userId,
                    p_log: {
                        company_id:    input.companyId,
                        source:        input.source,
                        source_ref:    input.sourceRef,
                        entry_id:      input.entryId,
                        status:        input.status,
                        error_message: input.errorMessage,
                    },
                });
            if (error) return Result.fail(error.message);
            return Result.success(data as string);
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error saving integration log');
        }
    }

    private mapToDomain(row: RawLogRow): IntegrationLogEntry {
        return {
            id:           row.id,
            companyId:    row.company_id,
            source:       row.source,
            sourceRef:    row.source_ref,
            entryId:      row.entry_id,
            status:       row.status as IntegrationStatus,
            errorMessage: row.error_message,
            createdAt:    row.created_at,
        };
    }
}
