import { Result } from '@/src/core/domain/result';
import { SalesInvoice, SalesInvoiceItem } from '../sales-invoice';

export interface ISalesInvoiceRepository {
    findByCompany(companyId: string):  Promise<Result<SalesInvoice[]>>;
    findById(id: string):               Promise<Result<SalesInvoice>>;
    save(invoice: SalesInvoice, items: SalesInvoiceItem[]): Promise<Result<SalesInvoice>>;
    confirm(id: string, actorUserId: string, allowNegativeStock?: boolean, registerId?: string): Promise<Result<SalesInvoice>>;
    unconfirm(id: string):              Promise<Result<SalesInvoice>>;
    delete(id: string):                 Promise<Result<void>>;
}
