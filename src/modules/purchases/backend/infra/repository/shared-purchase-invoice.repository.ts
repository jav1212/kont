import { SupabaseClient } from '@supabase/supabase-js';
import { Result } from '@/src/core/domain/result';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { IPurchaseInvoiceRepository } from '../../domain/repository/purchase-invoice.repository';
import {
    AdjustmentKind,
    ItemCurrency,
    InvoiceStatus,
    PurchaseDocumentType,
    PurchaseInventoryEffect,
    PurchaseInvoice,
    PurchaseInvoiceItem,
    VatRate,
} from '../../domain/purchase-invoice';
import { MigratePurchaseInvoicesResult } from '../../domain/migrate-purchase-invoices';
import type { InvoiceTax, TaxBase } from '@/src/modules/inventory/shared/totals';

type RawSharedInvoice = {
    id: string;
    company_id: string;
    supplier_id: string;
    invoice_number: string;
    invoice_date: string;
    period: string;
    manual_period: boolean | null;
    status: string;
    document_type: string | null;
    affected_invoice_id: string | null;
    affected_invoice_number: string | null;
    affected_control_number: string | null;
    note_reason: string | null;
    inventory_effect: string | null;
    subtotal: number | string | null;
    vat_percentage: number | string | null;
    vat_amount: number | string | null;
    total: number | string | null;
    notes: string | null;
    control_number: string | null;
    dollar_rate: number | string | null;
    rate_decimals: number | null;
    discount_type: string | null;
    discount_currency: string | null;
    discount_value: number | string | null;
    discount_amount: number | string | null;
    surcharge_type: string | null;
    surcharge_currency: string | null;
    surcharge_value: number | string | null;
    surcharge_amount: number | string | null;
    vat_retention_percentage: number | string | null;
    vat_retention_amount: number | string | null;
    vat_retention_receipt_number: string | null;
    income_tax_concept: string | null;
    income_tax_percentage: number | string | null;
    income_tax_base: number | string | null;
    income_tax_subtrahend: number | string | null;
    income_tax_amount: number | string | null;
    tax_unit_value: number | string | null;
    income_tax_receipt_number: string | null;
    financial_tax_applies: boolean | null;
    financial_tax_percentage: number | string | null;
    financial_tax_currency_base: number | string | null;
    financial_tax_bs_base: number | string | null;
    financial_tax_amount: number | string | null;
    taxes: unknown;
    confirmed_at: string | null;
    created_at: string | null;
    updated_at: string | null;
};

type RawSharedItem = {
    id: string;
    invoice_id: string;
    product_id: string;
    quantity: number | string | null;
    unit_cost: number | string | null;
    total_cost: number | string | null;
    vat_rate: string | null;
    currency: string | null;
    currency_cost: number | string | null;
    dollar_rate: number | string | null;
    discount_type: string | null;
    discount_currency: string | null;
    discount_value: number | string | null;
    discount_amount: number | string | null;
    surcharge_type: string | null;
    surcharge_currency: string | null;
    surcharge_value: number | string | null;
    surcharge_amount: number | string | null;
    vat_base: number | string | null;
    vat_included: boolean | null;
};

type RawSharedSupplier = {
    id: string;
    name: string;
};

type RawSharedProduct = {
    id: string;
    name: string;
};

const num = (value: number | string | null | undefined, fallback = 0): number =>
    value == null || value === '' ? fallback : Number(value);

const adjustment = (value: string | null): AdjustmentKind | null =>
    value === 'monto' || value === 'porcentaje' ? value : null;

