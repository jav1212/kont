// inventory-reports-factory — wires reports/ledgers use cases for inventory.
// Role: sub-factory for the Reports domain slice of inventory (movements,
// product/supplier ledgers, period reports).
// Tax retention exports (TXT IVA / XML ISLR) moved to the Purchases module —
// see src/modules/purchases/backend/infra/purchases-factory.ts.
import { ServerSupabaseSource }            from '@/src/shared/backend/source/infra/server-supabase';
import { RpcPeriodReportRepository }       from './repository/rpc-period-report.repository';
import { SharedPeriodReportRepository }    from './repository/shared-period-report.repository';
import { RpcPurchaseLedgerRepository }     from './repository/rpc-purchase-ledger.repository';
import { SharedPurchaseLedgerRepository }  from './repository/shared-purchase-ledger.repository';
import { RpcIslrReportRepository }         from './repository/rpc-islr-report.repository';
import { SharedIslrReportRepository }      from './repository/shared-islr-report.repository';
import { SharedSalesLedgerRepository }     from './repository/shared-sales-ledger.repository';
import { RpcInventoryLedgerRepository }    from './repository/rpc-inventory-ledger.repository';
import { SharedInventoryLedgerRepository } from './repository/shared-inventory-ledger.repository';
import { RpcBalanceReportRepository }      from './repository/rpc-balance-report.repository';
import { SharedBalanceReportRepository }   from './repository/shared-balance-report.repository';
import { GetPeriodReportUseCase }          from '../app/get-period-report.use-case';
import { GetPurchaseLedgerUseCase }        from '../app/get-purchase-ledger.use-case';
import { GetIslrReportUseCase }            from '../app/get-islr-report.use-case';
import { GetSalesLedgerUseCase }           from '../app/get-sales-ledger.use-case';
import { GetInventoryLedgerUseCase }       from '../app/get-inventory-ledger.use-case';
import { GetBalanceReportUseCase }         from '../app/get-balance-report.use-case';
import { isSharedSchemaEnabled }           from '@/src/shared/backend/config/shared-schema-pilot';

export function getInventoryReportsActions(userId: string) {
    const source              = new ServerSupabaseSource();
    const sharedReports = isSharedSchemaEnabled(userId);
    const periodReportRepo = sharedReports
        ? new SharedPeriodReportRepository(source, userId)
        : new RpcPeriodReportRepository(source, userId);
    const purchaseLedgerRepo  = sharedReports ? new SharedPurchaseLedgerRepository(source, userId) : new RpcPurchaseLedgerRepository(source, userId);
    const islrReportRepo      = sharedReports ? new SharedIslrReportRepository(source, userId) : new RpcIslrReportRepository(source, userId);
    const salesLedgerRepo     = new SharedSalesLedgerRepository(source, userId);
    const inventoryLedgerRepo = sharedReports ? new SharedInventoryLedgerRepository(source, userId) : new RpcInventoryLedgerRepository(source, userId);
    const balanceReportRepo   = sharedReports ? new SharedBalanceReportRepository(source, userId) : new RpcBalanceReportRepository(source, userId);

    return {
        getPeriodReport:    new GetPeriodReportUseCase(periodReportRepo),
        getPurchaseLedger:  new GetPurchaseLedgerUseCase(purchaseLedgerRepo),
        getIslrReport:      new GetIslrReportUseCase(islrReportRepo),
        getSalesLedger:     new GetSalesLedgerUseCase(salesLedgerRepo),
        getInventoryLedger: new GetInventoryLedgerUseCase(inventoryLedgerRepo),
        getBalanceReport:   new GetBalanceReportUseCase(balanceReportRepo),
    };
}
