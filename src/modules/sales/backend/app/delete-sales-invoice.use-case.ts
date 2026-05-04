import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { ISalesInvoiceRepository } from '../domain/repository/sales-invoice.repository';

interface Input { invoiceId: string; }

export class DeleteSalesInvoiceUseCase extends UseCase<Input, void> {
    constructor(private readonly repo: ISalesInvoiceRepository) { super(); }
    async execute(input: Input): Promise<Result<void>> {
        if (!input.invoiceId) return Result.fail('invoiceId is required');
        return this.repo.delete(input.invoiceId);
    }
}
