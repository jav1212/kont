// Query — retrieves journal entries for a company, optionally filtered by period.
import { Result }                  from '@/src/core/domain/result';
import { JournalEntry }            from '../../domain/journal-entry';
import { IJournalEntryRepository } from '../../domain/repository/journal-entry.repository';

export interface GetEntriesInput {
    companyId: string;
    periodId?: string;
}

export class GetJournalEntriesUseCase {
    constructor(private readonly repo: IJournalEntryRepository) {}

    async execute(input: GetEntriesInput): Promise<Result<JournalEntry[]>> {
        if (!input.companyId) return Result.fail('companyId is required');
        return this.repo.findByCompany(input.companyId, input.periodId);
    }
}
