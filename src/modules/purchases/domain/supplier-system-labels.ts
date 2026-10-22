import type { SystemLabelDefinition } from "@kontave/preferences/application";

/** Canonical presentation labels for the purchasing supplier catalog. */
export const SUPPLIER_SYSTEM_LABELS: readonly SystemLabelDefinition[] = Object.freeze([
  { id: "system.purchases.suppliers.rif", defaultLabel: "RIF", customizable: false },
  { id: "system.purchases.suppliers.name", defaultLabel: "Nombre", customizable: true },
  { id: "system.purchases.suppliers.contact", defaultLabel: "Contacto", customizable: true },
  { id: "system.purchases.suppliers.phone", defaultLabel: "Teléfono", customizable: true },
  { id: "system.purchases.suppliers.email", defaultLabel: "Email", customizable: true },
  { id: "system.purchases.suppliers.address", defaultLabel: "Dirección", customizable: true },
  { id: "system.purchases.suppliers.status", defaultLabel: "Estado", customizable: true },
  { id: "system.purchases.suppliers.notes", defaultLabel: "Notas", customizable: true },
]);
