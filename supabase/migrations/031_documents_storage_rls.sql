-- =============================================================================
-- 031_documents_storage_rls.sql
-- Políticas RLS del bucket 'tenant-documents' en Supabase Storage
--
-- =============================================================================

-- Crear bucket si no existe
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('tenant-documents', 'tenant-documents', false, 52428800, null)
ON CONFLICT (id) DO NOTHING;

-- Upload: owner del tenant o miembro activo con rol admin/contable
CREATE POLICY "documents_upload" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'tenant-documents'
        AND (
            (storage.foldername(name))[1] = auth.uid()::text
            OR EXISTS (
                SELECT 1 FROM public.tenant_memberships
                WHERE tenant_id = ((storage.foldername(name))[1])::uuid
                  AND member_id = auth.uid()
                  AND role IN ('admin', 'contable')
                  AND accepted_at IS NOT NULL
                  AND revoked_at IS NULL
            )
        )
    );

-- Download: owner del tenant o cualquier miembro activo
CREATE POLICY "documents_download" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'tenant-documents'
        AND (
            (storage.foldername(name))[1] = auth.uid()::text
            OR EXISTS (
                SELECT 1 FROM public.tenant_memberships
                WHERE tenant_id = ((storage.foldername(name))[1])::uuid
                  AND member_id = auth.uid()
                  AND accepted_at IS NOT NULL
                  AND revoked_at IS NULL
            )
        )
    );

-- Delete: owner del tenant o admin
CREATE POLICY "documents_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'tenant-documents'
        AND (
            (storage.foldername(name))[1] = auth.uid()::text
            OR EXISTS (
                SELECT 1 FROM public.tenant_memberships
                WHERE tenant_id = ((storage.foldername(name))[1])::uuid
                  AND member_id = auth.uid()
                  AND role IN ('owner', 'admin')
                  AND accepted_at IS NOT NULL
                  AND revoked_at IS NULL
            )
        )
    );
