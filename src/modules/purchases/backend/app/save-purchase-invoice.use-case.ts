// save-purchase-invoice.use-case — creates or updates a purchase invoice and its line items.
// Role: application command handler for the PurchaseInvoice domain slice.
// Invariants:
//  - items[] is OPTIONAL: header-only invoices are valid (flujo rápido contable).
//    Items pueden imputarse después desde la bandeja /inventory/compras-pendientes.
//  - a confirmed invoice cannot be modified; the caller must unconfirm first
//    (the RPC also enforces this — this guard fails fast with a clean error).
import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { PurchaseInvoice, PurchaseInvoiceItem } from '../domain/purchase-invoice';
import { IPurchaseInvoiceRepository } from '../domain/repository/purchase-invoice.repository';

interface Input { invoice: PurchaseInvoice; items: PurchaseInvoiceItem[]; }

export class SavePurchaseInvoiceUseCase extends UseCase<Input, PurchaseInvoice> {
    constructor(private readonly repo: IPurchaseInvoiceRepository) { super(); }

    async execute(input: Input): Promise<Result<PurchaseInvoice>> {
        if (!input.invoice.companyId) return Result.fail('companyId is required');
        if (!input.invoice.supplierId) return Result.fail('supplierId is required');

        if (input.invoice.id) {
            const current = await this.repo.findById(input.invoice.id);
            if (current.isSuccess && current.getValue().status === 'confirmada') {
                return Result.fail('No se puede modificar una factura confirmada. Desconfirma primero.');
            }
        }

        return this.repo.save(input.invoice, input.items ?? []);
    }
}
