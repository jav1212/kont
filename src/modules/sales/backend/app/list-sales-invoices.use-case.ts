import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { SalesInvoice } from '../domain/sales-invoice';
import { ISalesInvoiceRepository } from '../domain/repository/sales-invoice.repository';

interface Input { companyId: string; }

export class ListSalesInvoicesUseCase extends UseCase<Input, SalesInvoice[]> {
    constructor(private readonly repo: ISalesInvoiceRepository) { super(); }
    async execute(input: Input): Promise<Result<SalesInvoice[]>> {
        if (!input.companyId) return Result.fail('companyId is required');
        return this.repo.findByCompany(input.companyId);
    }
}
