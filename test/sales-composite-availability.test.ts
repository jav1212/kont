import assert from "node:assert/strict";
import test from "node:test";
import type { Product } from "../src/modules/inventory/backend/domain/product";
import { getSaleableStock, isCompositePending } from "../src/modules/sales/frontend/utils/composite-availability";

function product(overrides: Partial<Product>): Product {
    return {
        companyId: "company-1", code: "P-1", name: "Producto", description: "", type: "mercancia",
        measureUnit: "unidad", valuationMethod: "promedio_ponderado", currentStock: 10,
        averageCost: 0, active: true, vatType: "general", ...overrides,
    };
}

test("calcula la disponibilidad de un compuesto desde su componente limitante", () => {
    const composite = product({
        compositionKind: "composite", compositionStatus: "ready",
        components: [
            { productId: "a", quantity: 2, code: "A", name: "Pan", measureUnit: "unidad", currentStock: 9, active: true },
            { productId: "b", quantity: 0.25, code: "B", name: "Queso", measureUnit: "kg", currentStock: 1, active: true },
        ],
    });

    assert.equal(getSaleableStock(composite), 4);
    assert.equal(isCompositePending(composite), false);
});

test("bloquea compuestos pendientes, inválidos o con componentes inactivos", () => {
    assert.equal(isCompositePending(product({ compositionKind: "composite", compositionStatus: "pending", components: [] })), true);
    assert.equal(getSaleableStock(product({ compositionKind: "composite", compositionStatus: "ready", components: [{ productId: "a", quantity: Number.NaN, code: "A", name: "Pan", measureUnit: "unidad", currentStock: 5, active: true }] })), 0);
    assert.equal(isCompositePending(product({ compositionKind: "composite", compositionStatus: "ready", components: [{ productId: "a", quantity: 1, code: "A", name: "Pan", measureUnit: "unidad", currentStock: 5, active: false }] })), true);
});
