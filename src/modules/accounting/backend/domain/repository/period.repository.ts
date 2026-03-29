// Repository contract for accounting period operations.
import { Result }           from '@/src/core/domain/result';
import { AccountingPeriod } from '../accounting-period';

export interface SavePeriodInput {
    id?:       string;
    companyId: string;
    name:      string;
    startDate: string;
    endDate:   string;
}

export interface IPeriodRepository {
    findByCompany(companyId: string): Promise<Result<AccountingPeriod[]>>;
    /** Returns the first open period whose date range contains the given ISO date, or null if none. */
    findOpenForDate(companyId: string, date: string): Promise<Result<AccountingPeriod | null>>;
    save(input: SavePeriodInput): Promise<Result<string>>;
    close(periodId: string): Promise<Result<void>>;
}
