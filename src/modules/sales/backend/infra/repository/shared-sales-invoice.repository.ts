import { SupabaseClient } from '@supabase/supabase-js';
import { Result } from '@/src/core/domain/result';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { ISalesInvoiceRepository } from '../../domain/repository/sales-invoice.repository';
import {
    AdjustmentKind,
    IgtfConcept,
    ItemCurrency,
    SalesInvoice,
    SalesInvoiceItem,
    SalesInvoiceStatus,
    VatRate,
} from '../../domain/sales-invoice';
import { normalizeCurrencyCode, type AppliedExchangeRate } from '@/src/modules/inventory/shared/currency';

type RawInvoice = {
    id: string;
    company_id: string;
    customer_id: string;
    invoice_number: string;
    control_number: string | null;
    invoice_date: string;
    period: string;
    manual_period: boolean | null;
    document_type: string | null;
    due_date: string | null;
    payment_terms: string | null;
    status: string;
    subtotal: number | string | null;
    vat_amount: number | string | null;
    total: number | string | null;
    notes: string | null;
    dollar_rate: number | string | null;
    currency_code: string | null;
    exchange_rates: unknown;
    taxes: unknown;
    rate_decimals: number | null;
    discount_type: string | null;
    discount_value: number | string | null;
    discount_amount: number | string | null;
    discount_currency: string | null;
    surcharge_type: string | null;
    surcharge_value: number | string | null;
    surcharge_amount: number | string | null;
    surcharge_currency: string | null;
    financial_tax_applies: boolean | null;
    financial_tax_concept: string | null;
    financial_tax_percentage: number | string | null;
    financial_tax_currency_base: number | string | null;
    financial_tax_bs_base: number | string | null;
    financial_tax_amount: number | string | null;
    financial_tax_currency_code: string | null;
    financial_tax_exchange_rate: number | string | null;
    confirmed_at: string | null;
    created_at: string | null;
    updated_at: string | null;
};

type RawItem = {
    id: string;
    invoice_id: string;
    product_id: string | null;
    description: string;
    quantity: number | string | null;
    unit_price: number | string | null;
    line_total: number | string | null;
    vat_rate: string | null;
    currency: string | null;
    currency_price: number | string | null;
    dollar_rate: number | string | null;
    discount_type: string | null;
    discount_value: number | string | null;
    discount_amount: number | string | null;
    discount_currency: string | null;
    surcharge_type: string | null;
    surcharge_value: number | string | null;
    surcharge_amount: number | string | null;
    surcharge_currency: string | null;
    vat_base: number | string | null;
    vat_included: boolean | null;
};

type RawCustomer = { name: string; rif: string; address: string };

const num = (value: number | string | null | undefined, fallback = 0): number =>
    value == null || value === '' ? fallback : Number(value);
const adjustment = (value: string | null): AdjustmentKind | null =>
    value === 'monto' || value === 'porcentaje' ? value : null;

const invoicePayload = (invoice: SalesInvoice): Record<string, unknown> => ({
    id: invoice.id ?? '', empresa_id: invoice.companyId, cliente_id: invoice.customerId,
    tipo_documento: invoice.documentType ?? 'venta',
    numero_factura: invoice.invoiceNumber, numero_control: invoice.controlNumber ?? '',
    fecha: invoice.date, periodo: invoice.period, periodo_manual: invoice.periodoManual ?? false,
    fecha_vencimiento: invoice.dueDate ?? null, condiciones_pago: invoice.paymentTerms ?? 'contado',
    subtotal: invoice.subtotal, iva_monto: invoice.vatAmount, total: invoice.total, notas: invoice.notes,
    tasa_dolar: invoice.dollarRate ?? invoice.exchangeRates?.find((rate) => normalizeCurrencyCode(rate.currencyCode) === normalizeCurrencyCode(invoice.currency))?.vesPerUnit ?? null, tasa_decimales: invoice.rateDecimals ?? null,
    currency_code: normalizeCurrencyCode(invoice.currency), exchange_rates: invoice.exchangeRates ?? [], taxes: invoice.impuestos ?? [],
    descuento_tipo: invoice.descuentoTipo ?? null, descuento_valor: invoice.descuentoValor ?? null,
    descuento_monto: invoice.descuentoMonto ?? null, descuento_moneda: invoice.descuentoMoneda ?? "VES", recargo_tipo: invoice.recargoTipo ?? null,
    recargo_valor: invoice.recargoValor ?? null, recargo_monto: invoice.recargoMonto ?? null, recargo_moneda: invoice.recargoMoneda ?? "VES",
    igtf_percepcion_aplica: invoice.igtfPerceptionApplies ?? false,
    igtf_percepcion_concepto: invoice.igtfPerceptionConcept ?? null,
    igtf_percepcion_porcentaje: invoice.igtfPerceptionPercentage ?? 0,
    igtf_percepcion_base_divisa: invoice.igtfPerceptionForeignBase ?? 0,
    igtf_percepcion_base_bs: invoice.igtfPerceptionLocalBase ?? 0,
});

