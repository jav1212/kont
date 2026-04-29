// inventory-adjustments-factory — wires the stock adjustment use cases.
// Role: sub-factory for the Stock Adjustment slice of inventory.
// Consumers: inventory-factory.ts (aggregator) — do not import directly in API routes.
//
// Stock adjustments modify product.currentStock directly without creating
// kardex movements. Distribution targets are computed against the SAME totals
// the user sees in /inventory/balance-report (RPC tenant_inventario_reporte_saldo)
// so "Entradas Bs" and "Ventas S/IVA Bs" coincide exactly.
import { ServerSupabaseSource }            from '@/src/shared/backend/source/infra/server-supabase';
import { RpcProductRepository }            from './repository/rpc-product.repository';
import { RpcBalanceReportRepository }      from './repository/rpc-balance-report.repository';
import { GenerateStockAdjustmentUseCase }  from '../app/generate-stock-adjustment.use-case';
import { SaveStockAdjustmentUseCase }      from '../app/save-stock-adjustment.use-case';

export function getInventoryAdjustmentsActions(userId: string) {
    const source            = new ServerSupabaseSource();
    const productRepo       = new RpcProductRepository(source, userId);
    const balanceReportRepo = new RpcBalanceReportRepository(source, userId);

    return {
        generateStockAdjustment: new GenerateStockAdjustmentUseCase(productRepo, balanceReportRepo),
        saveStockAdjustment:     new SaveStockAdjustmentUseCase(productRepo),
    };
}
