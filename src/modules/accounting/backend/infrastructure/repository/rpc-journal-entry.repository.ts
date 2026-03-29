// Infrastructure layer — Supabase RPC implementation of IJournalEntryRepository.
import { SupabaseClient }                from '@supabase/supabase-js';
import {
    IJournalEntryRepository,
    SaveEntryInput,
    EntryWithLines,
    TrialBalanceLine,
}                                        from '../../domain/repository/journal-entry.repository';
import { ISource }                       from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result }                        from '@/src/core/domain/result';
import { JournalEntry }                  from '../../domain/journal-entry';
import { JournalEntryLine }              from '../../domain/journal-entry-line';

interface RawEntryRow {
    id:           string;
    company_id:   string;
    period_id:    string;
    entry_number: number;
    date:         string;
    description:  string;
    status:       string;
    source:       string;
    source_ref:   string | null;
    posted_at:    string | null;
    created_at:   string;
    updated_at:   string;
}

interface RawLineRow {
    id:           string;
    entry_id:     string;
    account_id:   string;
    account_code: string;
    account_name: string;
    type:         string;
    amount:       number;
    description:  string | null;
    created_at:   string;
}

interface RawTrialBalanceRow {
    account_id:   string;
    account_code: string;
    account_name: string;
    account_type: string;
    total_debit:  number;
    total_credit: number;
    balance:      number;
}

export class RpcJournalEntryRepository implements IJournalEntryRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly userId: string,
    ) {}

    async findByCompany(companyId: string, periodId?: string): Promise<Result<JournalEntry[]>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_accounting_entries_get', {
                    p_user_id:    this.userId,
                    p_company_id: companyId,
                    p_period_id:  periodId ?? null,
                });
            if (error) return Result.fail(error.message);
            return Result.success(((data as RawEntryRow[]) ?? []).map(this.mapEntryToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error fetching entries');
        }
    }

    async findWithLines(entryId: string): Promise<Result<EntryWithLines>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_accounting_entry_with_lines_get', {
                    p_user_id:  this.userId,
                    p_entry_id: entryId,
                });
            if (error) return Result.fail(error.message);
            const raw = data as { entry: RawEntryRow; lines: RawLineRow[] };
            return Result.success({
                entry: this.mapEntryToDomain(raw.entry),
                lines: (raw.lines ?? []).map(this.mapLineToDomain),
            });
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error fetching entry');
        }
    }

    async save(input: SaveEntryInput): Promise<Result<string>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_accounting_entry_save', {
                    p_user_id: this.userId,
                    p_entry: {
                        id:          input.entry.id ?? null,
                        company_id:  input.entry.companyId,
                        period_id:   input.entry.periodId,
                        date:        input.entry.date,
                        description: input.entry.description,
                        source:      input.entry.source ?? 'manual',
                        source_ref:  input.entry.sourceRef ?? null,
                    },
                    p_lines: input.lines.map((l) => ({
                        account_id:  l.accountId,
                        type:        l.type,
                        amount:      l.amount,
                        description: l.description ?? null,
                    })),
                });
            if (error) return Result.fail(error.message);
            return Result.success(data as string);
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error saving entry');
        }
    }

    async post(entryId: string): Promise<Result<void>> {
        try {
            const { error } = await this.source.instance
                .rpc('tenant_accounting_entry_post', {
                    p_user_id:  this.userId,
                    p_entry_id: entryId,
                });
            if (error) return Result.fail(error.message);
            return Result.success(undefined);
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error posting entry');
        }
    }

    async getTrialBalance(companyId: string, periodId?: string): Promise<Result<TrialBalanceLine[]>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_accounting_trial_balance_get', {
                    p_user_id:    this.userId,
                    p_company_id: companyId,
                    p_period_id:  periodId ?? null,
                });
            if (error) return Result.fail(error.message);
            return Result.success(((data as RawTrialBalanceRow[]) ?? []).map(this.mapTrialBalanceToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error fetching trial balance');
        }
    }

    private mapEntryToDomain(row: RawEntryRow): JournalEntry {
        return {
            id:          row.id,
            companyId:   row.company_id,
            periodId:    row.period_id,
            entryNumber: row.entry_number,
            date:        row.date,
            description: row.description,
            status:      row.status as JournalEntry['status'],
            source:      row.source as JournalEntry['source'],
            sourceRef:   row.source_ref,
            postedAt:    row.posted_at,
            createdAt:   row.created_at,
            updatedAt:   row.updated_at,
        };
    }

    private mapLineToDomain(row: RawLineRow): JournalEntryLine {
        return {
            id:          row.id,
            entryId:     row.entry_id,
            accountId:   row.account_id,
            accountCode: row.account_code,
            accountName: row.account_name,
            type:        row.type as JournalEntryLine['type'],
            amount:      row.amount,
            description: row.description,
            createdAt:   row.created_at,
        };
    }

    private mapTrialBalanceToDomain(row: RawTrialBalanceRow): TrialBalanceLine {
        return {
            accountId:   row.account_id,
            accountCode: row.account_code,
            accountName: row.account_name,
            accountType: row.account_type,
            totalDebit:  row.total_debit,
            totalCredit: row.total_credit,
            balance:     row.balance,
        };
    }
}
