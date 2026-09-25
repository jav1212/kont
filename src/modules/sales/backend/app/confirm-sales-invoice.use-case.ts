import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { SalesInvoice } from '../domain/sales-invoice';
import { ISalesInvoiceRepository } from '../domain/repository/sales-invoice.repository';
import { companyId } from '@kontave/companies/domain';
import { currency, exactDecimal, moneyFromDecimal } from '@kontave/monetary/domain';
import {
    createCustomerReceivableFromConfirmedCreditInvoice,
    customerId,
    customerReceivableId,
    salesDate,
    salesInstant,
} from '@kontave/sales/domain';

interface Input { invoiceId: string; actorUserId: string; allowNegativeStock?: boolean; registerId?: string; }

export class ConfirmSalesInvoiceUseCase extends UseCase<Input, SalesInvoice> {
    constructor(private readonly repo: ISalesInvoiceRepository) { super(); }
    async execute(input: Input): Promise<Result<SalesInvoice>> {
        if (!input.invoiceId) return Result.fail('invoiceId is required');
        if (!input.actorUserId) return Result.fail('actorUserId is required');
        const draftResult = await this.repo.findById(input.invoiceId);
        if (draftResult.isFailure) return Result.fail(draftResult.getError());
        const draft = draftResult.getValue();
        if (draft.paymentTerms === 'credito') {
            try {
                if (!draft.creditCurrency || draft.creditAmount === null || draft.creditAmount === undefined
                    || draft.creditExchangeRate === null || draft.creditExchangeRate === undefined
                    || !draft.creditRateEffectiveDate || !draft.creditRateSource || !draft.dueDate) {
                    return Result.fail('Credit sale is missing its currency, amount, rate snapshot, or due date');
                }
                const debtCurrency = currency(draft.creditCurrency, 8);
                createCustomerReceivableFromConfirmedCreditInvoice({
                    receivableId: customerReceivableId(draft.id),
                    companyId: companyId(draft.companyId),
                    customerId: customerId(draft.customerId),
                    customerIdentified: !draft.customerId.startsWith('consumer-final:'),
                    invoiceReference: draft.id,
                    saleDate: salesDate(draft.date),
                    principal: moneyFromDecimal(String(draft.creditAmount), debtCurrency),
                    debtVesRate: {
                        currency: debtCurrency,
                        vesPerUnit: exactDecimal(String(draft.creditExchangeRate)),
                        effectiveDate: salesDate(draft.creditRateEffectiveDate),
                        capturedAt: salesInstant(new Date().toISOString()),
                        source: draft.creditRateSource,
                    },
                    dueDate: salesDate(draft.dueDate),
                });
            } catch (error) {
                return Result.fail(error instanceof Error ? error.message : 'Credit sale details are invalid');
            }
        }
        return this.repo.confirm(input.invoiceId, input.actorUserId, input.allowNegativeStock === true, input.registerId);
    }
}
