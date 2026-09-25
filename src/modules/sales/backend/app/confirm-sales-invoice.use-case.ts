import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { SalesInvoice } from '../domain/sales-invoice';
import { ISalesInvoiceRepository } from '../domain/repository/sales-invoice.repository';

interface Input { invoiceId: string; actorUserId: string; allowNegativeStock?: boolean; registerId?: string; }

export class ConfirmSalesInvoiceUseCase extends UseCase<Input, SalesInvoice> {
    constructor(private readonly repo: ISalesInvoiceRepository) { super(); }
    async execute(input: Input): Promise<Result<SalesInvoice>> {
        if (!input.invoiceId) return Result.fail('invoiceId is required');
        if (!input.actorUserId) return Result.fail('actorUserId is required');
        return this.repo.confirm(input.invoiceId, input.actorUserId, input.allowNegativeStock === true, input.registerId);
    }
}
