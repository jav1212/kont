// confirm-purchase-invoice.use-case — confirms a draft purchase invoice, triggering stock movements.
// Role: application command handler for the PurchaseInvoice domain slice.
// Invariant: only invoices in draft status may be confirmed; enforcement is in the repository/DB layer.
import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { PurchaseInvoice } from '../domain/purchase-invoice';
import { IPurchaseInvoiceRepository } from '../domain/repository/purchase-invoice.repository';

interface Input { invoiceId: string; }

export class ConfirmPurchaseInvoiceUseCase extends UseCase<Input, PurchaseInvoice> {
    constructor(private readonly repo: IPurchaseInvoiceRepository) { super(); }

    async execute(input: Input): Promise<Result<PurchaseInvoice>> {
        if (!input.invoiceId) return Result.fail('invoiceId is required');
        return this.repo.confirm(input.invoiceId);
    }
}
