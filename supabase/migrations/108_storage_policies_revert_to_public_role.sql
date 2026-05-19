-- =============================================================================
-- 108_storage_policies_revert_to_public_role.sql
--
-- Fix: la migración 099 cambió las 4 storage policies (avatars/logos × INSERT/
-- UPDATE) de `TO public` (default) a `TO authenticated`. El storage-api de
-- Supabase rechazaba todos los uploads con
--   ERROR 42501: new row violates row-level security policy for table "objects"
-- aún para usuarios autenticados con JWT válido y folder == auth.uid().
--
-- Causa raíz: en runtime el storage-api inserta como rol del pool
-- (`supabase_storage_admin` / `authenticator`), NO como `authenticated`,
-- aunque el JWT tenga `role: authenticated`. La policy `TO authenticated`
-- no aplica → ninguna policy permisiva matchea → RLS rechaza.
--
-- Solución: recrear las 4 policies sin `TO authenticated` (= `TO public`,
-- el patrón canónico de Supabase Storage). La seguridad NO se debilita
-- porque la WITH CHECK / USING sigue exigiendo
--   `auth.uid()::text = (storage.foldername(name))[1]`
-- y para un cliente anónimo `auth.uid()` retorna NULL → comparación NULL →
-- la policy igualmente niega el INSERT.
-- =============================================================================

-- ── avatars ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS avatars_user_upload ON storage.objects;
CREATE POLICY avatars_user_upload ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS avatars_user_update ON storage.objects;
CREATE POLICY avatars_user_update ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ── logos ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS logos_user_upload ON storage.objects;
CREATE POLICY logos_user_upload ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'logos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS logos_user_update ON storage.objects;
CREATE POLICY logos_user_update ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'logos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
