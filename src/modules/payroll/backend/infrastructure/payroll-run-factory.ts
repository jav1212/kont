// Infrastructure layer — assembles the payroll run dependency graph.
// Wires RpcPayrollRunRepository (canonical) into all use cases.
// Invariant: always use RpcPayrollRunRepository; the legacy SupabasePayrollRunRepository was removed in Phase 3.
import { ServerSupabaseSource }          from '@/src/shared/backend/source/infra/server-supabase';
import { LocalEventBus }                 from '@/src/shared/backend/infra/local-event-bus';
import { RpcPayrollRunRepository }        from './repository/rpc-payroll-run.repository';
import { ConfirmPayrollRunUseCase }    from '../application/commands/confirm-payroll-run.use-case';
import { SaveDraftPayrollRunUseCase }  from '../application/commands/save-draft-payroll-run.use-case';
import { GetPayrollRunsUseCase }       from '../application/queries/get-payroll-runs.use-case';
import { GetPayrollReceiptsUseCase }   from '../application/queries/get-payroll-receipts.use-case';

export function getPayrollRunActions(userId: string) {
    const source     = new ServerSupabaseSource();
    const repository = new RpcPayrollRunRepository(source, userId);
    const eventBus   = new LocalEventBus();

    return {
        confirm:     new ConfirmPayrollRunUseCase(repository, eventBus),
        saveDraft:   new SaveDraftPayrollRunUseCase(repository),
        getRuns:     new GetPayrollRunsUseCase(repository),
        getReceipts: new GetPayrollReceiptsUseCase(repository),
    };
}
