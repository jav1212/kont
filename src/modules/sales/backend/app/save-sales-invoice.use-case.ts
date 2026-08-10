import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { SalesInvoice, SalesInvoiceItem } from '../domain/sales-invoice';
import { ISalesInvoiceRepository } from '../domain/repository/sales-invoice.repository';
import { isCurrencyCode, isLocalCurrency, normalizeCurrencyCode, rateForCurrency } from '@/src/modules/inventory/shared/currency';

interface Input { invoice: SalesInvoice; items: SalesInvoiceItem[]; }

export class SaveSalesInvoiceUseCase extends UseCase<Input, SalesInvoice> {
    constructor(private readonly repo: ISalesInvoiceRepository) { super(); }
    async execute(input: Input): Promise<Result<SalesInvoice>> {
        if (!input.invoice.companyId)  return Result.fail('companyId is required');
        if (!input.invoice.customerId) return Result.fail('customerId is required');
        if (!input.invoice.date)       return Result.fail('date is required');
        if (!Array.isArray(input.items) || input.items.length === 0) {
            return Result.fail('At least one item is required');
        }
        const invoiceCurrency = normalizeCurrencyCode(input.invoice.currency);
        if (!isCurrencyCode(invoiceCurrency)) return Result.fail('Código de moneda inválido');
        for (const item of input.items) {
            const code = normalizeCurrencyCode(item.currency ?? invoiceCurrency);
            const rate = item.exchangeRate ?? item.dollarRate ?? rateForCurrency(code, input.invoice.exchangeRates ?? []);
            if (!isCurrencyCode(code)) return Result.fail(`Código de moneda inválido: ${code}`);
            if (!isLocalCurrency(code) && (!rate || rate <= 0)) return Result.fail(`Falta una tasa válida para ${code}`);
        }
        return this.repo.save(input.invoice, input.items);
    }
}
