// get-purchase-invoice.use-case — retrieves a single purchase invoice with its items.
// Role: application query handler for the PurchaseInvoice domain slice.
import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { PurchaseInvoice } from '../domain/purchase-invoice';
import { IPurchaseInvoiceRepository } from '../domain/repository/purchase-invoice.repository';

interface Input { invoiceId: string; }

export class GetPurchaseInvoiceUseCase extends UseCase<Input, PurchaseInvoice> {
    constructor(private readonly repo: IPurchaseInvoiceRepository) { super(); }

    async execute(input: Input): Promise<Result<PurchaseInvoice>> {
        if (!input.invoiceId) return Result.fail('invoiceId is required');
        return this.repo.findById(input.invoiceId);
    }
}
