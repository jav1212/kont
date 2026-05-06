-- =============================================================================
-- 100_perf_rls_initplan_and_fk_indexes.sql
-- Performance: Fase 2 del plan.
--
-- Operaciones (todas no destructivas):
--   1. Reescribir 12 policies en `public.*` para envolver `auth.uid()`
--      en `(SELECT auth.uid())`. Postgres evalúa el SELECT una sola vez
--      por consulta en lugar de una vez por fila.
--   2. Loop sobre los 4 schemas tenant: regenerar la policy `tenant_owner`
--      en cada tabla con la versión `(SELECT auth.uid()) = '<uuid>'::uuid`.
--   3. Crear 58 índices `IF NOT EXISTS` sobre foreign keys sin cobertura.
--      No bloquea writes (CREATE INDEX en Postgres es non-blocking si se
--      usa CONCURRENTLY, pero como migración va dentro de transacción,
--      se usa CREATE INDEX normal — tablas con pocos rows, latencia ínfima).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Reescribir public policies con (SELECT auth.uid())
-- ---------------------------------------------------------------------------

-- profiles
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = id);

-- tenant_subscriptions
DROP POLICY IF EXISTS tenant_subscriptions_own_read ON public.tenant_subscriptions;
CREATE POLICY tenant_subscriptions_own_read ON public.tenant_subscriptions
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT auth.uid()));

-- tenant_memberships (3 policies)
DROP POLICY IF EXISTS memberships_member_read  ON public.tenant_memberships;
CREATE POLICY memberships_member_read ON public.tenant_memberships
  FOR SELECT TO authenticated
  USING (member_id = (SELECT auth.uid()) AND revoked_at IS NULL);

DROP POLICY IF EXISTS memberships_owner_read   ON public.tenant_memberships;
CREATE POLICY memberships_owner_read ON public.tenant_memberships
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS memberships_owner_write  ON public.tenant_memberships;
CREATE POLICY memberships_owner_write ON public.tenant_memberships
  FOR ALL TO authenticated
  USING (tenant_id = (SELECT auth.uid()));

-- tenant_invitations
DROP POLICY IF EXISTS invitations_owner_read ON public.tenant_invitations;
CREATE POLICY invitations_owner_read ON public.tenant_invitations
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT auth.uid()) OR invited_by = (SELECT auth.uid()));

-- referral_credits (2 policies)
DROP POLICY IF EXISTS referral_credits_self_read ON public.referral_credits;
CREATE POLICY referral_credits_self_read ON public.referral_credits
  FOR SELECT TO authenticated
  USING (
    referrer_tenant_id = (SELECT auth.uid())
    OR referred_tenant_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS referral_credits_admin_all ON public.referral_credits;
CREATE POLICY referral_credits_admin_all ON public.referral_credits
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE id = (SELECT auth.uid()))
  );

-- referral_redemptions (2 policies)
DROP POLICY IF EXISTS referral_redemptions_self_read ON public.referral_redemptions;
CREATE POLICY referral_redemptions_self_read ON public.referral_redemptions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.referral_credits c
      WHERE c.id = referral_redemptions.credit_id
        AND c.referrer_tenant_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS referral_redemptions_admin_all ON public.referral_redemptions;
CREATE POLICY referral_redemptions_admin_all ON public.referral_redemptions
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE id = (SELECT auth.uid()))
  );

-- seniat_reminder_subscriptions
DROP POLICY IF EXISTS seniat_reminders_owner_all ON public.seniat_reminder_subscriptions;
CREATE POLICY seniat_reminders_owner_all ON public.seniat_reminder_subscriptions
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. Reescribir tenant_owner en todos los schemas tenant
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  rec        record;
  v_table    text;
BEGIN
  FOR rec IN SELECT id, schema_name FROM public.tenants LOOP
    -- Recoger todas las tablas con policy tenant_owner que aún use auth.uid()
    -- sin SELECT wrap, y reescribir.
    FOR v_table IN
      SELECT pp.tablename
        FROM pg_policies pp
       WHERE pp.schemaname = rec.schema_name
         AND pp.policyname = 'tenant_owner'
         AND pp.qual ~ 'auth\.uid\(\)'
         AND NOT (pp.qual ~* '\( ?SELECT auth\.uid\(')
    LOOP
      EXECUTE format(
        'DROP POLICY IF EXISTS tenant_owner ON %I.%I',
        rec.schema_name, v_table
      );
      EXECUTE format(
        'CREATE POLICY tenant_owner ON %I.%I '
        'FOR ALL TO authenticated '
        'USING ((SELECT auth.uid()) = %L::uuid)',
        rec.schema_name, v_table, rec.id
      );
    END LOOP;
  END LOOP;
