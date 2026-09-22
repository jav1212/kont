import type { Product } from "@/src/modules/inventory/backend/domain/product";

/**
 * Calculates the saleable quantity for a product without changing inventory.
 * Composite availability is constrained by its least available component.
 *
 * @param product - Product with optional composite-component information.
 * @returns Current saleable quantity, or zero when a composite is pending.
 */
export function getSaleableStock(product: Product): number {
    if (product.compositionKind !== "composite") return product.currentStock;
    if (product.compositionStatus !== "ready" || !product.components?.length) return 0;
    return Math.max(0, Math.min(...product.components.map((component) => component.active && Number.isFinite(component.quantity) && component.quantity > 0 && Number.isFinite(component.currentStock) ? component.currentStock / component.quantity : 0)));
}

/**
 * Indicates whether a composite product has not yet received a usable component list.
 *
 * @param product - Product to assess.
 * @returns Whether the product must be blocked from client-side sale selection.
 */
export function isCompositePending(product: Product): boolean {
    return product.compositionKind === "composite" && (product.compositionStatus !== "ready" || !product.components?.length || product.components.some((component) => !component.active || !Number.isFinite(component.quantity) || component.quantity <= 0 || !Number.isFinite(component.currentStock)));
}
