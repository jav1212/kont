// Repository contract for journal entry operations.
// Covers CRUD for entries+lines, posting, and read-only reporting queries.
import { Result }          from '@/src/core/domain/result';
import { JournalEntry }    from '../journal-entry';
import { JournalEntryLine } from '../journal-entry-line';

export interface SaveEntryLineInput {
    accountId:   string;
    type:        string;
    amount:      number;
    description: string | null;
}

export interface SaveEntryInput {
    entry: {
        id?:       string;
        companyId:  string;
        periodId:   string;
        date:       string;
        description: string;
        source?:    string;
        sourceRef?: string | null;
    };
    lines: SaveEntryLineInput[];
}

export interface EntryWithLines {
    entry: JournalEntry;
    lines: JournalEntryLine[];
}

export interface TrialBalanceLine {
    accountId:   string;
    accountCode: string;
    accountName: string;
    accountType: string;
    totalDebit:  number;
    totalCredit: number;
    balance:     number;
}

export interface IJournalEntryRepository {
    findByCompany(companyId: string, periodId?: string): Promise<Result<JournalEntry[]>>;
    findWithLines(entryId: string): Promise<Result<EntryWithLines>>;
    save(input: SaveEntryInput): Promise<Result<string>>;
    post(entryId: string): Promise<Result<void>>;
    getTrialBalance(companyId: string, periodId?: string): Promise<Result<TrialBalanceLine[]>>;
    deleteBySourceRef(companyId: string, source: string, sourceRef: string): Promise<Result<string[]>>;
}
