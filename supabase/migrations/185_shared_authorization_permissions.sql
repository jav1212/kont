-- Shared-schema authorization catalog. Shared tables are public tables with the
-- shared_ prefix, matching the existing shared tenant data model.

DO $$
DECLARE constraint_name text;
BEGIN
    SELECT conname INTO constraint_name
      FROM pg_constraint
     WHERE conrelid = 'public.tenant_memberships'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%role%';
    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.tenant_memberships DROP CONSTRAINT %I', constraint_name);
    END IF;
END $$;

ALTER TABLE public.tenant_memberships
    ADD CONSTRAINT tenant_memberships_role_check
    CHECK (role IN ('owner', 'admin', 'contador', 'contable', 'vendedor', 'cajero'));

CREATE TABLE IF NOT EXISTS public.shared_authorization_permissions (
    code text PRIMARY KEY,
    resource text NOT NULL,
    action text NOT NULL,
    description text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (resource, action)
);

CREATE TABLE IF NOT EXISTS public.shared_authorization_role_permissions (
    role text NOT NULL CHECK (role IN ('owner', 'admin', 'contador', 'contable', 'vendedor', 'cajero')),
    permission_code text NOT NULL REFERENCES public.shared_authorization_permissions(code) ON DELETE CASCADE,
    PRIMARY KEY (role, permission_code)
);

CREATE TABLE IF NOT EXISTS public.shared_authorization_audit (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    permission_code text NOT NULL,
    resource_type text,
    resource_id text,
    method text,
    path text,
    decision text NOT NULL CHECK (decision IN ('allow', 'deny')),
    reason text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shared_authorization_audit_tenant_created_idx
    ON public.shared_authorization_audit (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS shared_authorization_audit_user_created_idx
    ON public.shared_authorization_audit (user_id, created_at DESC);

INSERT INTO public.shared_authorization_permissions (code, resource, action, description) VALUES
    ('companies.read', 'companies', 'read', 'Ver empresas'), ('companies.create', 'companies', 'create', 'Crear empresas'),
    ('companies.update', 'companies', 'update', 'Editar empresas'), ('companies.delete', 'companies', 'delete', 'Eliminar empresas'),
    ('members.read', 'members', 'read', 'Ver miembros'), ('members.invite', 'members', 'invite', 'Invitar miembros'),
    ('members.update', 'members', 'update', 'Cambiar roles'), ('members.revoke', 'members', 'revoke', 'Revocar miembros'),
    ('employees.read', 'employees', 'read', 'Ver empleados'), ('employees.create', 'employees', 'create', 'Crear empleados'),
    ('employees.update', 'employees', 'update', 'Editar empleados'), ('employees.delete', 'employees', 'delete', 'Eliminar empleados'),
    ('documents.read', 'documents', 'read', 'Ver documentos'), ('documents.create', 'documents', 'create', 'Crear documentos'),
    ('documents.update', 'documents', 'update', 'Editar documentos'), ('documents.delete', 'documents', 'delete', 'Eliminar documentos'),
    ('payroll.read', 'payroll', 'read', 'Ver nómina'), ('payroll.create', 'payroll', 'create', 'Crear nómina'),
    ('payroll.confirm', 'payroll', 'confirm', 'Confirmar nómina'), ('payroll.delete', 'payroll', 'delete', 'Eliminar nómina'),
    ('inventory.read', 'inventory', 'read', 'Ver inventario'), ('inventory.create', 'inventory', 'create', 'Crear inventario'),
    ('inventory.update', 'inventory', 'update', 'Editar inventario'), ('inventory.delete', 'inventory', 'delete', 'Eliminar inventario'),
    ('purchases.read', 'purchases', 'read', 'Ver compras'), ('purchases.create', 'purchases', 'create', 'Crear compras'),
    ('purchases.confirm', 'purchases', 'confirm', 'Confirmar compras'), ('purchases.cancel', 'purchases', 'cancel', 'Anular compras'),
    ('sales.read', 'sales', 'read', 'Ver ventas'), ('sales.create', 'sales', 'create', 'Crear ventas'),
    ('sales.update', 'sales', 'update', 'Editar ventas'), ('sales.confirm', 'sales', 'confirm', 'Confirmar ventas'),
    ('sales.cancel', 'sales', 'cancel', 'Anular ventas'), ('accounting.read', 'accounting', 'read', 'Ver contabilidad'),
    ('accounting.create', 'accounting', 'create', 'Crear registros contables'), ('accounting.update', 'accounting', 'update', 'Editar contabilidad'),
    ('accounting.post', 'accounting', 'post', 'Publicar asientos'), ('accounting.close', 'accounting', 'close', 'Cerrar períodos'),
    ('reports.read', 'reports', 'read', 'Ver reportes'), ('billing.read', 'billing', 'read', 'Ver facturación'),
    ('billing.manage', 'billing', 'manage', 'Gestionar facturación')
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO public.shared_authorization_role_permissions (role, permission_code)
SELECT 'admin', code FROM public.shared_authorization_permissions WHERE code <> 'billing.manage' ON CONFLICT DO NOTHING;
INSERT INTO public.shared_authorization_role_permissions (role, permission_code)
SELECT 'contador', code FROM public.shared_authorization_permissions
 WHERE resource IN ('companies', 'employees', 'payroll', 'purchases', 'sales', 'inventory', 'accounting', 'reports')
   AND action IN ('read', 'create', 'update', 'confirm', 'post', 'close') ON CONFLICT DO NOTHING;
INSERT INTO public.shared_authorization_role_permissions (role, permission_code)
SELECT 'contable', permission_code FROM public.shared_authorization_role_permissions WHERE role = 'contador' ON CONFLICT DO NOTHING;
INSERT INTO public.shared_authorization_role_permissions (role, permission_code) VALUES
 ('vendedor', 'companies.read'), ('vendedor', 'sales.read'), ('vendedor', 'sales.create'), ('vendedor', 'sales.update'), ('vendedor', 'sales.confirm'), ('vendedor', 'inventory.read'), ('vendedor', 'reports.read'),
 ('cajero', 'companies.read'), ('cajero', 'sales.read'), ('cajero', 'sales.create'), ('cajero', 'sales.confirm'), ('cajero', 'inventory.read')
ON CONFLICT DO NOTHING;

ALTER TABLE public.shared_authorization_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_authorization_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_authorization_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shared_authorization_permissions_read ON public.shared_authorization_permissions;
CREATE POLICY shared_authorization_permissions_read ON public.shared_authorization_permissions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS shared_authorization_role_permissions_read ON public.shared_authorization_role_permissions;
CREATE POLICY shared_authorization_role_permissions_read ON public.shared_authorization_role_permissions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS shared_authorization_audit_service_only ON public.shared_authorization_audit;
CREATE POLICY shared_authorization_audit_service_only ON public.shared_authorization_audit FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT SELECT ON public.shared_authorization_permissions, public.shared_authorization_role_permissions TO authenticated;
GRANT ALL ON public.shared_authorization_audit TO service_role;
