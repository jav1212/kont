import { SupabaseClient } from '@supabase/supabase-js';
import { Result } from '@/src/core/domain/result';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { ISalesLedgerRepository } from '../../domain/repository/sales-ledger.repository';
import { SalesLedgerRow } from '../../domain/sales-ledger';

type Invoice = { id: string | null; invoice_date: string | null; invoice_number: string | null; customer_id: string | null; total: number | string | null };
type Customer = { id: string | null; rif: string | null; name: string | null };
type Item = { invoice_id: string | null; vat_rate: string | null; line_total: number | string | null; vat_base: number | string | null; quantity: number | string | null; unit_price: number | string | null };
type Movement = { id: string | null; date: string | null; notes: string | null; type: string | null; total_cost: number | string | null };
const n = (value: number | string | null | undefined): number => value == null || value === '' ? 0 : Number(value);

export class SharedSalesLedgerRepository implements ISalesLedgerRepository {
  constructor(private readonly source: ISource<SupabaseClient>, private readonly tenantId: string) {}

  async getSalesLedger(companyId: string, period: string): Promise<Result<SalesLedgerRow[]>> {
    try {
      const [{ data: invoiceData, error: invoiceError }, { data: movementData, error: movementError }] = await Promise.all([
        this.source.instance.from('shared_inventory_sales_invoices').select('id,invoice_date,invoice_number,customer_id,total')
          .eq('tenant_id', this.tenantId).eq('company_id', companyId).eq('period', period).eq('status', 'confirmada'),
        this.source.instance.from('shared_inventory_movements').select('id,date,notes,type,total_cost')
          .eq('tenant_id', this.tenantId).eq('company_id', companyId).eq('period', period).eq('type', 'autoconsumo'),
      ]);
      if (invoiceError) return Result.fail(invoiceError.message);
      if (movementError) return Result.fail(movementError.message);
      const invoices = (invoiceData as Invoice[] ?? []);
      const invoiceIds = invoices.map((invoice) => invoice.id).filter((id): id is string => Boolean(id));
      const customerIds = [...new Set(invoices.map((invoice) => invoice.customer_id).filter((id): id is string => Boolean(id)))];
      const [{ data: itemData, error: itemError }, { data: customerData, error: customerError }] = await Promise.all([
        this.source.instance.from('shared_inventory_sales_invoice_items').select('invoice_id,vat_rate,line_total,vat_base,quantity,unit_price')
          .eq('tenant_id', this.tenantId).in('invoice_id', invoiceIds),
        this.source.instance.from('shared_inventory_customers').select('id,rif,name').eq('tenant_id', this.tenantId).in('id', customerIds),
      ]);
      if (itemError) return Result.fail(itemError.message);
      if (customerError) return Result.fail(customerError.message);
      const itemsByInvoice = new Map<string, Item[]>();
      for (const item of (itemData as Item[] ?? [])) {
        const list = itemsByInvoice.get(item.invoice_id ?? '') ?? [];
        list.push(item); itemsByInvoice.set(item.invoice_id ?? '', list);
      }
      const customers = new Map((customerData as Customer[] ?? []).map((customer) => [customer.id ?? '', customer]));
      const sales = invoices.map((invoice): SalesLedgerRow => {
        const items = itemsByInvoice.get(invoice.id ?? '') ?? [];
        const amount = (rate: string) => items.filter((item) => (item.vat_rate ?? 'general_16') === rate)
          .reduce((sum, item) => sum + n(item.vat_base ?? item.line_total ?? (n(item.quantity) * n(item.unit_price))), 0);
        const baseExenta = amount('exenta'), base8 = amount('reducida_8'), base16 = amount('general_16');
        const customer = customers.get(invoice.customer_id ?? '');
        return {
          id: invoice.id ?? '', date: invoice.invoice_date ?? '', invoiceNumber: invoice.invoice_number ?? '',
          clientRif: customer?.rif ?? '', clientName: customer?.name ?? '', exemptBase: baseExenta,
          taxableBase8: base8, iva8: Math.round(base8 * 0.08 * 100) / 100, taxableBase16: base16,
          iva16: Math.round(base16 * 0.16 * 100) / 100, selfConsumption: 0, selfConsumptionVat: 0,
          total: n(invoice.total), tipo: 'venta',
        };
      });
      const autoconsumption = ((movementData as Movement[] ?? []).map((movement): SalesLedgerRow => ({
        id: movement.id ?? '', date: movement.date ?? '', invoiceNumber: '', clientRif: '',
        clientName: movement.notes || 'Autoconsumo', exemptBase: 0, taxableBase8: 0, iva8: 0,
        taxableBase16: 0, iva16: 0, selfConsumption: Math.round(n(movement.total_cost) * 100) / 100,
        selfConsumptionVat: 0, total: Math.round(n(movement.total_cost) * 100) / 100, tipo: 'autoconsumo',
      })));
      return Result.success([...sales, ...autoconsumption].sort((a, b) => a.date.localeCompare(b.date) || a.invoiceNumber.localeCompare(b.invoiceNumber)));
    } catch (error) {
      return Result.fail(error instanceof Error ? error.message : 'Failed to fetch shared sales ledger');
    }
  }
}
