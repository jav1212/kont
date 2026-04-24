-- =============================================================================
-- 069_documents_move.sql
-- Add: tenant_documents_update_folder — moves a document to a different folder
--      (or to root when p_folder_id IS NULL).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.tenant_documents_update_folder(
    p_user_id   uuid,
    p_id        text,
    p_folder_id text DEFAULT NULL
)
RETURNS TABLE(
    id           text,
    folder_id    text,
    company_id   text,
    name         text,
    storage_path text,
    mime_type    text,
    size_bytes   bigint,
    uploaded_by  uuid,
    created_at   timestamptz,
    updated_at   timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schema        text;
    v_folder_exists boolean;
BEGIN
    v_schema := 'tenant_' || replace(p_user_id::text, '-', '');

    -- If a target folder was provided, ensure it exists in this tenant.
    IF p_folder_id IS NOT NULL THEN
        EXECUTE format(
            'SELECT EXISTS(SELECT 1 FROM %I.document_folders WHERE id = $1)',
            v_schema
        )
        INTO v_folder_exists
        USING p_folder_id;

        IF NOT v_folder_exists THEN
            RAISE EXCEPTION 'La carpeta destino no existe';
        END IF;
    END IF;

    RETURN QUERY EXECUTE format(
        'UPDATE %I.documents
         SET folder_id = $1, updated_at = now()
         WHERE id = $2
         RETURNING id, folder_id, company_id, name, storage_path, mime_type, size_bytes,
                   uploaded_by, created_at, updated_at',
        v_schema
    ) USING p_folder_id, p_id;
END;
$$;
