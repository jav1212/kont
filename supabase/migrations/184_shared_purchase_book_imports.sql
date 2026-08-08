-- 184_shared_purchase_book_imports.sql
-- Persist the fiscal values imported from the official purchase book.
-- The invoice header may be recalculated after products are entered; these
-- tables preserve the original source values for reconciliation and audit.

CREATE TABLE IF NOT EXISTS public.shared_inventory_purchase_import_batches (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    id text NOT NULL,
    company_id text NOT NULL,
    period text NOT NULL,
    source_file_name text NOT NULL,
    source_file_hash text,
    source_company_rif text,
    status text NOT NULL DEFAULT 'imported',
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    CHECK (status IN ('imported','in_progress','completed','cancelled')),
    FOREIGN KEY (tenant_id, company_id)
        REFERENCES public.shared_companies(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.shared_inventory_purchase_import_lines (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    id text NOT NULL,
    batch_id text NOT NULL,
    source_row integer NOT NULL,
    operation text NOT NULL DEFAULT '',
    supplier_rif text NOT NULL DEFAULT '',
    supplier_name text NOT NULL DEFAULT '',
    invoice_date date NOT NULL,
    period text NOT NULL,
    document_type text NOT NULL DEFAULT 'factura',
    document_number text NOT NULL DEFAULT '',
    control_number text NOT NULL DEFAULT '',
    expected_total numeric(14,2) NOT NULL DEFAULT 0,
    expected_exempt numeric(14,2) NOT NULL DEFAULT 0,
    expected_taxable_base numeric(14,2) NOT NULL DEFAULT 0,
    expected_vat_rate numeric(7,4) NOT NULL DEFAULT 0,
    expected_vat_amount numeric(14,2) NOT NULL DEFAULT 0,
    expected_retention numeric(14,2) NOT NULL DEFAULT 0,
    invoice_id text,
    status text NOT NULL DEFAULT 'imported',
    warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
    actual_subtotal numeric(14,2),
    actual_vat_amount numeric(14,2),
    actual_total numeric(14,2),
    difference_subtotal numeric(14,2),
    difference_vat_amount numeric(14,2),
    difference_total numeric(14,2),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, batch_id, source_row),
    CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    CHECK (document_type IN ('factura','nota_credito','nota_debito')),
    CHECK (status IN ('imported','in_progress','completed','cancelled','error')),
    FOREIGN KEY (tenant_id, batch_id)
        REFERENCES public.shared_inventory_purchase_import_batches(tenant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, invoice_id)
        REFERENCES public.shared_inventory_purchase_invoices(tenant_id, id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS shared_purchase_import_batches_company_period_idx
    ON public.shared_inventory_purchase_import_batches(tenant_id, company_id, period);
CREATE INDEX IF NOT EXISTS shared_purchase_import_lines_batch_idx
    ON public.shared_inventory_purchase_import_lines(tenant_id, batch_id);
CREATE INDEX IF NOT EXISTS shared_purchase_import_lines_invoice_idx
    ON public.shared_inventory_purchase_import_lines(tenant_id, invoice_id);

CREATE UNIQUE INDEX IF NOT EXISTS shared_purchase_import_batches_file_hash_idx
    ON public.shared_inventory_purchase_import_batches(tenant_id, company_id, period, source_file_hash)
    WHERE source_file_hash IS NOT NULL;

ALTER TABLE public.shared_inventory_purchase_import_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shared_purchase_import_batches_member_access
    ON public.shared_inventory_purchase_import_batches;
CREATE POLICY shared_purchase_import_batches_member_access
    ON public.shared_inventory_purchase_import_batches FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.tenant_memberships m
        WHERE m.tenant_id = shared_inventory_purchase_import_batches.tenant_id
          AND m.member_id = auth.uid()
          AND m.accepted_at IS NOT NULL
          AND m.revoked_at IS NULL
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.tenant_memberships m
        WHERE m.tenant_id = shared_inventory_purchase_import_batches.tenant_id
          AND m.member_id = auth.uid()
          AND m.accepted_at IS NOT NULL
          AND m.revoked_at IS NULL
    ));

ALTER TABLE public.shared_inventory_purchase_import_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shared_purchase_import_lines_member_access
    ON public.shared_inventory_purchase_import_lines;
CREATE POLICY shared_purchase_import_lines_member_access
    ON public.shared_inventory_purchase_import_lines FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.tenant_memberships m
        WHERE m.tenant_id = shared_inventory_purchase_import_lines.tenant_id
          AND m.member_id = auth.uid()
          AND m.accepted_at IS NOT NULL
          AND m.revoked_at IS NULL
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.tenant_memberships m
        WHERE m.tenant_id = shared_inventory_purchase_import_lines.tenant_id
          AND m.member_id = auth.uid()
          AND m.accepted_at IS NOT NULL
          AND m.revoked_at IS NULL
    ));

GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.shared_inventory_purchase_import_batches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.shared_inventory_purchase_import_lines TO authenticated;