END$$;

-- ---------------------------------------------------------------------------
-- 3. Índices sobre FKs sin cobertura
-- ---------------------------------------------------------------------------
-- public (6)
CREATE INDEX IF NOT EXISTS plans_product_id_idx
  ON public.plans (product_id);
CREATE INDEX IF NOT EXISTS referral_credits_source_payment_request_id_idx
  ON public.referral_credits (source_payment_request_id);
CREATE INDEX IF NOT EXISTS referral_redemptions_credit_id_idx
  ON public.referral_redemptions (credit_id);
CREATE INDEX IF NOT EXISTS tenant_invitations_invited_by_idx
  ON public.tenant_invitations (invited_by);
CREATE INDEX IF NOT EXISTS tenant_memberships_invited_by_idx
  ON public.tenant_memberships (invited_by);
CREATE INDEX IF NOT EXISTS tenant_subscriptions_plan_id_idx
  ON public.tenant_subscriptions (plan_id);

-- Tenants — loop genérico sobre los 4 schemas con un mapa fijo.
DO $$
DECLARE
  rec  record;
  ix   text;
BEGIN
  FOR rec IN SELECT id, schema_name FROM public.tenants LOOP
    -- Mapa de (tabla, col) → ix_name.
    -- El loop crea índice sólo si la tabla y la columna existen (defensivo
    -- contra schemas con set distinto de tablas).
    FOR ix IN
      SELECT format('CREATE INDEX IF NOT EXISTS %I ON %I.%I (%I)',
                    t.idx_name, rec.schema_name, t.tbl, t.col)
        FROM (VALUES
          -- accounting
          ('accounting_accounts',              'chart_id',         'accounting_accounts_chart_id_idx'),
          ('accounting_integration_log',       'entry_id',         'accounting_integration_log_entry_id_idx'),
          ('accounting_integration_rules',     'credit_account_id','accounting_integration_rules_credit_acct_idx'),
          ('accounting_integration_rules',     'debit_account_id', 'accounting_integration_rules_debit_acct_idx'),
          -- documents
          ('document_folders',                 'company_id',       'document_folders_company_id_idx'),
          ('document_folders',                 'parent_id',        'document_folders_parent_id_idx'),
          ('documents',                        'company_id',       'documents_company_id_idx'),
          ('documents',                        'folder_id',        'documents_folder_id_idx'),
          -- inventory
          ('inventario_departamentos',         'empresa_id',       'inv_departamentos_empresa_id_idx'),
          ('inventario_facturas_compra',       'proveedor_id',     'inv_facturas_proveedor_id_idx'),
          ('inventario_facturas_compra_items', 'factura_compra_id','inv_factura_items_factura_id_idx'),
          ('inventario_facturas_compra_items', 'producto_id',      'inv_factura_items_producto_id_idx'),
          ('inventario_movimientos',           'empresa_id',       'inv_movimientos_empresa_id_idx'),
          ('inventario_movimientos',           'producto_id',      'inv_movimientos_producto_id_idx'),
          ('inventario_movimientos_drafts',    'producto_id',      'inv_movs_drafts_producto_id_idx'),
          ('inventario_productos',             'departamento_id',  'inv_productos_departamento_id_idx'),
          ('inventario_productos',             'empresa_id',       'inv_productos_empresa_id_idx'),
          ('inventario_proveedores',           'empresa_id',       'inv_proveedores_empresa_id_idx'),
          -- payroll
          ('payroll_receipts',                 'company_id',       'payroll_receipts_company_id_idx'),
          ('payroll_receipts',                 'run_id',           'payroll_receipts_run_id_idx'),
          ('payroll_runs',                     'company_id',       'payroll_runs_company_id_idx'),
          -- ventas
          ('ventas_facturas',                  'cliente_id',       'ventas_facturas_cliente_id_idx'),
          ('ventas_facturas_items',            'factura_id',       'ventas_facturas_items_factura_id_idx'),
          ('ventas_facturas_items',            'producto_id',      'ventas_facturas_items_producto_id_idx')
        ) AS t(tbl, col, idx_name)
        WHERE EXISTS (
          SELECT 1
            FROM information_schema.columns ic
           WHERE ic.table_schema = rec.schema_name
             AND ic.table_name   = t.tbl
             AND ic.column_name  = t.col
        )
    LOOP
      EXECUTE ix;
    END LOOP;
  END LOOP;
END$$;
