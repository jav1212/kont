// src/modules/payroll/backend/domain/repository/payroll-settings.repository.ts
//
// Port (domain contract) for Payroll settings persistence per company.
// Infrastructure implementations live in src/modules/payroll/backend/infrastructure/.

import { Result }          from '@/src/core/domain/result';
import { PayrollSettings } from '../payroll-settings';

export interface IPayrollSettingsRepository {
    // Returns stored settings for a company, or null if none saved yet.
    findByCompany(companyId: string): Promise<Result<PayrollSettings | null>>;

    // Persists settings for a company — replaces the previous value.
    save(companyId: string, settings: PayrollSettings): Promise<Result<void>>;
}