const invoicePayload = (invoice: PurchaseInvoice): Record<string, unknown> => ({
    id: invoice.id ?? '',
    empresa_id: invoice.companyId,
    proveedor_id: invoice.supplierId,
    numero_factura: invoice.invoiceNumber,
    numero_control: invoice.controlNumber ?? '',
    fecha: invoice.date,
    periodo: invoice.period,
    iva_porcentaje: invoice.vatPercentage,
    subtotal: invoice.subtotal,
    iva_monto: invoice.vatAmount,
    total: invoice.total,
    notas: invoice.notes,
    tipo_documento: invoice.documentType ?? 'factura',
    factura_afectada_id: invoice.affectedInvoiceId ?? null,
    factura_afectada_numero: invoice.affectedInvoiceNumber ?? null,
    factura_afectada_control: invoice.affectedControlNumber ?? null,
    motivo_nota: invoice.noteReason ?? null,
    efecto_inventario: invoice.inventoryEffect ?? 'none',
    tasa_dolar: invoice.dollarRate ?? null,
    tasa_decimales: invoice.rateDecimals ?? null,
    descuento_tipo: invoice.descuentoTipo ?? null,
    descuento_moneda: invoice.descuentoMoneda ?? "B",
    descuento_valor: invoice.descuentoValor ?? null,
    descuento_monto: invoice.descuentoMonto ?? null,
    recargo_tipo: invoice.recargoTipo ?? null,
    recargo_moneda: invoice.recargoMoneda ?? "B",
    recargo_valor: invoice.recargoValor ?? null,
    recargo_monto: invoice.recargoMonto ?? null,
    retencion_iva_pct: invoice.retencionIvaPct ?? 0,
    islr_concepto: invoice.islrConcepto ?? null,
    islr_porcentaje: invoice.islrPorcentaje ?? null,
    islr_base_retencion: invoice.islrBaseRetencion ?? null,
    islr_sustraendo: invoice.islrSustraendo ?? null,
    islr_unidad_tributaria: invoice.islrUnidadTributaria ?? null,
    igtf_aplica: invoice.igtfAplica ?? false,
    igtf_porcentaje: invoice.igtfPorcentaje ?? 0,
    igtf_base_divisa: invoice.igtfBaseDivisa ?? 0,
    igtf_base_bs: invoice.igtfBaseBs ?? 0,
    impuestos: invoice.impuestos ?? [],
});

const itemPayload = (item: PurchaseInvoiceItem): Record<string, unknown> => ({
    id: item.id ?? '',
    producto_id: item.productId,
    cantidad: item.quantity,
    costo_unitario: item.unitCost,
    costo_total: item.totalCost,
    iva_alicuota: item.vatRate,
    moneda: item.currency,
    costo_moneda: item.currencyCost ?? null,
    tasa_dolar: item.dollarRate ?? null,
    descuento_tipo: item.descuentoTipo ?? null,
    descuento_moneda: item.descuentoMoneda ?? "B",
    descuento_valor: item.descuentoValor ?? null,
    descuento_monto: item.descuentoMonto ?? null,
    recargo_tipo: item.recargoTipo ?? null,
    recargo_moneda: item.recargoMoneda ?? "B",
    recargo_valor: item.recargoValor ?? null,
    recargo_monto: item.recargoMonto ?? null,
    base_iva: item.baseIVA ?? null,
    iva_incluido: item.ivaIncluido ?? false,
});

