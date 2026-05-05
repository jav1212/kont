// impute-purchase-invoice-items.use-case — flujo rápido de compras.
// Imputa items a una factura ya confirmada que se creó sólo con header
// (proveedor + total declarado). La RPC actualiza stock, crea movimientos,
// recalcula el header (subtotal/iva/total) desde los items, y devuelve la
// factura actualizada. La diferencia entre el total previo (declarado) y el
// nuevo (calculado desde items) la maneja el caller volviendo a disparar la
// integración contable con los nuevos montos.
import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { PurchaseInvoice, PurchaseInvoiceItem } from '../domain/purchase-invoice';
import { IPurchaseInvoiceRepository } from '../domain/repository/purchase-invoice.repository';

interface Input {
    invoiceId: string;
    items: PurchaseInvoiceItem[];
}

export class ImputePurchaseInvoiceItemsUseCase extends UseCase<Input, PurchaseInvoice> {
    constructor(private readonly repo: IPurchaseInvoiceRepository) { super(); }

    async execute(input: Input): Promise<Result<PurchaseInvoice>> {
        if (!input.invoiceId) return Result.fail('invoiceId is required');
        if (!input.items?.length) return Result.fail('Debe imputar al menos un item');
        for (const it of input.items) {
            if (!it.productId) return Result.fail('Cada item debe tener producto');
            if (!(it.quantity > 0)) return Result.fail('Cada item debe tener cantidad > 0');
        }
        return this.repo.imputeItems(input.invoiceId, input.items);
    }
}
