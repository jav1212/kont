-- =============================================================================
-- 109_storage_policies_restore_select_for_returning.sql
--
-- Causa raíz definitiva del bug de uploads (avatars/logos):
--
-- La mig 099_security_p1_hardening DROP'eó las policies de SELECT
-- (`avatars_public_read`, `logos_public_read`) con el argumento de que el
-- bucket es público y las URLs públicas siguen funcionando. Eso es cierto
-- para LEER vía `/object/public/...`, pero el storage-api de Supabase
-- ejecuta `INSERT INTO storage.objects (...) RETURNING *` al subir un
-- archivo. PostgreSQL requiere policy de SELECT (USING) para que el
-- `RETURNING` sea visible al rol llamador. Sin esa policy, todo INSERT
-- falla con:
--
--   ERROR 42501: new row violates row-level security policy
--                for table "objects"
--
-- (mensaje engañoso: el problema no es la INSERT policy sino el SELECT
-- que valida la cláusula RETURNING).
--
-- La mig 108 hizo el camino correcto recreando las policies de INSERT/UPDATE
-- con `TO public` (default), pero seguía faltando la de SELECT.
--
-- Esta migración:
--  1. Recrea las 4 policies de INSERT/UPDATE con el patrón canónico
--     Supabase (`auth.uid()::text = (storage.foldername(name))[1]`,
--     `TO public`) — idempotente.
--  2. Re-CREA las 2 policies de SELECT (`avatars_public_read`,
--     `logos_public_read`) que la mig 099 había eliminado.
--
-- Riesgo: las SELECT policies hacen `USING (bucket_id = 'avatars'|'logos')`
-- sin chequear ownership — cualquier usuario autenticado (o anónimo via
-- la URL pública del bucket) puede listar metadata de objetos. Esto
-- coincide con el modelo histórico (los buckets son públicos por diseño)
-- y es necesario para que el storage-api funcione.
-- =============================================================================

-- ── avatars ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS avatars_public_read  ON storage.objects;
DROP POLICY IF EXISTS avatars_user_upload  ON storage.objects;
DROP POLICY IF EXISTS avatars_user_update  ON storage.objects;

CREATE POLICY avatars_public_read ON storage.objects
  FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY avatars_user_upload ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY avatars_user_update ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ── logos ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS logos_public_read  ON storage.objects;
DROP POLICY IF EXISTS logos_user_upload  ON storage.objects;
DROP POLICY IF EXISTS logos_user_update  ON storage.objects;

CREATE POLICY logos_public_read ON storage.objects
  FOR SELECT
  USING (bucket_id = 'logos');

CREATE POLICY logos_user_upload ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'logos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY logos_user_update ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'logos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
