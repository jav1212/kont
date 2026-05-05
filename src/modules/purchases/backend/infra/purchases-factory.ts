// purchases-factory — wires all use cases of the Compras module.
// Owns: suppliers + purchase invoices + tax retention exports (IVA/ISLR).
// Consumed directly by API routes under app/api/compras/*.
import { ServerSupabaseSource }              from '@/src/shared/backend/source/infra/server-supabase';
import { RpcSupplierRepository }             from './repository/rpc-supplier.repository';
import { RpcPurchaseInvoiceRepository }      from './repository/rpc-purchase-invoice.repository';
import { RpcIvaRetentionExportRepository }   from './repository/rpc-iva-retention-export.repository';
import { RpcIslrRetentionsExportRepository } from './repository/rpc-islr-retentions-export.repository';

import { ListSuppliersUseCase }            from '../app/list-suppliers.use-case';
import { SaveSupplierUseCase }             from '../app/save-supplier.use-case';
import { DeleteSupplierUseCase }           from '../app/delete-supplier.use-case';
import { ListPurchaseInvoicesUseCase }     from '../app/list-purchase-invoices.use-case';
import { GetPurchaseInvoiceUseCase }       from '../app/get-purchase-invoice.use-case';
import { SavePurchaseInvoiceUseCase }      from '../app/save-purchase-invoice.use-case';
import { ConfirmPurchaseInvoiceUseCase }   from '../app/confirm-purchase-invoice.use-case';
import { UnconfirmPurchaseInvoiceUseCase } from '../app/unconfirm-purchase-invoice.use-case';
import { ImputePurchaseInvoiceItemsUseCase } from '../app/impute-purchase-invoice-items.use-case';
import { DeletePurchaseInvoiceUseCase }    from '../app/delete-purchase-invoice.use-case';
import { MigratePurchaseInvoicesUseCase }  from '../app/migrate-purchase-invoices.use-case';
import { GetIvaRetentionExportUseCase }    from '../app/get-iva-retention-export.use-case';
import { GetIslrRetentionsExportUseCase }  from '../app/get-islr-retentions-export.use-case';

export function getPurchasesActions(userId: string) {
    const source                  = new ServerSupabaseSource();
    const supplierRepo            = new RpcSupplierRepository(source, userId);
    const invoiceRepo             = new RpcPurchaseInvoiceRepository(source, userId);
    const ivaRetentionExportRepo  = new RpcIvaRetentionExportRepository(source, userId);
    const islrRetentionsExportRepo = new RpcIslrRetentionsExportRepository(source, userId);

    return {
        // Suppliers
        listSuppliers:           new ListSuppliersUseCase(supplierRepo),
        saveSupplier:            new SaveSupplierUseCase(supplierRepo),
        deleteSupplier:          new DeleteSupplierUseCase(supplierRepo),
        // Purchase invoices
        listPurchaseInvoices:    new ListPurchaseInvoicesUseCase(invoiceRepo),
        getPurchaseInvoice:      new GetPurchaseInvoiceUseCase(invoiceRepo),
        savePurchaseInvoice:     new SavePurchaseInvoiceUseCase(invoiceRepo),
        confirmPurchaseInvoice:  new ConfirmPurchaseInvoiceUseCase(invoiceRepo),
        unconfirmPurchaseInvoice:new UnconfirmPurchaseInvoiceUseCase(invoiceRepo),
        imputePurchaseInvoiceItems: new ImputePurchaseInvoiceItemsUseCase(invoiceRepo),
        deletePurchaseInvoice:   new DeletePurchaseInvoiceUseCase(invoiceRepo),
        migratePurchaseInvoices: new MigratePurchaseInvoicesUseCase(invoiceRepo),
        // SENIAT exports
        getIvaRetentionExport:   new GetIvaRetentionExportUseCase(ivaRetentionExportRepo),
        getIslrRetentionsExport: new GetIslrRetentionsExportUseCase(islrRetentionsExportRepo),
    };
}
