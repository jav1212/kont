// purchases-factory — wires all use cases of the Compras module.
// Owns: suppliers + purchase invoices + tax retention exports (IVA/ISLR).
// Consumed directly by API routes under app/api/compras/*.
import { ServerSupabaseSource }              from '@/src/shared/backend/source/infra/server-supabase';
import { SharedSupplierRepository }          from './repository/shared-supplier.repository';
import { SharedPurchaseInvoiceRepository }   from './repository/shared-purchase-invoice.repository';
import { SharedIvaRetentionExportRepository } from './repository/shared-iva-retention-export.repository';
import { SharedIslrRetentionsExportRepository } from './repository/shared-islr-retentions-export.repository';
import { SharedPurchaseCsvImportRepository } from './repository/shared-purchase-csv-import.repository';

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
import { ListPurchaseCsvImportsUseCase } from '../app/list-purchase-csv-imports.use-case';
import { GetPurchaseCsvImportUseCase } from '../app/get-purchase-csv-import.use-case';
import { GetPurchaseCsvImportByInvoiceUseCase } from '../app/get-purchase-csv-import-by-invoice.use-case';
import { SavePurchaseCsvImportUseCase } from '../app/save-purchase-csv-import.use-case';
import { ExecutePurchaseCsvImportUseCase } from '../app/execute-purchase-csv-import.use-case';

/**
 * Wires purchase use cases to shared-schema repositories for an authorized tenant.
 * @param userId - Authorized tenant identifier retained under the legacy argument name.
 * @returns Purchase, supplier, export and staged-import actions with explicit dependencies.
 */
export function getPurchasesActions(userId: string) {
    const source                  = new ServerSupabaseSource();
    const supplierRepo = new SharedSupplierRepository(source, userId);
    const invoiceRepo = new SharedPurchaseInvoiceRepository(source, userId);
    const ivaRetentionExportRepo = new SharedIvaRetentionExportRepository(source, userId);
    const islrRetentionsExportRepo = new SharedIslrRetentionsExportRepository(source, userId);
    const purchaseCsvImportRepo = new SharedPurchaseCsvImportRepository(source, userId);

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
        // Guided purchase CSV imports
        listPurchaseCsvImports: new ListPurchaseCsvImportsUseCase(purchaseCsvImportRepo),
        getPurchaseCsvImport: new GetPurchaseCsvImportUseCase(purchaseCsvImportRepo),
        getPurchaseCsvImportByInvoice: new GetPurchaseCsvImportByInvoiceUseCase(purchaseCsvImportRepo),
        savePurchaseCsvImport: new SavePurchaseCsvImportUseCase(purchaseCsvImportRepo),
        executePurchaseCsvImport: new ExecutePurchaseCsvImportUseCase(purchaseCsvImportRepo),
    };
}
