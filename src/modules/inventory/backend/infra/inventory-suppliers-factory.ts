// inventory-proveedores-factory — wires supplier and purchase invoice use cases.
// Role: sub-factory for the Suppliers + PurchaseInvoices domain slice of inventory.
// Consumers: inventory-factory.ts (aggregator) — do not import directly in API routes.
import { ServerSupabaseSource }          from '@/src/shared/backend/source/infra/server-supabase';
import { RpcSupplierRepository }         from './repository/rpc-supplier.repository';
import { RpcPurchaseInvoiceRepository }  from './repository/rpc-purchase-invoice.repository';
import { ListSuppliersUseCase }          from '../app/list-suppliers.use-case';
import { SaveSupplierUseCase }           from '../app/save-supplier.use-case';
import { DeleteSupplierUseCase }         from '../app/delete-supplier.use-case';
import { ListPurchaseInvoicesUseCase }   from '../app/list-purchase-invoices.use-case';
import { GetPurchaseInvoiceUseCase }     from '../app/get-purchase-invoice.use-case';
import { SavePurchaseInvoiceUseCase }    from '../app/save-purchase-invoice.use-case';
import { ConfirmPurchaseInvoiceUseCase } from '../app/confirm-purchase-invoice.use-case';
import { DeletePurchaseInvoiceUseCase }  from '../app/delete-purchase-invoice.use-case';

export function getInventorySuppliersActions(userId: string) {
    const source       = new ServerSupabaseSource();
    const supplierRepo = new RpcSupplierRepository(source, userId);
    const invoiceRepo  = new RpcPurchaseInvoiceRepository(source, userId);

    return {
        listSuppliers:          new ListSuppliersUseCase(supplierRepo),
        saveSupplier:           new SaveSupplierUseCase(supplierRepo),
        deleteSupplier:         new DeleteSupplierUseCase(supplierRepo),
        listPurchaseInvoices:   new ListPurchaseInvoicesUseCase(invoiceRepo),
        getPurchaseInvoice:     new GetPurchaseInvoiceUseCase(invoiceRepo),
        savePurchaseInvoice:    new SavePurchaseInvoiceUseCase(invoiceRepo),
        confirmPurchaseInvoice: new ConfirmPurchaseInvoiceUseCase(invoiceRepo),
        deletePurchaseInvoice:  new DeletePurchaseInvoiceUseCase(invoiceRepo),
    };
}