export class SharedPurchaseInvoiceRepository implements IPurchaseInvoiceRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly tenantId: string,
    ) {}

    async findByCompany(companyId: string): Promise<Result<PurchaseInvoice[]>> {
        try {
            const { data, error } = await this.source.instance
                .from('shared_inventory_purchase_invoices')
                .select('*')
                .eq('tenant_id', this.tenantId)
                .eq('company_id', companyId)
                .order('invoice_date', { ascending: false });
            if (error) return Result.fail(error.message);
            const rows = (data as RawSharedInvoice[]) ?? [];
            const supplierNames = await this.loadSupplierNames(rows.map((row) => row.supplier_id));
            if (supplierNames.isFailure) return Result.fail(supplierNames.getError());
            if (rows.length === 0) return Result.success([]);

            // Load all line items in one request. Calling load() once per
            // invoice created an N+1 pattern that became very slow for
            // companies with many purchase invoices.
            const { data: itemData, error: itemError } = await this.source.instance
                .from('shared_inventory_purchase_invoice_items')
                .select('*')
                .eq('tenant_id', this.tenantId)
                .in('invoice_id', rows.map((row) => row.id))
                .order('created_at', { ascending: true });
            if (itemError) return Result.fail(itemError.message);

            const itemsByInvoice = new Map<string, RawSharedItem[]>();
            const rawItems = (itemData as RawSharedItem[] ?? []);
            const productNames = await this.loadProductNames(rawItems.map((item) => item.product_id));
            if (productNames.isFailure) return Result.fail(productNames.getError());

            for (const item of rawItems) {
                const items = itemsByInvoice.get(item.invoice_id) ?? [];
                items.push(item);
                itemsByInvoice.set(item.invoice_id, items);
            }

            return Result.success(rows.map((row) => this.mapToDomain(
                row,
                itemsByInvoice.get(row.id) ?? [],
                supplierNames.getValue().get(row.supplier_id),
                productNames.getValue(),
            )));
        } catch (error) {
            return Result.fail(error instanceof Error ? error.message : 'Failed to fetch shared purchase invoices');
        }
    }

    async findById(invoiceId: string): Promise<Result<PurchaseInvoice>> {
        try {
            const { data, error } = await this.source.instance
                .from('shared_inventory_purchase_invoices')
                .select('*')
                .eq('tenant_id', this.tenantId)
                .eq('id', invoiceId)
                .maybeSingle();
            if (error) return Result.fail(error.message);
            if (!data) return Result.fail('Invoice not found');
            return this.load(data as RawSharedInvoice);
        } catch (error) {
            return Result.fail(error instanceof Error ? error.message : 'Failed to fetch shared purchase invoice');
        }
    }

    async save(invoice: PurchaseInvoice, items: PurchaseInvoiceItem[]): Promise<Result<PurchaseInvoice>> {
        const result = await this.callInvoiceFunction<RawSharedInvoice>('shared_inventory_purchase_invoice_save', [invoicePayload(invoice), items.map(itemPayload)]);
        if (result.isFailure) return Result.fail(result.getError());
        const metadata = await this.source.instance
            .from('shared_inventory_purchase_invoices')
            .update({
                document_type: invoice.documentType ?? 'factura',
                affected_invoice_id: invoice.affectedInvoiceId ?? null,
                affected_invoice_number: invoice.affectedInvoiceNumber ?? null,
                affected_control_number: invoice.affectedControlNumber ?? null,
                note_reason: invoice.noteReason ?? null,
                inventory_effect: invoice.inventoryEffect ?? (invoice.documentType === 'factura' ? 'additional_purchase' : 'none'),
                discount_currency: invoice.descuentoMoneda ?? 'B',
                surcharge_currency: invoice.recargoMoneda ?? 'B',
            })
            .eq('tenant_id', this.tenantId)
            .eq('id', result.getValue().id)
            .select('*')
            .single();
        if (metadata.error) return Result.fail(metadata.error.message);

        const { data: savedItems, error: savedItemsError } = await this.source.instance
            .from('shared_inventory_purchase_invoice_items')
            .select('id')
            .eq('tenant_id', this.tenantId)
            .eq('invoice_id', result.getValue().id)
            .order('created_at', { ascending: true });
        if (savedItemsError) return Result.fail(savedItemsError.message);
        for (let index = 0; index < items.length; index += 1) {
            const itemId = (savedItems as Array<{ id: string }> | null)?.[index]?.id;
            if (!itemId) continue;
            const { error } = await this.source.instance
                .from('shared_inventory_purchase_invoice_items')
                .update({ discount_currency: items[index].descuentoMoneda ?? 'B', surcharge_currency: items[index].recargoMoneda ?? 'B' })
                .eq('tenant_id', this.tenantId).eq('id', itemId).eq('invoice_id', result.getValue().id);
            if (error) return Result.fail(error.message);
        }
        return this.load(metadata.data as RawSharedInvoice);
    }

    async confirm(invoiceId: string): Promise<Result<PurchaseInvoice>> {
        return this.callInvoiceFunction<RawSharedInvoice>('shared_inventory_purchase_invoice_confirm', [invoiceId])
            .then((result) => result.isFailure ? Result.fail(result.getError()) : this.load(result.getValue()));
    }

    async delete(invoiceId: string): Promise<Result<void>> {
        try {
            const { error } = await this.source.instance
                .from('shared_inventory_purchase_invoices')
                .delete()
                .eq('tenant_id', this.tenantId)
                .eq('id', invoiceId)
                .eq('status', 'borrador');
            return error ? Result.fail(error.message) : Result.success();
        } catch (error) {
            return Result.fail(error instanceof Error ? error.message : 'Failed to delete shared purchase invoice');
        }
    }

    async unconfirm(invoiceId: string): Promise<Result<PurchaseInvoice>> {
        return this.callInvoiceFunction<RawSharedInvoice>('shared_inventory_purchase_invoice_unconfirm', [invoiceId])
            .then((result) => result.isFailure ? Result.fail(result.getError()) : this.load(result.getValue()));
    }

    async imputeItems(invoiceId: string, items: PurchaseInvoiceItem[]): Promise<Result<PurchaseInvoice>> {
        return this.callItemsFunction('shared_inventory_purchase_invoice_impute_items', invoiceId, items.map(itemPayload))
            .then((result) => result.isFailure ? Result.fail(result.getError()) : this.load(result.getValue()));
    }

    async migrate(
        invoiceIds: string[],
        targetCompanyId: string,
        targetPeriod?: string | null,
    ): Promise<Result<MigratePurchaseInvoicesResult>> {
        try {
            const { data, error } = await this.source.instance.rpc('shared_inventory_purchase_invoice_migrate', {
                p_tenant_id: this.tenantId,
                p_invoice_ids: invoiceIds,
                p_target_company_id: targetCompanyId,
                p_target_period: targetPeriod ?? null,
            });
            return error ? Result.fail(error.message) : Result.success(mapMigrationResult(data));
        } catch (error) {
            return Result.fail(error instanceof Error ? error.message : 'Failed to migrate shared purchase invoices');
        }
    }

    private async callItemsFunction(name: string, invoiceId: string, items: unknown[]): Promise<Result<RawSharedInvoice>> {
        try {
            const { data, error } = await this.source.instance.rpc(name, {
                p_tenant_id: this.tenantId, p_invoice_id: invoiceId, p_items: items,
            });
            return error ? Result.fail(error.message) : Result.success(data as RawSharedInvoice);
        } catch (error) {
            return Result.fail(error instanceof Error ? error.message : `Failed to call ${name}`);
        }
    }

    private async callInvoiceFunction<T>(name: string, args: unknown[]): Promise<Result<T>> {
        try {
            const { data, error } = args.length === 2
                ? await this.source.instance.rpc(name, { p_tenant_id: this.tenantId, p_invoice: args[0], p_items: args[1] })
                : await this.source.instance.rpc(name, { p_tenant_id: this.tenantId, p_invoice_id: args[0] });
            return error ? Result.fail(error.message) : Result.success(data as T);
        } catch (error) {
            return Result.fail(error instanceof Error ? error.message : `Failed to call ${name}`);
        }
    }

    private async load(row: RawSharedInvoice, supplierName?: string): Promise<Result<PurchaseInvoice>> {
        const itemsRequest = this.source.instance
            .from('shared_inventory_purchase_invoice_items')
            .select('*')
            .eq('tenant_id', this.tenantId)
            .eq('invoice_id', row.id)
            .order('created_at', { ascending: true });
        const supplierNameRequest = supplierName === undefined
            ? this.loadSupplierNames([row.supplier_id])
            : Promise.resolve(Result.success(new Map([[row.supplier_id, supplierName]])));
        const [{ data, error }, supplierNames] = await Promise.all([itemsRequest, supplierNameRequest]);
        if (error) return Result.fail(error.message);
        if (supplierNames.isFailure) return Result.fail(supplierNames.getError());
        const rawItems = (data as RawSharedItem[]) ?? [];
        const productNames = await this.loadProductNames(rawItems.map((item) => item.product_id));
        if (productNames.isFailure) return Result.fail(productNames.getError());
        return Result.success(this.mapToDomain(
            row,
            rawItems,
            supplierNames.getValue().get(row.supplier_id),
            productNames.getValue(),
        ));
    }

    private async loadSupplierNames(supplierIds: string[]): Promise<Result<Map<string, string>>> {
        const uniqueIds = [...new Set(supplierIds.filter(Boolean))];
        if (uniqueIds.length === 0) return Result.success(new Map());
        try {
            const { data, error } = await this.source.instance
                .from('shared_inventory_suppliers')
                .select('id,name')
                .eq('tenant_id', this.tenantId)
                .in('id', uniqueIds);
            if (error) return Result.fail(error.message);
            return Result.success(new Map(((data as RawSharedSupplier[]) ?? []).map((supplier) => [supplier.id, supplier.name])));
        } catch (error) {
            return Result.fail(error instanceof Error ? error.message : 'Failed to fetch shared suppliers');
        }
    }

    private async loadProductNames(productIds: string[]): Promise<Result<Map<string, string>>> {
        const uniqueIds = [...new Set(productIds.filter(Boolean))];
        if (uniqueIds.length === 0) return Result.success(new Map());
        try {
            const { data, error } = await this.source.instance
                .from('shared_inventory_products')
                .select('id,name')
                .eq('tenant_id', this.tenantId)
                .in('id', uniqueIds);
            if (error) return Result.fail(error.message);
            return Result.success(new Map(((data as RawSharedProduct[]) ?? []).map((product) => [product.id, product.name])));
        } catch (error) {
            return Result.fail(error instanceof Error ? error.message : 'Failed to fetch shared products');
        }
    }

    private mapToDomain(
        row: RawSharedInvoice,
        rawItems: RawSharedItem[],
        supplierName?: string,
        productNames: Map<string, string> = new Map(),
    ): PurchaseInvoice {
        const taxes = Array.isArray(row.taxes) ? row.taxes : [];
        return {
            id: row.id,
            companyId: row.company_id,
            supplierId: row.supplier_id,
            supplierName,
            invoiceNumber: row.invoice_number,
            controlNumber: row.control_number ?? '',
            date: row.invoice_date,
            period: row.period,
            periodoManual: row.manual_period === true,
            status: row.status as InvoiceStatus,
            documentType: row.document_type === 'nota_credito' || row.document_type === 'nota_debito'
                ? row.document_type as PurchaseDocumentType : 'factura',
            affectedInvoiceId: row.affected_invoice_id,
            affectedInvoiceNumber: row.affected_invoice_number,
            affectedControlNumber: row.affected_control_number,
            noteReason: row.note_reason,
            inventoryEffect: row.inventory_effect === 'return_to_supplier' || row.inventory_effect === 'additional_purchase'
                ? row.inventory_effect as PurchaseInventoryEffect : 'none',
            subtotal: num(row.subtotal),
            vatPercentage: num(row.vat_percentage, 16),
            vatAmount: num(row.vat_amount),
            total: num(row.total),
            notes: row.notes ?? '',
            dollarRate: row.dollar_rate == null ? null : num(row.dollar_rate),
            rateDecimals: row.rate_decimals,
            descuentoTipo: adjustment(row.discount_type),
            descuentoMoneda: row.discount_currency === "D" ? "D" : "B",
            descuentoValor: num(row.discount_value),
            descuentoMonto: num(row.discount_amount),
            recargoTipo: adjustment(row.surcharge_type),
            recargoMoneda: row.surcharge_currency === "D" ? "D" : "B",
            recargoValor: num(row.surcharge_value),
            recargoMonto: num(row.surcharge_amount),
            retencionIvaPct: num(row.vat_retention_percentage),
            retencionIvaMonto: num(row.vat_retention_amount),
            comprobanteRetencionIvaNumero: row.vat_retention_receipt_number,
            islrConcepto: row.income_tax_concept,
            islrPorcentaje: num(row.income_tax_percentage),
            islrBaseRetencion: num(row.income_tax_base),
            islrSustraendo: num(row.income_tax_subtrahend),
            islrMonto: num(row.income_tax_amount),
            islrUnidadTributaria: row.tax_unit_value == null ? undefined : num(row.tax_unit_value),
            comprobanteIslrNumero: row.income_tax_receipt_number,
            igtfAplica: row.financial_tax_applies === true,
            igtfPorcentaje: num(row.financial_tax_percentage),
            igtfBaseDivisa: num(row.financial_tax_currency_base),
            igtfBaseBs: num(row.financial_tax_bs_base),
            igtfMonto: num(row.financial_tax_amount),
            impuestos: taxes.map((tax): InvoiceTax => {
                const value = (tax ?? {}) as Record<string, unknown>;
                return {
                    nombre: String(value.nombre ?? ''),
                    tipo: value.tipo === 'monto' ? 'monto' : 'porcentaje',
                    valor: num(value.valor as number | string | null),
                    moneda: value.moneda === 'D' ? 'D' : 'B',
                    base: value.base === 'post_iva' ? 'post_iva' as TaxBase : 'pre_iva' as TaxBase,
                    monto: num(value.monto as number | string | null),
                };
            }),
            confirmedAt: row.confirmed_at,
            items: rawItems.map((item) => ({
                id: item.id,
                invoiceId: item.invoice_id,
                productId: item.product_id,
                productName: productNames.get(item.product_id),
                quantity: num(item.quantity),
                unitCost: num(item.unit_cost),
                totalCost: num(item.total_cost),
                vatRate: (item.vat_rate ?? 'general_16') as VatRate,
                currency: (item.currency === 'D' ? 'D' : 'B') as ItemCurrency,
                currencyCost: item.currency_cost == null ? null : num(item.currency_cost),
                dollarRate: item.dollar_rate == null ? null : num(item.dollar_rate),
                descuentoTipo: adjustment(item.discount_type),
                descuentoMoneda: item.discount_currency === "D" ? "D" : "B",
                descuentoValor: num(item.discount_value),
                descuentoMonto: num(item.discount_amount),
                recargoTipo: adjustment(item.surcharge_type),
                recargoMoneda: item.surcharge_currency === "D" ? "D" : "B",
                recargoValor: num(item.surcharge_value),
                recargoMonto: num(item.surcharge_amount),
                baseIVA: num(item.vat_base, num(item.total_cost)),
                ivaIncluido: item.vat_included === true,
            })),
            createdAt: row.created_at ?? undefined,
            updatedAt: row.updated_at ?? undefined,
        };
    }
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
    return value !== null && typeof value === 'object' ? value as JsonRecord : {};
}

