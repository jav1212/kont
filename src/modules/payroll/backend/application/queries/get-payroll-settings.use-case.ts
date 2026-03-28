// src/modules/payroll/backend/application/queries/get-payroll-settings.use-case.ts
//
// Query — returns the current PayrollSettings for a company.
// Falls back to defaults when no settings have been saved yet.
// Never mutates state.

import { Result }                        from '@/src/core/domain/result';
import { IPayrollSettingsRepository }    from '../../domain/repository/payroll-settings.repository';
import { PayrollSettings, mergePayrollSettings } from '../../domain/payroll-settings';

export class GetPayrollSettingsUseCase {
    constructor(private readonly repo: IPayrollSettingsRepository) {}

    async execute(companyId: string): Promise<Result<PayrollSettings>> {
        const result = await this.repo.findByCompany(companyId);
        if (result.isFailure) return Result.fail(result.getError());
        // mergePayrollSettings fills missing keys with defaults
        return Result.success(mergePayrollSettings(result.getValue() ?? {}));
    }
}
