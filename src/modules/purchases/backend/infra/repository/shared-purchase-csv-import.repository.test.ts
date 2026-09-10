import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Result } from "@/src/core/domain/result";
import type { ISource } from "@/src/shared/backend/source/domain/repository/source.repository";
import type { PurchaseCsvImportBatch } from "../../domain/repository/purchase-csv-import.repository";
import type { PurchaseCsvImportRow } from "../../domain/purchase-csv-import";
import { SharedPurchaseCsvImportRepository } from "./shared-purchase-csv-import.repository";

function fixture(records: Record<string, Array<Record<string, unknown>>> = {}) {
    const calls: Array<{ name: string; input: Record<string, unknown> }> = [];
    const reads: Array<{ table: string; column: string; value: unknown }> = [];
    const client = {
        from: (table: string) => {
            const response = Promise.resolve({ data: records[table] ?? [], error: null });
            const query = Object.assign(response, {
                select: (_columns: string) => query,
                eq: (column: string, value: unknown) => { reads.push({ table, column, value }); return query; },
                in: (_column: string, _values: unknown[]) => query,
            });
            return query;
        },
        rpc: async (name: string, input: Record<string, unknown>) => {
            calls.push({ name, input });
            return { data: { invoiceId: "draft", status: "saved" }, error: null };
        },
    } as unknown as SupabaseClient;
    const source: ISource<SupabaseClient> = { instance: client, connect: () => client, disconnect: async () => {} };
    const row: PurchaseCsvImportRow = {
        header: { sourceRow: 9, date: "2026-09-05", supplierName: "Proveedor", supplierRif: "J123456789", documentNumber: "001", controlNumber: "00-1", reference: "1", supplierExternalId: "151", currency: "VES", totalBs: "116", documentType: "Factura", exchangeRate: "1" },
        items: [{ sourceRow: 9, quantity: "1", code: "001", description: "Producto", unitCostBs: "116", subtotalBs: "116", fullCostBs: "116", currencyCost: "116", currencySubtotal: "116", currencyFullCost: "116", salePrice: "0", markupPercent: "0", currency: "VES", exchangeRate: "1", purchaseVatCode: "IVA", date: "2026-09-05", documentNumber: "001", supplierExternalId: "151", sourceStock: "0", saleVatCode: "IVA" }],
        selected: true, supplierId: "supplier", productResolutions: { "001": { productId: "product" } }, acceptDifference: true,
        importLineId: "line", invoiceId: "draft", invoiceStatus: "borrador",
    };
    const batch: PurchaseCsvImportBatch = { id: "batch", companyId: "company", fileName: "test.csv", companyRif: "J123456789", rows: [row], config: { costsIncludeVat: false, reviewed: true, vatMappings: {} }, status: "in_progress", revision: 3 };
    const repo = new SharedPurchaseCsvImportRepository(source, "tenant");
    repo.get = async () => Result.success(batch);
    repo.getByInvoice = async () => Result.success(batch);
    return { repo, batch, row, calls, reads };
}

test("scoped execution posts only the restored target with its server invoice link", async () => {
    const f = fixture();
    f.repo.get = async () => { throw new Error("Target execution must not load the full batch"); };
    const result = await f.repo.execute("batch", "company", "draft", 3, "draft");
    assert.equal(result.isSuccess, true);
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].name, "shared_inventory_purchase_csv_import_execute_target_line");
    assert.equal(f.calls[0].input.p_target_invoice_id, "draft");
    assert.equal(f.calls[0].input.p_line_id, "line");
    assert.equal(f.calls[0].input.p_tenant_id, "tenant");
});

test("a target cannot execute under another batch id or an obsolete preview revision", async () => {
    const f = fixture();
    assert.equal((await f.repo.execute("other-batch", "company", "confirm", 3, "draft")).isFailure, true);
    assert.equal((await f.repo.execute("batch", "company", "confirm", 2, "draft")).isFailure, true);
    assert.equal(f.calls.length, 0);
});

test("full-batch execution respects independently reviewed IVA configuration without changing its default", async () => {
    const f = fixture();
    f.row.configOverride = { costsIncludeVat: true, reviewed: true, vatMappings: {} };
    const result = await f.repo.execute("batch", "company", "draft", 3);
    assert.equal(result.isSuccess, true);
    assert.equal(f.calls.length, 1);
    const invoice = f.calls[0].input.p_invoice as Record<string, unknown>;
    assert.equal(invoice.subtotal, "100");
    assert.equal(invoice.vatAmount, "16");
    assert.equal(invoice.total, "116");
    assert.equal(f.batch.config.costsIncludeVat, false);
});

test("confirmed retry returns its invoice without requiring products or posting again", async () => {
    const f = fixture();
    f.row.invoiceStatus = "confirmada";
    f.row.productResolutions = {};
    const result = await f.repo.execute("batch", "company", "confirm", 3, "draft");
    assert.equal(result.isSuccess, true);
    assert.deepEqual(result.getValue(), [{ lineId: "line", sourceRow: 9, invoiceId: "draft", status: "confirmed", idempotent: true }]);
    assert.equal(f.calls.length, 0);
});

test("failed target resolution cannot fall back to executing its batch", async () => {
    const f = fixture();
    f.repo.getByInvoice = async () => Result.fail("La factura no corresponde a esta empresa");
    assert.equal((await f.repo.execute("batch", "other-company", "confirm", 3, "draft")).isFailure, true);
    assert.equal(f.calls.length, 0);
});

test("opening a specific draft is independent of an earlier batch deselection", async () => {
    const f = fixture();
    f.row.selected = false;
    const result = await f.repo.execute("batch", "company", "draft", 3, "draft");
    assert.equal(result.isSuccess, true);
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].input.p_target_invoice_id, "draft");
});

test("a new batch skips a confirmed supplier identity before demanding stale product resolutions", async () => {
    const f = fixture({
        shared_inventory_purchase_invoices: [{ id: "posted", status: "confirmada", supplier_id: "supplier" }],
        shared_inventory_suppliers: [{ id: "supplier", rif: "J-12345678-9" }],
    });
    f.row.invoiceId = undefined;
    f.row.invoiceStatus = undefined;
    f.row.productResolutions = {};
    const result = await f.repo.execute("batch", "company", "confirm", 3);
    assert.equal(result.isSuccess, true);
    assert.equal(result.getValue()[0].invoiceId, "posted");
    assert.equal(result.getValue()[0].idempotent, true);
    assert.equal(f.calls.length, 0);
    for (const table of ["shared_inventory_purchase_invoices", "shared_inventory_suppliers"]) {
        assert.ok(f.reads.some(read => read.table === table && read.column === "tenant_id" && read.value === "tenant"));
        assert.ok(f.reads.some(read => read.table === table && read.column === "company_id" && read.value === "company"));
    }
});

test("an equal document number from a different supplier is not skipped", async () => {
    const f = fixture({
        shared_inventory_purchase_invoices: [{ id: "posted", status: "confirmada", supplier_id: "another-supplier" }],
        shared_inventory_suppliers: [{ id: "another-supplier", rif: "J987654321" }],
    });
    f.row.invoiceId = undefined;
    f.row.invoiceStatus = undefined;
    const result = await f.repo.execute("batch", "company", "draft", 3);
    assert.equal(result.isSuccess, true);
    assert.equal(f.calls.length, 1);
    assert.equal(result.getValue()[0].invoiceId, "draft");
});
