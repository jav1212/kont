import type { SupabaseClient } from '@supabase/supabase-js';
import { Result } from '@/src/core/domain/result';
import type { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { calculatePurchaseCsvRow, normalizePurchaseCsvImport, normalizePurchaseRif, type PurchaseCsvImportRow } from '../../domain/purchase-csv-import';
import type { IPurchaseCsvImportRepository, PurchaseCsvImportBatch, PurchaseCsvImportLineExecution, PurchaseCsvImportMode } from '../../domain/repository/purchase-csv-import.repository';

type RawBatch = { id: string; company_id: string; source_file_name: string; source_company_rif: string | null; configuration: unknown; status: string; revision: number | null; created_at: string | null; updated_at: string | null; };
type RawLine = { id: string; source_row: number; source_header: unknown; source_items: unknown; calculation: unknown; status: string; invoice_id: string | null; };
type JsonRecord = Record<string, unknown>;

const record = (value: unknown): JsonRecord => value != null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
const rows = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

/** Shared-schema persistence adapter for staged purchase CSV imports. */
export class SharedPurchaseCsvImportRepository implements IPurchaseCsvImportRepository {
    /**
     * Binds staged purchase operations to the already-authorized tenant.
     * @param source - Server Supabase connection using service-role credentials.
     * @param tenantId - Tenant authorized by the request boundary.
     * @returns An adapter whose reads and writes always include tenant scope.
     */
    constructor(private readonly source: ISource<SupabaseClient>, private readonly tenantId: string) {}

    /** {@inheritDoc IPurchaseCsvImportRepository.list} */
    async list(companyId: string): Promise<Result<PurchaseCsvImportBatch[]>> {
        try {
            const { data, error } = await this.source.instance.from('shared_inventory_purchase_import_batches').select('*')
                .eq('tenant_id', this.tenantId).eq('company_id', companyId).eq('source_metadata->>source', 'purchase_csv').order('updated_at', { ascending: false });
            if (error) return Result.fail(error.message);
            const result: PurchaseCsvImportBatch[] = [];
            for (const batch of (data as RawBatch[]) ?? []) {
                const mapped = await this.load(batch);
                if (mapped.isFailure) return Result.fail(mapped.getError());
                result.push(mapped.getValue());
            }
            return Result.success(result);
        } catch (error) { return Result.fail(error instanceof Error ? error.message : 'Failed to list purchase CSV imports'); }
    }

    /** {@inheritDoc IPurchaseCsvImportRepository.get} */
    async get(id: string, companyId: string): Promise<Result<PurchaseCsvImportBatch>> {
        try {
            const { data, error } = await this.source.instance.from('shared_inventory_purchase_import_batches').select('*')
                .eq('tenant_id', this.tenantId).eq('id', id).eq('company_id', companyId).eq('source_metadata->>source', 'purchase_csv').maybeSingle();
            if (error) return Result.fail(error.message);
            if (!data) return Result.fail('Importación no encontrada');
            return this.load(data as RawBatch);
        } catch (error) { return Result.fail(error instanceof Error ? error.message : 'Failed to load purchase CSV import'); }
    }

    /** {@inheritDoc IPurchaseCsvImportRepository.save} */
    async save(input: Omit<PurchaseCsvImportBatch, 'status' | 'revision' | 'createdAt' | 'updatedAt'> & { revision?: number }): Promise<Result<PurchaseCsvImportBatch>> {
        try {
            const company = await this.source.instance.from('shared_companies').select('id,rif').eq('tenant_id', this.tenantId).eq('id', input.companyId).maybeSingle();
            if (company.error) return Result.fail(company.error.message);
            if (!company.data) return Result.fail('La empresa no pertenece al tenant');
            const companyRif = typeof (company.data as { rif?: unknown }).rif === 'string' ? (company.data as { rif: string }).rif : '';
            if (companyRif && input.companyRif && normalizePurchaseRif(companyRif) !== normalizePurchaseRif(input.companyRif)) {
                return Result.fail('El RIF del archivo no corresponde a la empresa activa');
            }
            const period = input.rows[0]?.header.date?.slice(0, 7);
            if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period ?? '')) return Result.fail('Fecha de compra inválida');
            const { error: saveError } = await this.source.instance.rpc('shared_inventory_purchase_csv_import_save', {
                p_tenant_id: this.tenantId,
                p_batch: { id: input.id, revision: input.revision ?? null, companyId: input.companyId, period, fileName: input.fileName, companyRif: input.companyRif, config: input.config },
                p_rows: input.rows,
            });
            if (saveError) return Result.fail(saveError.message);
            return this.get(input.id, input.companyId);
        } catch (error) { return Result.fail(error instanceof Error ? error.message : 'Failed to save purchase CSV import'); }
    }

    /** {@inheritDoc IPurchaseCsvImportRepository.execute} */
    async execute(id: string, companyId: string, mode: PurchaseCsvImportMode, revision: number): Promise<Result<PurchaseCsvImportLineExecution[]>> {
        const batch = await this.get(id, companyId);
        if (batch.isFailure) return Result.fail(batch.getError());
        const value = batch.getValue();
        if (value.revision !== revision) return Result.fail('Importación desactualizada; recarga antes de ejecutar');
        const outcomes: PurchaseCsvImportLineExecution[] = [];
        for (const row of value.rows) {
            if (!row.selected) continue;
            const sourceRow = row.header.sourceRow;
            const lineId = row.importLineId ?? String(sourceRow);
            if (row.invoiceStatus === 'confirmada' && row.invoiceId) {
                outcomes.push({ lineId, sourceRow, invoiceId: row.invoiceId, status: 'confirmed', idempotent: true }); continue;
            }
            const calculated = calculatePurchaseCsvRow(row, value.config);
            const headerOnlyDraft = row.items.length === 0 && calculated.errors.length === 0;
            if ((!calculated.complete && !headerOnlyDraft) || calculated.errors.length > 0 || (mode === 'confirm' && calculated.difference !== '0' && !row.acceptDifference && !headerOnlyDraft)) {
                outcomes.push({ lineId, sourceRow, status: 'error', error: calculated.errors[0] ?? 'La fila no está completa o requiere aceptar la diferencia' });
                continue;
            }
            const productPayload = this.productsPayload(row);
            if (productPayload.isFailure) { outcomes.push({ lineId, sourceRow, status: 'error', error: productPayload.getError() }); continue; }
            const invoice = {
                companyId, revision, documentNumber: row.header.documentNumber, controlNumber: row.header.controlNumber, date: row.header.date,
                currency: row.header.currency, subtotal: headerOnlyDraft ? '0' : calculated.subtotal, vatAmount: headerOnlyDraft ? '0' : calculated.vatAmount, total: headerOnlyDraft ? row.header.totalBs : calculated.total,
                dollarRate: row.header.currency === 'USD' ? row.header.exchangeRate : row.items.find(item => item.currency === 'USD')?.exchangeRate ?? null,
                exchangeRates: row.header.currency !== 'VES' ? [{ currencyCode: row.header.currency, vesPerUnit: Number(row.header.exchangeRate), effectiveDate: row.header.date, source: 'manual', decimals: 4 }] : [],
                notes: '[KONT_COMPRA_CSV]' + JSON.stringify({
                    batchId: id, sourceRow, reference: row.header.reference, supplierExternalId: row.header.supplierExternalId,
                    originalTotalBs: row.header.totalBs, config: value.config, acceptedDifference: row.acceptDifference,
                }),
            };
            const items = calculated.items.map((item) => ({ ...item, code: item.source.code }));
            const { data, error } = await this.source.instance.rpc('shared_inventory_purchase_csv_import_execute_line', {
                p_tenant_id: this.tenantId, p_batch_id: id, p_line_id: lineId, p_mode: headerOnlyDraft ? 'draft' : mode, p_invoice: invoice,
                p_items: items, p_supplier: { id: row.supplierId ?? null, rif: row.header.supplierRif, name: row.header.supplierName }, p_products: productPayload.getValue(),
            });
            if (error) outcomes.push({ lineId, sourceRow, status: 'error', error: error.message });
            else { const response = record(data); outcomes.push({ lineId, sourceRow, invoiceId: typeof response.invoiceId === 'string' ? response.invoiceId : undefined, status: response.status === 'confirmed' ? 'confirmed' : 'saved', idempotent: response.idempotent === true }); }
        }
        return Result.success(outcomes);
    }

    private productsPayload(row: PurchaseCsvImportRow): Result<JsonRecord[]> {
        const products = new Map<string, JsonRecord>();
        for (const item of row.items) {
            const resolution = row.productResolutions[item.code];
            if (!resolution) return Result.fail(`Falta resolver el producto ${item.code}`);
            products.set(item.code, { code: item.code, id: resolution.productId ?? null, createId: resolution.productId ? null : crypto.randomUUID(), name: resolution.create?.name ?? item.description, measureUnit: resolution.create?.measureUnit ?? 'unidad', valuationMethod: resolution.create?.valuationMethod ?? 'promedio_ponderado', vatType: resolution.create?.vatType ?? 'general', salePricing: resolution.create?.salePricing ?? null });
        }
        return Result.success([...products.values()]);
    }

    private async load(batch: RawBatch): Promise<Result<PurchaseCsvImportBatch>> {
        const lines: RawLine[] = [];
        for (let offset = 0; ; offset += 500) {
            const { data, error } = await this.source.instance.from('shared_inventory_purchase_import_lines').select('*')
                .eq('tenant_id', this.tenantId).eq('batch_id', batch.id).order('source_row').range(offset, offset + 499);
            if (error) return Result.fail(error.message);
            lines.push(...((data as RawLine[]) ?? []));
            if ((data?.length ?? 0) < 500) break;
        }
        const invoiceIds = [...new Set(lines.flatMap(line => line.invoice_id ? [line.invoice_id] : []))];
        const states = new Map<string, 'borrador' | 'confirmada'>();
        for (let offset = 0; offset < invoiceIds.length; offset += 100) {
            const { data, error } = await this.source.instance.from('shared_inventory_purchase_invoices').select('id,status')
                .eq('tenant_id', this.tenantId).eq('company_id', batch.company_id).in('id', invoiceIds.slice(offset, offset + 100));
            if (error) return Result.fail(error.message);
            for (const invoice of data ?? []) states.set(invoice.id, invoice.status);
        }
        const importRows = lines.map((line) => {
            const calculation = record(line.calculation);
            return { header: record(line.source_header), items: rows(line.source_items), selected: calculation.selected === true,
                supplierId: typeof calculation.supplierId === 'string' ? calculation.supplierId : undefined,
                productResolutions: record(calculation.productResolutions), acceptDifference: calculation.acceptDifference === true,
                importLineId: line.id, invoiceId: line.invoice_id ?? undefined, invoiceStatus: line.invoice_id ? states.get(line.invoice_id) : undefined } as unknown as PurchaseCsvImportRow;
        });
        return Result.success({ id: batch.id, companyId: batch.company_id, fileName: batch.source_file_name, companyRif: batch.source_company_rif ?? '', ...normalizePurchaseCsvImport(record(batch.configuration) as unknown as PurchaseCsvImportBatch['config'], importRows), status: batch.status, revision: batch.revision ?? 1, createdAt: batch.created_at ?? undefined, updatedAt: batch.updated_at ?? undefined });
    }
}
