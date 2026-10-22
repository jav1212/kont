import type { SystemLabelDefinition } from "@kontave/preferences/application";

/** Canonical Web labels owned by the inventory product-list/form capability.
 * Identifiers are stable across rendered headers and controls; labels never influence product data.
 */
export const PRODUCT_SYSTEM_LABELS: readonly SystemLabelDefinition[] = Object.freeze([
  { id: "system.inventory.products.code", defaultLabel: "Código", customizable: true },
  { id: "system.inventory.products.barcode", defaultLabel: "Código de barras", customizable: true },
  { id: "system.inventory.products.name", defaultLabel: "Nombre", customizable: true },
  { id: "system.inventory.products.department", defaultLabel: "Departamento", customizable: true },
  { id: "system.inventory.products.stock", defaultLabel: "Existencia", customizable: true },
  { id: "system.inventory.products.sale-price", defaultLabel: "Precio de venta", customizable: true },
  { id: "system.inventory.products.status", defaultLabel: "Estado", customizable: true },
  { id: "system.inventory.products.vat-type", defaultLabel: "IVA", customizable: true },
]);
