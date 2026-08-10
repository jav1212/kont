// Infrastructure layer — assembles the payroll run dependency graph.
import { ServerSupabaseSource }          from '@/src/shared/backend/source/infra/server-supabase';
import { LocalEventBus }                 from '@/src/shared/backend/infra/local-event-bus';
import { SharedPayrollRunRepository }     from './repository/shared-payroll-run.repository';
import { ConfirmPayrollRunUseCase }    from '../application/commands/confirm-payroll-run.use-case';
import { UnconfirmPayrollRunUseCase }  from '../application/commands/unconfirm-payroll-run.use-case';
import { SaveDraftPayrollRunUseCase }  from '../application/commands/save-draft-payroll-run.use-case';
import { GetPayrollRunsUseCase }       from '../application/queries/get-payroll-runs.use-case';
import { GetPayrollReceiptsUseCase }   from '../application/queries/get-payroll-receipts.use-case';

export function getPayrollRunActions(userId: string) {
    const source     = new ServerSupabaseSource();
    const repository = new SharedPayrollRunRepository(source, userId);
    const eventBus   = new LocalEventBus();

    return {
        confirm:     new ConfirmPayrollRunUseCase(repository, eventBus),
        unconfirm:   new UnconfirmPayrollRunUseCase(repository),
        saveDraft:   new SaveDraftPayrollRunUseCase(repository),
        getRuns:     new GetPayrollRunsUseCase(repository),
        getReceipts: new GetPayrollReceiptsUseCase(repository),
    };
}
