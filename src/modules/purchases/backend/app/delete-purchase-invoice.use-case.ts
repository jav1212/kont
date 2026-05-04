// delete-purchase-invoice.use-case — removes a purchase invoice and its items.
// Role: application command handler for the PurchaseInvoice domain slice.
import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { IPurchaseInvoiceRepository } from '../domain/repository/purchase-invoice.repository';

interface Input { invoiceId: string; }

export class DeletePurchaseInvoiceUseCase extends UseCase<Input, void> {
    constructor(private readonly repo: IPurchaseInvoiceRepository) { super(); }

    async execute(input: Input): Promise<Result<void>> {
        if (!input.invoiceId) return Result.fail('invoiceId is required');
        return this.repo.delete(input.invoiceId);
    }
}
