-- 124_shared_inventory_departments_pilot.sql

CREATE TABLE IF NOT EXISTS public.shared_inventory_departments (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    id text NOT NULL,
    company_id text NOT NULL,
    name text NOT NULL,
    description text NOT NULL DEFAULT '',
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id, company_id)
        REFERENCES public.shared_companies (tenant_id, id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS shared_inventory_departments_company_idx
    ON public.shared_inventory_departments (tenant_id, company_id, name);

ALTER TABLE public.shared_inventory_departments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shared_inventory_departments_member_access ON public.shared_inventory_departments;
CREATE POLICY shared_inventory_departments_member_access ON public.shared_inventory_departments
    FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.tenant_memberships m
        WHERE m.tenant_id = shared_inventory_departments.tenant_id
          AND m.member_id = auth.uid()
          AND m.accepted_at IS NOT NULL AND m.revoked_at IS NULL
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.tenant_memberships m
        WHERE m.tenant_id = shared_inventory_departments.tenant_id
          AND m.member_id = auth.uid()
          AND m.accepted_at IS NOT NULL AND m.revoked_at IS NULL
    ));

DO $$
DECLARE t record;
BEGIN
    FOR t IN SELECT id, schema_name FROM public.tenants LOOP
        EXECUTE format($sql$
            INSERT INTO public.shared_inventory_departments
                (tenant_id, id, company_id, name, description, active, created_at)
            SELECT %L::uuid, d.id, d.empresa_id, d.nombre, d.descripcion,
                   d.activo, d.created_at
            FROM %I.inventario_departamentos d
            JOIN public.shared_companies c
              ON c.tenant_id = %L::uuid AND c.id = d.empresa_id
            ON CONFLICT (tenant_id, id) DO NOTHING
        $sql$, t.id, t.schema_name, t.id);
    END LOOP;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_inventory_departments TO authenticated;
