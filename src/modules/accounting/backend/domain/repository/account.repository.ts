// Repository contract for chart-of-accounts operations.
import { Result }  from '@/src/core/domain/result';
import { Account } from '../account';

export interface SaveAccountInput {
    id?:           string;
    companyId:     string;
    chartId:       string | null;
    code:          string;
    name:          string;
    type:          string;
    parentCode:    string | null;
    isActive:      boolean;
    isGroup:       boolean;
    saldoInicial:  number;
}

export interface IAccountRepository {
    findByCompany(companyId: string): Promise<Result<Account[]>>;
    save(input: SaveAccountInput): Promise<Result<string>>;
    delete(accountId: string): Promise<Result<void>>;
}
