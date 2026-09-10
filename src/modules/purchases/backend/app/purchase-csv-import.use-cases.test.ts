import assert from "node:assert/strict";
import test from "node:test";
import { Result } from "@/src/core/domain/result";
import { SavePurchaseCsvImportUseCase } from "./save-purchase-csv-import.use-case";
import { ExecutePurchaseCsvImportUseCase } from "./execute-purchase-csv-import.use-case";
import type { IPurchaseCsvImportRepository, PurchaseCsvImportBatch } from "../domain/repository/purchase-csv-import.repository";
import { parsePurchaseHeaders } from "../domain/purchase-csv-import";

function fixture() {
    const header = parsePurchaseHeaders("Fecha;Proveedor;RIF;Documento;Control;Referencia;ID Pro;Moneda;Total Bs.;Tipo Doc;Tasa Cambio Bs.\n01/09/2026;Proveedor;J123456789;001;00-1;1;1;VES;100;Factura;1").rows[0];
    const input = { companyId: "test", fileName: "report.csv", companyRif: "J123456789", config: { reviewed: false, costsIncludeVat: false, vatMappings: {} },
        rows: [{ header, items: [], selected: true, productResolutions: {}, acceptDifference: false }] };
    let saves = 0, executions = 0;
    let saved: PurchaseCsvImportBatch | undefined;
    const repo: IPurchaseCsvImportRepository = {
        list: async () => Result.success([]),
        get: async () => Result.fail("unused"),
        getByInvoice: async () => Result.fail("unused"),
        save: async value => {
            saves++;
            saved = { ...value, revision: 1, status: "in_progress" } as PurchaseCsvImportBatch;
            return Result.success(saved);
        },
        execute: async (_id, _companyId, _mode, revision) => { executions++; assert.equal(revision, 3); return Result.success([]); },
    };
    return { input, repo, counts: () => ({ saves, executions }), saved: () => saved };
}

test("staging automatically accepts the calculated total and keeps the source total as reference", async () => {
    const f = fixture();
    const action = new SavePurchaseCsvImportUseCase(f.repo);
    assert.equal((await action.execute(f.input)).isSuccess, true);
    assert.equal(f.saved()?.rows[0].acceptDifference, true);
    assert.equal(f.saved()?.rows[0].header.totalBs, "100");
    assert.equal(f.input.rows[0].acceptDifference, false);
    assert.equal(f.input.rows[0].header.totalBs, "100");
});

test("staging can be saved before tax review; duplicate source row keys cannot overwrite lines", async () => {
    const f = fixture();
    const action = new SavePurchaseCsvImportUseCase(f.repo);
    assert.equal((await action.execute(f.input)).isSuccess, true);
    assert.equal((await action.execute({ ...f.input, rows: [...f.input.rows, ...f.input.rows] })).isFailure, true);
    assert.equal(f.counts().saves, 1);
});

test("execution requires the caller's reviewed revision and a valid mode", async () => {
    const f = fixture();
    const action = new ExecutePurchaseCsvImportUseCase(f.repo);
    assert.equal((await action.execute({ id: "id", companyId: "test", mode: "confirm", revision: 0 })).isFailure, true);
    assert.equal((await action.execute({ id: "id", companyId: "test", mode: "confirm", revision: 3 })).isSuccess, true);
    assert.equal(f.counts().executions, 1);
});

test("target saves require exactly one row", async () => {
    const f = fixture();
    const action = new SavePurchaseCsvImportUseCase(f.repo);
    const second = { ...f.input.rows[0], header: { ...f.input.rows[0].header, sourceRow: 2 } };
    const result = await action.execute({ ...f.input, targetInvoiceId: "draft", rows: [f.input.rows[0], second] });
    assert.equal(result.isFailure, true);
    assert.equal(f.counts().saves, 0);
});

test("target save forwards the draft identity to the persistence boundary", async () => {
    const f = fixture();
    const action = new SavePurchaseCsvImportUseCase(f.repo);
    assert.equal((await action.execute({ ...f.input, targetInvoiceId: "draft-id" })).isSuccess, true);
    assert.equal((f.saved() as PurchaseCsvImportBatch & { targetInvoiceId?: string }).targetInvoiceId, "draft-id");
});
