-- =============================================================================
-- 099_security_p1_hardening.sql
-- Endurecimiento adicional de seguridad (Fase 1 del plan).
--
-- Operaciones (todas no destructivas):
--   1. Buckets `avatars` y `logos`: quitar policy de SELECT amplia
--      (los public buckets no la necesitan para acceso por URL) y
--      restringir INSERT/UPDATE al rol `authenticated` en vez de `public`.
--   2. Fijar `search_path` en `generate_referral_code`,
--      `set_referral_code_on_insert`, `_inv_drafts_install`.
--   3. REVOKE EXECUTE en triggers de auth (`handle_new_user`,
--      `init_tenant_metrics`, `on_auth_user_created`) — son funciones
--      trigger, no deben ser RPC-callables.
--   4. Crear policy `tenant_owner` en las 8 tablas `inventario_*` que
--      tienen RLS habilitado pero sin policies (drift histórico). Filas
--      existentes intactas.
--
-- Pendiente fuera-de-SQL:
--   * Toggle "Prevent use of leaked passwords" en Dashboard →
--     Authentication → Policies (cierra el lint `auth_leaked_password_protection`).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Storage policies para avatars y logos
-- ---------------------------------------------------------------------------

-- 1a. avatars
DROP POLICY IF EXISTS avatars_public_read  ON storage.objects;
DROP POLICY IF EXISTS avatars_user_upload  ON storage.objects;
DROP POLICY IF EXISTS avatars_user_update  ON storage.objects;

CREATE POLICY avatars_user_upload ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND ((SELECT auth.uid())::text = (storage.foldername(name))[1])
  );

CREATE POLICY avatars_user_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND ((SELECT auth.uid())::text = (storage.foldername(name))[1])
  );

-- Sin policy de SELECT: el bucket es público (storage.buckets.public=true),
-- las URLs públicas siguen funcionando para descarga directa de objetos.
-- Quitar el SELECT amplio cierra el LIST anónimo.

-- 1b. logos
DROP POLICY IF EXISTS logos_public_read  ON storage.objects;
DROP POLICY IF EXISTS logos_user_upload  ON storage.objects;
DROP POLICY IF EXISTS logos_user_update  ON storage.objects;

CREATE POLICY logos_user_upload ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'logos'
    AND ((SELECT auth.uid())::text = (storage.foldername(name))[1])
  );

CREATE POLICY logos_user_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'logos'
    AND ((SELECT auth.uid())::text = (storage.foldername(name))[1])
  );

-- ---------------------------------------------------------------------------
-- 2. Fijar search_path en funciones flagged
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.generate_referral_code()           SET search_path = public, pg_temp;
ALTER FUNCTION public.set_referral_code_on_insert()      SET search_path = public, pg_temp;
ALTER FUNCTION public._inv_drafts_install(text, uuid)    SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 3. REVOKE EXECUTE en triggers de auth
-- ---------------------------------------------------------------------------
-- Estas funciones se invocan desde triggers (`auth.users`, `public.tenants`),
-- nunca desde el cliente vía PostgREST. Cerrar la superficie REST.
REVOKE EXECUTE ON FUNCTION public.handle_new_user()        FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.init_tenant_metrics()    FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.on_auth_user_created()   FROM anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- 4. Crear policy tenant_owner en las 8 tablas inventario sin policy
-- ---------------------------------------------------------------------------
-- Drift de las migs 013-021: algunas tablas se crearon con RLS habilitado
-- pero sin la policy tenant_owner que sí tienen sus pares en otros tenants.
-- Aplicar la misma policy para el dueño del schema. Idempotente.
DO $$
DECLARE
  rec       record;
  v_table   text;
  v_tables  text[] := ARRAY[
    'inventario_departamentos','inventario_cierres',
    'inventario_facturas_compra','inventario_facturas_compra_items',
    'inventario_movimientos','inventario_productos','inventario_proveedores'
  ];
BEGIN
  FOR rec IN SELECT id, schema_name FROM public.tenants LOOP
    FOREACH v_table IN ARRAY v_tables LOOP
      IF EXISTS (
        SELECT 1
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = rec.schema_name
           AND c.relname = v_table
           AND c.relrowsecurity = true
      ) AND NOT EXISTS (
        SELECT 1 FROM pg_policies pp
         WHERE pp.schemaname = rec.schema_name
           AND pp.tablename  = v_table
      ) THEN
        EXECUTE format(
          'CREATE POLICY tenant_owner ON %I.%I '
          'FOR ALL USING ((SELECT auth.uid()) = %L::uuid)',
          rec.schema_name, v_table, rec.id
        );
      END IF;
    END LOOP;
  END LOOP;
END$$;
