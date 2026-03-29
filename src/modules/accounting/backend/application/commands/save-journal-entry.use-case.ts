// Application layer — creates or updates a draft journal entry with its lines.
// Validates that lines are provided and that each line has a positive amount.
// Does NOT enforce the debit/credit balance here — posting enforces it at the DB level.
import { Result }                                from '@/src/core/domain/result';
import { IJournalEntryRepository, SaveEntryInput } from '../../domain/repository/journal-entry.repository';

export class SaveJournalEntryUseCase {
    constructor(private readonly repo: IJournalEntryRepository) {}

    async execute(input: SaveEntryInput): Promise<Result<string>> {
        if (!input.entry.companyId)  return Result.fail('companyId is required');
        if (!input.entry.periodId)   return Result.fail('periodId is required');
        if (!input.entry.date)       return Result.fail('date is required');
        if (!input.entry.description.trim()) return Result.fail('description is required');
        if (input.lines.length === 0) return Result.fail('At least one entry line is required');

        for (const line of input.lines) {
            if (!line.accountId) return Result.fail('Each line must have an accountId');
            if (!['debit', 'credit'].includes(line.type)) return Result.fail('Line type must be debit or credit');
            if (line.amount <= 0)  return Result.fail('Line amount must be greater than zero');
        }

        return this.repo.save(input);
    }
}
