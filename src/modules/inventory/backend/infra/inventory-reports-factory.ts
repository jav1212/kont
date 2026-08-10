// inventory-reports-factory — wires reports/ledgers use cases for inventory.
// Role: sub-factory for the Reports domain slice of inventory (movements,
// product/supplier ledgers, period reports).
// Tax retention exports (TXT IVA / XML ISLR) moved to the Purchases module —
// see src/modules/purchases/backend/infra/purchases-factory.ts.
import { ServerSupabaseSource }            from '@/src/shared/backend/source/infra/server-supabase';
import { SharedPeriodReportRepository }    from './repository/shared-period-report.repository';
import { SharedPurchaseLedgerRepository }  from './repository/shared-purchase-ledger.repository';
import { SharedIslrReportRepository }      from './repository/shared-islr-report.repository';
import { SharedSalesLedgerRepository }     from './repository/shared-sales-ledger.repository';
import { SharedInventoryLedgerRepository } from './repository/shared-inventory-ledger.repository';
import { SharedBalanceReportRepository }   from './repository/shared-balance-report.repository';
import { GetPeriodReportUseCase }          from '../app/get-period-report.use-case';
import { GetPurchaseLedgerUseCase }        from '../app/get-purchase-ledger.use-case';
import { GetIslrReportUseCase }            from '../app/get-islr-report.use-case';
import { GetSalesLedgerUseCase }           from '../app/get-sales-ledger.use-case';
import { GetInventoryLedgerUseCase }       from '../app/get-inventory-ledger.use-case';
import { GetBalanceReportUseCase }         from '../app/get-balance-report.use-case';

export function getInventoryReportsActions(userId: string) {
    const source              = new ServerSupabaseSource();
    const periodReportRepo = new SharedPeriodReportRepository(source, userId);
    const purchaseLedgerRepo = new SharedPurchaseLedgerRepository(source, userId);
    const islrReportRepo = new SharedIslrReportRepository(source, userId);
    const salesLedgerRepo     = new SharedSalesLedgerRepository(source, userId);
    const inventoryLedgerRepo = new SharedInventoryLedgerRepository(source, userId);
    const balanceReportRepo = new SharedBalanceReportRepository(source, userId);

    return {
        getPeriodReport:    new GetPeriodReportUseCase(periodReportRepo),
        getPurchaseLedger:  new GetPurchaseLedgerUseCase(purchaseLedgerRepo),
        getIslrReport:      new GetIslrReportUseCase(islrReportRepo),
        getSalesLedger:     new GetSalesLedgerUseCase(salesLedgerRepo),
        getInventoryLedger: new GetInventoryLedgerUseCase(inventoryLedgerRepo),
        getBalanceReport:   new GetBalanceReportUseCase(balanceReportRepo),
    };
}
