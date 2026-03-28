// src/modules/payroll/backend/infrastructure/repository/rpc-payroll-settings.repository.ts
//
// Infrastructure layer — Supabase RPC implementation of IPayrollSettingsRepository.
// Reads/writes the payroll_settings JSONB column on the tenant companies table
// via the RPCs defined in migration 047_companies_payroll_settings.sql.

import { SupabaseClient }              from '@supabase/supabase-js';
import { IPayrollSettingsRepository }  from '../../domain/repository/payroll-settings.repository';
import { ISource }                     from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result }                      from '@/src/core/domain/result';
import { PayrollSettings }             from '../../domain/payroll-settings';

export class RpcPayrollSettingsRepository implements IPayrollSettingsRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly userId: string,
    ) {}

    async findByCompany(companyId: string): Promise<Result<PayrollSettings | null>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_company_get_payroll_settings', {
                    p_user_id:    this.userId,
                    p_company_id: companyId,
                });
            if (error) return Result.fail(error.message);
            // RPC returns '{}' when no settings saved — treat as null (caller uses defaults)
            if (!data || Object.keys(data as object).length === 0) return Result.success(null);
            return Result.success(data as PayrollSettings);
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error fetching payroll settings');
        }
    }

    async save(companyId: string, settings: PayrollSettings): Promise<Result<void>> {
        try {
            const { error } = await this.source.instance
                .rpc('tenant_company_save_payroll_settings', {
                    p_user_id:    this.userId,
                    p_company_id: companyId,
                    p_settings:   settings,
                });
            if (error) return Result.fail(error.message);
            return Result.success();
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error saving payroll settings');
        }
    }
}
