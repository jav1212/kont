-- =============================================================================
-- 044_avatars_bucket.sql
-- Crea el bucket de avatars con políticas RLS para que cada usuario
-- pueda leer todos los avatars (son públicos) y solo subir/actualizar
-- los suyos (carpeta {userId}/).
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Lectura pública
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read" ON storage.objects
    FOR SELECT USING (bucket_id = 'avatars');

-- Subida solo al propio directorio
DROP POLICY IF EXISTS "avatars_user_upload" ON storage.objects;
CREATE POLICY "avatars_user_upload" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'avatars'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

-- Actualización solo del propio directorio
DROP POLICY IF EXISTS "avatars_user_update" ON storage.objects;
CREATE POLICY "avatars_user_update" ON storage.objects
    FOR UPDATE USING (
        bucket_id = 'avatars'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );
