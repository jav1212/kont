// sales-factory — wires all use cases of the Sales module.
// Owns: customers + sales invoices + IGTF percepción quincenal aggregate.
// Consumed directly by API routes under app/api/sales/*.
import { ServerSupabaseSource }       from '@/src/shared/backend/source/infra/server-supabase';
import { SharedCustomerRepository }   from './repository/shared-customer.repository';
import { SharedSalesInvoiceRepository } from './repository/shared-sales-invoice.repository';
import { SharedIgtfFortnightlyRepository } from './repository/shared-igtf-fortnightly.repository';

import { ListCustomersUseCase }       from '../app/list-customers.use-case';
import { SaveCustomerUseCase }        from '../app/save-customer.use-case';
import { DeleteCustomerUseCase }      from '../app/delete-customer.use-case';
import { ListSalesInvoicesUseCase }   from '../app/list-sales-invoices.use-case';
import { GetSalesInvoiceUseCase }     from '../app/get-sales-invoice.use-case';
import { SaveSalesInvoiceUseCase }    from '../app/save-sales-invoice.use-case';
import { ConfirmSalesInvoiceUseCase } from '../app/confirm-sales-invoice.use-case';
import { UnconfirmSalesInvoiceUseCase } from '../app/unconfirm-sales-invoice.use-case';
import { DeleteSalesInvoiceUseCase }  from '../app/delete-sales-invoice.use-case';
import { GetIgtfFortnightlyReportUseCase } from '../app/get-igtf-fortnightly-report.use-case';

export function getSalesActions(userId: string) {
    const source = new ServerSupabaseSource();
    const customerRepo = new SharedCustomerRepository(source, userId);
    const invoiceRepo = new SharedSalesInvoiceRepository(source, userId);
    const igtfFortnightlyRepo = new SharedIgtfFortnightlyRepository(source, userId);

    return {
        listCustomers:           new ListCustomersUseCase(customerRepo),
        saveCustomer:            new SaveCustomerUseCase(customerRepo),
        deleteCustomer:          new DeleteCustomerUseCase(customerRepo),
        listSalesInvoices:       new ListSalesInvoicesUseCase(invoiceRepo),
        getSalesInvoice:         new GetSalesInvoiceUseCase(invoiceRepo),
        saveSalesInvoice:        new SaveSalesInvoiceUseCase(invoiceRepo),
        confirmSalesInvoice:     new ConfirmSalesInvoiceUseCase(invoiceRepo),
        unconfirmSalesInvoice:   new UnconfirmSalesInvoiceUseCase(invoiceRepo),
        deleteSalesInvoice:      new DeleteSalesInvoiceUseCase(invoiceRepo),
        getIgtfFortnightlyReport:   new GetIgtfFortnightlyReportUseCase(igtfFortnightlyRepo),
    };
}
