// Application layer — removes integration-owned draft entries by their source reference.
// Integrations that rebuild their journal use it to drop drafts whose facts disappeared.
// Posted entries are immutable: if any entry with the reference is posted, nothing is deleted.
import { Result }                  from '@/src/core/domain/result';
import { IJournalEntryRepository } from '../../domain/repository/journal-entry.repository';

export interface DeleteDraftEntryBySourceRefInput {
    companyId: string;
    source:    string;
    sourceRef: string;
}

export class DeleteDraftEntryBySourceRefUseCase {
    constructor(private readonly repo: IJournalEntryRepository) {}

    async execute(input: DeleteDraftEntryBySourceRefInput): Promise<Result<string[]>> {
        if (!input.companyId || !input.source || !input.sourceRef) return Result.fail('companyId, source and sourceRef are required');
        const entries = await this.repo.findByCompany(input.companyId);
        if (entries.isFailure) return Result.fail(entries.getError());
        const matching = entries.getValue().filter((entry) => entry.source === input.source && entry.sourceRef === input.sourceRef);
        if (matching.length === 0) return Result.success([]);
        if (matching.some((entry) => entry.status === 'posted')) return Result.fail('Posted accounting entry cannot be deleted');
        return this.repo.deleteBySourceRef(input.companyId, input.source, input.sourceRef);
    }
}