const itemPayload = (item: SalesInvoiceItem): Record<string, unknown> => ({
    id: item.id ?? '', producto_id: item.productId ?? null, descripcion: item.description,
    cantidad: item.quantity, precio_unitario: item.unitPrice, total_linea: item.totalLine,
    iva_alicuota: item.vatRate, moneda: item.currency, precio_moneda: item.currencyPrice ?? null,
    tasa_dolar: item.exchangeRate ?? item.dollarRate ?? null, descuento_tipo: item.descuentoTipo ?? null,
    descuento_valor: item.descuentoValor ?? null, descuento_monto: item.descuentoMonto ?? null, descuento_moneda: item.descuentoMoneda ?? "VES",
    recargo_tipo: item.recargoTipo ?? null, recargo_valor: item.recargoValor ?? null,
    recargo_monto: item.recargoMonto ?? null, recargo_moneda: item.recargoMoneda ?? "VES", base_iva: item.baseIVA ?? null,
    iva_incluido: item.ivaIncluido ?? false,
});

export class SharedSalesInvoiceRepository implements ISalesInvoiceRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly tenantId: string,
    ) {}

    async findByCompany(companyId: string): Promise<Result<SalesInvoice[]>> {
        try {
            const { data, error } = await this.source.instance
                .from('shared_inventory_sales_invoices').select('*')
                .eq('tenant_id', this.tenantId).eq('company_id', companyId)
                .order('invoice_date', { ascending: false });
            if (error) return Result.fail(error.message);
            const loaded = await Promise.all(((data as RawInvoice[]) ?? []).map((row) => this.load(row)));
            const failed = loaded.find((result) => result.isFailure);
            return failed ? Result.fail(failed.getError()) : Result.success(loaded.map((result) => result.getValue()));
        } catch (error) {
            return Result.fail(error instanceof Error ? error.message : 'Failed to fetch shared sales invoices');
        }
    }

    async findById(id: string): Promise<Result<SalesInvoice>> {
        try {
            const { data, error } = await this.source.instance.from('shared_inventory_sales_invoices')
                .select('*').eq('tenant_id', this.tenantId).eq('id', id).maybeSingle();
            if (error) return Result.fail(error.message);
            if (!data) return Result.fail('Invoice not found');
            return this.load(data as RawInvoice);
        } catch (error) {
            return Result.fail(error instanceof Error ? error.message : 'Failed to fetch shared sales invoice');
        }
    }

    async save(invoice: SalesInvoice, items: SalesInvoiceItem[]): Promise<Result<SalesInvoice>> {
        const result = await this.callFunction<RawInvoice>('shared_inventory_sales_invoice_save', {
            p_tenant_id: this.tenantId, p_invoice: invoicePayload(invoice), p_items: items.map(itemPayload),
        });
        if (result.isFailure) return Result.fail(result.getError());
        const saved = result.getValue();
        const { error } = await this.source.instance.from('shared_inventory_sales_invoices').update({
            currency_code: normalizeCurrencyCode(invoice.currency), exchange_rates: invoice.exchangeRates ?? [],
            financial_tax_currency_code: invoice.igtfPerceptionCurrencyCode ?? null,
            financial_tax_exchange_rate: invoice.igtfPerceptionExchangeRate ?? null,
        }).eq('tenant_id', this.tenantId).eq('id', saved.id);
        if (error) return Result.fail(error.message);
        return this.findById(saved.id);
    }

    async confirm(id: string): Promise<Result<SalesInvoice>> {
        return this.callFunction<RawInvoice>('shared_inventory_sales_invoice_confirm', {
            p_tenant_id: this.tenantId, p_invoice_id: id,
        }).then((result) => result.isFailure ? Result.fail(result.getError()) : this.load(result.getValue()));
    }

    async unconfirm(id: string): Promise<Result<SalesInvoice>> {
        return this.callFunction<RawInvoice>('shared_inventory_sales_invoice_unconfirm', {
            p_tenant_id: this.tenantId, p_invoice_id: id,
        }).then((result) => result.isFailure ? Result.fail(result.getError()) : this.load(result.getValue()));
    }

    async delete(id: string): Promise<Result<void>> {
        return this.callFunction<void>('shared_inventory_sales_invoice_delete', {
            p_tenant_id: this.tenantId, p_invoice_id: id,
        }).then((result) => result.isFailure ? Result.fail(result.getError()) : Result.success());
    }

    private async callFunction<T>(name: string, args: Record<string, unknown>): Promise<Result<T>> {
        try {
            const { data, error } = await this.source.instance.rpc(name, args);
            return error ? Result.fail(error.message) : Result.success(data as T);
        } catch (error) {
            return Result.fail(error instanceof Error ? error.message : `Failed to call ${name}`);
        }
    }

    private async load(row: RawInvoice): Promise<Result<SalesInvoice>> {
        const [itemsResult, customerResult] = await Promise.all([
            this.source.instance.from('shared_inventory_sales_invoice_items').select('*')
                .eq('tenant_id', this.tenantId).eq('invoice_id', row.id).order('created_at', { ascending: true }),
            this.source.instance.from('shared_inventory_customers').select('name,rif,address')
                .eq('tenant_id', this.tenantId).eq('id', row.customer_id).maybeSingle(),
        ]);
        if (itemsResult.error) return Result.fail(itemsResult.error.message);
        if (customerResult.error) return Result.fail(customerResult.error.message);
        return Result.success(this.mapToDomain(row, (itemsResult.data as RawItem[]) ?? [], customerResult.data as RawCustomer | null));
    }

    private mapToDomain(row: RawInvoice, rawItems: RawItem[], customer: RawCustomer | null): SalesInvoice {
        return {
            id: row.id, companyId: row.company_id, customerId: row.customer_id,
            customerName: customer?.name, customerRif: customer?.rif, customerAddress: customer?.address,
            documentType: row.document_type === 'nota_entrega' ? 'nota_entrega' : 'venta',
            invoiceNumber: row.invoice_number, controlNumber: row.control_number ?? '', date: row.invoice_date,
            period: row.period, periodoManual: row.manual_period === true, dueDate: row.due_date,
            paymentTerms: row.payment_terms ?? 'contado', status: row.status as SalesInvoiceStatus,
            subtotal: num(row.subtotal), vatAmount: num(row.vat_amount), total: num(row.total), notes: row.notes ?? '',
            currency: normalizeCurrencyCode(row.currency_code),
            exchangeRates: Array.isArray(row.exchange_rates) ? row.exchange_rates as AppliedExchangeRate[] : [],
            impuestos: Array.isArray(row.taxes) ? row.taxes as SalesInvoice["impuestos"] : [],
            dollarRate: row.dollar_rate == null ? null : num(row.dollar_rate), rateDecimals: row.rate_decimals,
            descuentoTipo: adjustment(row.discount_type), descuentoValor: num(row.discount_value), descuentoMonto: num(row.discount_amount), descuentoMoneda: normalizeCurrencyCode(row.discount_currency),
            recargoTipo: adjustment(row.surcharge_type), recargoValor: num(row.surcharge_value), recargoMonto: num(row.surcharge_amount), recargoMoneda: normalizeCurrencyCode(row.surcharge_currency),
            igtfPerceptionApplies: row.financial_tax_applies === true,
            igtfPerceptionConcept: row.financial_tax_concept as IgtfConcept | null,
            igtfPerceptionPercentage: num(row.financial_tax_percentage),
            igtfPerceptionForeignBase: num(row.financial_tax_currency_base),
            igtfPerceptionLocalBase: num(row.financial_tax_bs_base), igtfPerceptionAmount: num(row.financial_tax_amount),
            igtfPerceptionCurrencyCode: row.financial_tax_currency_code == null ? null : normalizeCurrencyCode(row.financial_tax_currency_code),
            igtfPerceptionExchangeRate: row.financial_tax_exchange_rate == null ? null : num(row.financial_tax_exchange_rate),
            confirmedAt: row.confirmed_at,
            items: rawItems.map((item) => ({
                id: item.id, invoiceId: item.invoice_id, productId: item.product_id,
                description: item.description, quantity: num(item.quantity), unitPrice: num(item.unit_price),
                totalLine: num(item.line_total), vatRate: (item.vat_rate ?? 'general_16') as VatRate,
                currency: normalizeCurrencyCode(item.currency) as ItemCurrency,
                currencyPrice: item.currency_price == null ? null : num(item.currency_price),
                dollarRate: item.dollar_rate == null ? null : num(item.dollar_rate),
                exchangeRate: item.dollar_rate == null ? null : num(item.dollar_rate),
                descuentoTipo: adjustment(item.discount_type), descuentoValor: num(item.discount_value), descuentoMonto: num(item.discount_amount), descuentoMoneda: normalizeCurrencyCode(item.discount_currency),
                recargoTipo: adjustment(item.surcharge_type), recargoValor: num(item.surcharge_value), recargoMonto: num(item.surcharge_amount), recargoMoneda: normalizeCurrencyCode(item.surcharge_currency),
                baseIVA: num(item.vat_base, num(item.line_total)), ivaIncluido: item.vat_included === true,
            })),
            createdAt: row.created_at ?? undefined, updatedAt: row.updated_at ?? undefined,
        };
    }
}
