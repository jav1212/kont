// src/modules/payroll/backend/application/commands/save-payroll-settings.use-case.ts
//
// Command — persists PayrollSettings for a company.
// Replaces any previously stored settings; does not diff or merge.

import { Result }                      from '@/src/core/domain/result';
import { IPayrollSettingsRepository }  from '../../domain/repository/payroll-settings.repository';
import { PayrollSettings }             from '../../domain/payroll-settings';

export class SavePayrollSettingsUseCase {
    constructor(private readonly repo: IPayrollSettingsRepository) {}

    async execute(companyId: string, settings: PayrollSettings): Promise<Result<void>> {
        return this.repo.save(companyId, settings);
    }
}
