// Domain types for the bulk-migrate purchase-invoices operation.
// Mirrors the jsonb shape returned by tenant_inventario_factura_migrate.

export interface MigratedInvoice {
  id:               string;
  sourceCompanyId:  string;
  targetCompanyId:  string;
  wasConfirmed:     boolean;
  date:             string;   // YYYY-MM-DD — invoice fecha (post-migración, igual que origen)
  period:           string;   // YYYY-MM — período post-migración (puede diferir del origen si hubo override)
  subtotal:         number;
  vatAmount:        number;
  total:            number;
}

export interface SkippedInvoice {
  id:     string;
  reason: 'already-in-target';
}

export interface CreatedSupplierRef {
  id:     string;
  rif:    string;
  nombre: string;
}

export interface CreatedProductRef {
  id:     string;
  codigo: string;
  nombre: string;
}

export interface MigratePurchaseInvoicesResult {
  migrated:          MigratedInvoice[];
  skipped:           SkippedInvoice[];
  createdSuppliers:  CreatedSupplierRef[];
  createdProducts:   CreatedProductRef[];
}
