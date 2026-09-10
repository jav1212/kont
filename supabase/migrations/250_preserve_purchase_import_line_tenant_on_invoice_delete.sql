-- Import lines are owned by their tenant and batch. Deleting a linked draft
-- invoice must clear only the optional invoice reference; the composite key
-- must continue to enforce that a line cannot reference another tenant.

ALTER TABLE public.shared_inventory_purchase_import_lines
    DROP CONSTRAINT IF EXISTS shared_inventory_purchase_import_line_tenant_id_invoice_id_fkey,
    DROP CONSTRAINT IF EXISTS shared_inventory_purchase_import_lines_tenant_id_invoice_id_fkey;

ALTER TABLE public.shared_inventory_purchase_import_lines
    ADD CONSTRAINT shared_inventory_purchase_import_line_tenant_id_invoice_id_fkey
    FOREIGN KEY (tenant_id, invoice_id)
    REFERENCES public.shared_inventory_purchase_invoices(tenant_id, id)
    ON DELETE SET NULL (invoice_id);
