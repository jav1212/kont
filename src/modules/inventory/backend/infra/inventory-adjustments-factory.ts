// inventory-adjustments-factory — wires the stock adjustment use cases.
// Role: sub-factory for the Stock Adjustment slice of inventory.
// Consumers: inventory-factory.ts (aggregator) — do not import directly in API routes.
//
// Stock adjustments modify product.currentStock directly without creating
// kardex movements. Distribution targets are computed against the same totals
// the user sees in /inventory/balance-report.
import { ServerSupabaseSource }            from '@/src/shared/backend/source/infra/server-supabase';
import { SharedProductRepository }         from './repository/shared-product.repository';
import { SharedBalanceReportRepository }   from './repository/shared-balance-report.repository';
import { GenerateStockAdjustmentUseCase }  from '../app/generate-stock-adjustment.use-case';
import { SaveStockAdjustmentUseCase }      from '../app/save-stock-adjustment.use-case';

export function getInventoryAdjustmentsActions(userId: string) {
    const source            = new ServerSupabaseSource();
    const productRepo = new SharedProductRepository(source, userId);
    const balanceReportRepo = new SharedBalanceReportRepository(source, userId);

    return {
        generateStockAdjustment: new GenerateStockAdjustmentUseCase(productRepo, balanceReportRepo),
        saveStockAdjustment:     new SaveStockAdjustmentUseCase(productRepo),
    };
}