function asArray(value: unknown): JsonRecord[] {
    return Array.isArray(value) ? value.map(asRecord) : [];
}

function mapMigrationResult(value: unknown): MigratePurchaseInvoicesResult {
    const response = asRecord(value);
    return {
        migrated: asArray(response.migrated).map((row) => ({
            id: String(row.id ?? ''),
            sourceCompanyId: String(row.source_empresa_id ?? ''),
            targetCompanyId: String(row.target_empresa_id ?? ''),
            wasConfirmed: Boolean(row.was_confirmed),
            date: String(row.fecha ?? ''),
            period: String(row.periodo ?? ''),
            subtotal: num(row.subtotal as number | string | null),
            vatAmount: num(row.iva_monto as number | string | null),
            total: num(row.total as number | string | null),
        })),
        skipped: asArray(response.skipped).map((row) => ({ id: String(row.id ?? ''), reason: 'already-in-target' })),
        createdSuppliers: asArray(response.created_suppliers).map((row) => ({ id: String(row.id ?? ''), rif: String(row.rif ?? ''), nombre: String(row.nombre ?? '') })),
        createdProducts: asArray(response.created_products).map((row) => ({ id: String(row.id ?? ''), codigo: String(row.codigo ?? ''), nombre: String(row.nombre ?? '') })),
    };
}
