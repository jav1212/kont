// inventory-reportes-factory — wires all report and ledger use cases.
// Role: sub-factory for the Reports domain slice of inventory.
// Consumers: inventory-factory.ts (aggregator) — do not import directly in API routes.
import { ServerSupabaseSource }         from '@/src/shared/backend/source/infra/server-supabase';
import { RpcPeriodReportRepository }    from './repository/rpc-period-report.repository';
import { RpcPurchaseLedgerRepository }  from './repository/rpc-purchase-ledger.repository';
import { RpcIslrReportRepository }      from './repository/rpc-islr-report.repository';
import { RpcSalesLedgerRepository }     from './repository/rpc-sales-ledger.repository';
import { RpcInventoryLedgerRepository } from './repository/rpc-inventory-ledger.repository';
import { RpcBalanceReportRepository }   from './repository/rpc-balance-report.repository';
import { GetPeriodReportUseCase }       from '../app/get-period-report.use-case';
import { GetPurchaseLedgerUseCase }     from '../app/get-purchase-ledger.use-case';
import { GetIslrReportUseCase }         from '../app/get-islr-report.use-case';
import { GetSalesLedgerUseCase }        from '../app/get-sales-ledger.use-case';
import { GetInventoryLedgerUseCase }    from '../app/get-inventory-ledger.use-case';
import { GetBalanceReportUseCase }      from '../app/get-balance-report.use-case';

export function getInventoryReportsActions(userId: string) {
    const source              = new ServerSupabaseSource();
    const periodReportRepo    = new RpcPeriodReportRepository(source, userId);
    const purchaseLedgerRepo  = new RpcPurchaseLedgerRepository(source, userId);
    const islrReportRepo      = new RpcIslrReportRepository(source, userId);
    const salesLedgerRepo     = new RpcSalesLedgerRepository(source, userId);
    const inventoryLedgerRepo = new RpcInventoryLedgerRepository(source, userId);
    const balanceReportRepo   = new RpcBalanceReportRepository(source, userId);

    return {
        getPeriodReport:    new GetPeriodReportUseCase(periodReportRepo),
        getPurchaseLedger:  new GetPurchaseLedgerUseCase(purchaseLedgerRepo),
        getIslrReport:      new GetIslrReportUseCase(islrReportRepo),
        getSalesLedger:     new GetSalesLedgerUseCase(salesLedgerRepo),
        getInventoryLedger: new GetInventoryLedgerUseCase(inventoryLedgerRepo),
        getBalanceReport:   new GetBalanceReportUseCase(balanceReportRepo),
    };
}
