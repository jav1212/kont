// unconfirm-purchase-invoice.use-case — reverts stock movements generated when
// the invoice was confirmed and flips estado back to 'borrador'. Enables the
// frontend to edit an already-confirmed invoice (rate, decimals, items) by
// orchestrating `unconfirm → save → confirm` against the same id.
// Role: application command handler for the PurchaseInvoice domain slice.
import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { PurchaseInvoice } from '../domain/purchase-invoice';
import { IPurchaseInvoiceRepository } from '../domain/repository/purchase-invoice.repository';

interface Input { invoiceId: string; }

export class UnconfirmPurchaseInvoiceUseCase extends UseCase<Input, PurchaseInvoice> {
    constructor(private readonly repo: IPurchaseInvoiceRepository) { super(); }

    async execute(input: Input): Promise<Result<PurchaseInvoice>> {
        if (!input.invoiceId) return Result.fail('invoiceId is required');
        return this.repo.unconfirm(input.invoiceId);
    }
}
