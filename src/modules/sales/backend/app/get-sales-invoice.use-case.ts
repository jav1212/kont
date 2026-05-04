import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { SalesInvoice } from '../domain/sales-invoice';
import { ISalesInvoiceRepository } from '../domain/repository/sales-invoice.repository';

interface Input { invoiceId: string; }

export class GetSalesInvoiceUseCase extends UseCase<Input, SalesInvoice> {
    constructor(private readonly repo: ISalesInvoiceRepository) { super(); }
    async execute(input: Input): Promise<Result<SalesInvoice>> {
        if (!input.invoiceId) return Result.fail('invoiceId is required');
        return this.repo.findById(input.invoiceId);
    }
}
