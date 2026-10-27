// Repository interface for accounting charts (plan de cuentas).
import { Result }       from '@/src/core/domain/result';
import { AccountChart } from '../account-chart';

export interface ImportAccountInput {
    code:       string;
    name:       string;
    type:       string;
    parentCode: string | null;
    isGroup:    boolean;
}

export interface IChartRepository {
    findByCompany(companyId: string): Promise<Result<AccountChart[]>>;
}
