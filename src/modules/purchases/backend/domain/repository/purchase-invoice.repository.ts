// Repository interface: IPurchaseInvoiceRepository
// Domain port — infrastructure must implement this interface.
import { Result } from '@/src/core/domain/result';
import { PurchaseInvoice, PurchaseInvoiceItem } from '../purchase-invoice';
import { MigratePurchaseInvoicesResult } from '../migrate-purchase-invoices';

export interface IPurchaseInvoiceRepository {
  findByCompany(companyId: string): Promise<Result<PurchaseInvoice[]>>;
  findById(invoiceId: string): Promise<Result<PurchaseInvoice>>;
  save(invoice: PurchaseInvoice, items: PurchaseInvoiceItem[]): Promise<Result<PurchaseInvoice>>;
  confirm(invoiceId: string): Promise<Result<PurchaseInvoice>>;
  unconfirm(invoiceId: string): Promise<Result<PurchaseInvoice>>;
  /**
   * Imputa items a una factura ya confirmada que se creó sólo con header.
   * Crea movimientos, actualiza stock y recalcula totales desde los items.
   */
  imputeItems(invoiceId: string, items: PurchaseInvoiceItem[]): Promise<Result<PurchaseInvoice>>;
  delete(invoiceId: string): Promise<Result<void>>;
  migrate(
    invoiceIds:      string[],
    targetCompanyId: string,
    targetPeriod?:   string | null,
  ): Promise<Result<MigratePurchaseInvoicesResult>>;
}
