// migrate-purchase-invoices.use-case — moves a batch of purchase invoices from
// their current company to a different one inside the same tenant. Confirmed
// invoices are silently desconfirmed in source (movements reverted) and
// reconfirmed in destination (movements regenerated against destination's
// average cost). Missing supplier or products in the destination are
// auto-cloned by RIF / codigo (fallback nombre).
// Role: application command handler for the PurchaseInvoice domain slice.
import { UseCase } from '@/src/core/domain/use-case';
import { Result }  from '@/src/core/domain/result';
import { IPurchaseInvoiceRepository } from '../domain/repository/purchase-invoice.repository';
import { MigratePurchaseInvoicesResult } from '../domain/migrate-purchase-invoices';

const PERIOD_RX = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

export interface MigratePurchaseInvoicesInput {
    invoiceIds:      string[];
    targetCompanyId: string;
    /**
     * Optional override. When provided (YYYY-MM), every invoice in the batch
     * is moved into that período en la empresa destino, with periodo_manual=true.
     * When omitted/empty, each factura conserva su período original.
     */
    targetPeriod?:   string | null;
}

export class MigratePurchaseInvoicesUseCase extends UseCase<
    MigratePurchaseInvoicesInput,
    MigratePurchaseInvoicesResult
> {
    constructor(private readonly repo: IPurchaseInvoiceRepository) { super(); }

    async execute(input: MigratePurchaseInvoicesInput): Promise<Result<MigratePurchaseInvoicesResult>> {
        if (!Array.isArray(input.invoiceIds) || input.invoiceIds.length === 0) {
            return Result.fail('Selecciona al menos una factura para migrar');
        }
        if (!input.targetCompanyId) {
            return Result.fail('La empresa destino es requerida');
        }
        const period = input.targetPeriod?.trim() || null;
        if (period && !PERIOD_RX.test(period)) {
            return Result.fail(`Período destino "${period}" no tiene formato YYYY-MM`);
        }
        return this.repo.migrate(input.invoiceIds, input.targetCompanyId, period);
    }
}
