// Repository interface: IPurchaseInvoiceRepository
// Domain port — infrastructure must implement this interface.
import { Result } from '@/src/core/domain/result';
import { PurchaseInvoice, PurchaseInvoiceItem } from '../purchase-invoice';

export interface IPurchaseInvoiceRepository {
  findByCompany(companyId: string): Promise<Result<PurchaseInvoice[]>>;
  findById(invoiceId: string): Promise<Result<PurchaseInvoice>>;
  save(invoice: PurchaseInvoice, items: PurchaseInvoiceItem[]): Promise<Result<PurchaseInvoice>>;
  confirm(invoiceId: string): Promise<Result<PurchaseInvoice>>;
  delete(invoiceId: string): Promise<Result<void>>;
}
