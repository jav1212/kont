// Query — retrieves a single journal entry together with its debit/credit lines.
import { Result }                               from '@/src/core/domain/result';
import { IJournalEntryRepository, EntryWithLines } from '../../domain/repository/journal-entry.repository';

export class GetEntryWithLinesUseCase {
    constructor(private readonly repo: IJournalEntryRepository) {}

    async execute(entryId: string): Promise<Result<EntryWithLines>> {
        if (!entryId) return Result.fail('entryId is required');
        return this.repo.findWithLines(entryId);
    }
}
