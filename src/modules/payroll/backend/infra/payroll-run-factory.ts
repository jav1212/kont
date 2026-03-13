import { ServerSupabaseSource }          from '@/src/shared/backend/source/infra/server-supabase';
import { RpcPayrollRunRepository }        from './repository/rpc-payroll-run.repository';
import { ConfirmPayrollRunUseCase }       from '../app/confirm-payroll-run.case';
import { GetPayrollRunsUseCase }          from '../app/get-payroll-runs.case';
import { GetPayrollReceiptsUseCase }      from '../app/get-payroll-receipts.case';

export function getPayrollRunActions(userId: string) {
    const source     = new ServerSupabaseSource();
    const repository = new RpcPayrollRunRepository(source, userId);

    return {
        confirm:     new ConfirmPayrollRunUseCase(repository),
        getRuns:     new GetPayrollRunsUseCase(repository),
        getReceipts: new GetPayrollReceiptsUseCase(repository),
    };
}
