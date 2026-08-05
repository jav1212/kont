import { SupabaseClient } from '@supabase/supabase-js';
import { Result } from '@/src/core/domain/result';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { IPurchaseLedgerRepository } from '../../domain/repository/purchase-ledger.repository';
import { PurchaseLedgerRow } from '../../domain/purchase-ledger';

type Invoice = {
  id: string | null;
  invoice_date: string | null;
  invoice_number: string | null;
  control_number: string | null;
  supplier_id: string | null;
  total: number | string | null;
};

type Supplier = { id: string | null; rif: string | null; name: string | null };
type Item = {
  invoice_id: string | null;
  vat_rate: string | null;
  total_cost: number | string | null;
  vat_base: number | string | null;
};

const n = (value: number | string | null | undefined): number =>
  value == null || value === '' ? 0 : Number(value);

export class SharedPurchaseLedgerRepository implements IPurchaseLedgerRepository {
  constructor(
    private readonly source: ISource<SupabaseClient>,
    private readonly tenantId: string,
  ) {}

  async getPurchaseLedger(companyId: string, period: string): Promise<Result<PurchaseLedgerRow[]>> {
    try {
      const invoicesRequest = this.source.instance
        .from('shared_inventory_purchase_invoices')
        .select('id,invoice_date,invoice_number,control_number,supplier_id,total')
        .eq('tenant_id', this.tenantId)
        .eq('company_id', companyId)
        .eq('period', period)
        .eq('status', 'confirmada')
        .order('invoice_date', { ascending: true });

      const [{ data: invoiceData, error: invoiceError }] = await Promise.all([invoicesRequest]);
      if (invoiceError) return Result.fail(invoiceError.message);

      const invoices = (invoiceData as Invoice[] ?? []);
      if (invoices.length === 0) return Result.success([]);

      const invoiceIds = invoices.map((invoice) => invoice.id).filter((id): id is string => Boolean(id));
      const supplierIds = [...new Set(invoices.map((invoice) => invoice.supplier_id).filter((id): id is string => Boolean(id)))];
      const [{ data: itemData, error: itemError }, { data: supplierData, error: supplierError }] = await Promise.all([
        this.source.instance
          .from('shared_inventory_purchase_invoice_items')
          .select('invoice_id,vat_rate,total_cost,vat_base')
          .eq('tenant_id', this.tenantId)
          .in('invoice_id', invoiceIds),
        this.source.instance
          .from('shared_inventory_suppliers')
          .select('id,rif,name')
          .eq('tenant_id', this.tenantId)
          .in('id', supplierIds),
      ]);
      if (itemError) return Result.fail(itemError.message);
      if (supplierError) return Result.fail(supplierError.message);

      const itemsByInvoice = new Map<string, Item[]>();
      for (const item of (itemData as Item[] ?? [])) {
        const list = itemsByInvoice.get(item.invoice_id ?? '') ?? [];
        list.push(item);
        itemsByInvoice.set(item.invoice_id ?? '', list);
      }
      const suppliers = new Map((supplierData as Supplier[] ?? []).map((supplier) => [supplier.id ?? '', supplier]));

      return Result.success(invoices.map((invoice): PurchaseLedgerRow => {
        const items = itemsByInvoice.get(invoice.id ?? '') ?? [];
        const base = (rate: string) => items
          .filter((item) => (item.vat_rate ?? 'general_16') === rate)
          .reduce((sum, item) => sum + n(item.vat_base ?? item.total_cost), 0);
        const exemptBase = base('exenta');
        const taxableBase8 = base('reducida_8');
        const taxableBase16 = base('general_16');
        const supplier = suppliers.get(invoice.supplier_id ?? '');

        return {
          id: invoice.id ?? '',
          date: invoice.invoice_date ?? '',
          invoiceNumber: invoice.invoice_number ?? '',
          controlNumber: invoice.control_number ?? '',
          supplierRif: supplier?.rif ?? '',
          supplierName: supplier?.name ?? '',
          exemptBase,
          taxableBase8,
          iva8: Math.round(taxableBase8 * 0.08 * 100) / 100,
          taxableBase16,
          iva16: Math.round(taxableBase16 * 0.16 * 100) / 100,
          ivaRetenido: 0,
          total: n(invoice.total),
        };
      }));
    } catch (error) {
      return Result.fail(error instanceof Error ? error.message : 'Failed to fetch shared purchase ledger');
    }
  }
}
