-- 128_shared_inventory_suppliers_pilot.sql

CREATE TABLE IF NOT EXISTS public.shared_inventory_suppliers (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    id text NOT NULL,
    company_id text NOT NULL,
    rif text NOT NULL DEFAULT '',
    name text NOT NULL,
    contact text NOT NULL DEFAULT '',
    phone text NOT NULL DEFAULT '',
    email text NOT NULL DEFAULT '',
    address text NOT NULL DEFAULT '',
    notes text NOT NULL DEFAULT '',
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,id),
    FOREIGN KEY (tenant_id,company_id) REFERENCES public.shared_companies(tenant_id,id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS shared_inventory_suppliers_company_idx ON public.shared_inventory_suppliers(tenant_id,company_id,active);
ALTER TABLE public.shared_inventory_suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shared_inventory_suppliers_member_access ON public.shared_inventory_suppliers;
CREATE POLICY shared_inventory_suppliers_member_access ON public.shared_inventory_suppliers FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.tenant_memberships m WHERE m.tenant_id=shared_inventory_suppliers.tenant_id AND m.member_id=auth.uid() AND m.accepted_at IS NOT NULL AND m.revoked_at IS NULL))
WITH CHECK (EXISTS (SELECT 1 FROM public.tenant_memberships m WHERE m.tenant_id=shared_inventory_suppliers.tenant_id AND m.member_id=auth.uid() AND m.accepted_at IS NOT NULL AND m.revoked_at IS NULL));

DO $$
DECLARE t record;
BEGIN
    FOR t IN SELECT id,schema_name FROM public.tenants LOOP
        EXECUTE format($sql$
            INSERT INTO public.shared_inventory_suppliers
              (tenant_id,id,company_id,rif,name,contact,phone,email,address,notes,active,created_at,updated_at)
            SELECT %L::uuid,s.id,s.empresa_id,s.rif,s.nombre,s.contacto,s.telefono,s.email,s.direccion,s.notas,s.activo,s.created_at,s.updated_at
            FROM %I.inventario_proveedores s
            JOIN public.shared_companies c ON c.tenant_id=%L::uuid AND c.id=s.empresa_id
            ON CONFLICT (tenant_id,id) DO NOTHING
        $sql$,t.id,t.schema_name,t.id);
    END LOOP;
END $$;

GRANT SELECT,INSERT,UPDATE,DELETE ON public.shared_inventory_suppliers TO authenticated;
