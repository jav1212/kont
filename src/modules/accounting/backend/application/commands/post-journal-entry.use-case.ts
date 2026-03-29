// Application layer — transitions a draft journal entry to posted status.
// The DB RPC validates that debits === credits before allowing the transition.
// Once posted, the entry is immutable; reversals require a new counter-entry.
import { Result }                  from '@/src/core/domain/result';
import { IJournalEntryRepository } from '../../domain/repository/journal-entry.repository';

export class PostJournalEntryUseCase {
    constructor(private readonly repo: IJournalEntryRepository) {}

    async execute(entryId: string): Promise<Result<void>> {
        if (!entryId) return Result.fail('entryId is required');
        return this.repo.post(entryId);
    }
}
