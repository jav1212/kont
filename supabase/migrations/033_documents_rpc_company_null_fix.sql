-- =============================================================================
-- 033_documents_rpc_company_null_fix.sql
-- Carpetas y documentos sin company_id se consideran "globales" y deben
-- aparecer en cualquier contexto de empresa (no solo cuando company_id es null).
-- Esto permite que las plantillas de carpetas replicadas por contadores
-- sean visibles independientemente de qué empresa esté activa en el destino.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.tenant_documents_folders_get(
    p_user_id   uuid,
    p_parent_id text    DEFAULT NULL,
    p_company_id text   DEFAULT NULL
)
RETURNS TABLE(
    id          text,
    parent_id   text,
    name        text,
    company_id  text,
    created_by  uuid,
    created_at  timestamptz,
    updated_at  timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_schema text;
BEGIN
    v_schema := 'tenant_' || replace(p_user_id::text, '-', '');
    RETURN QUERY EXECUTE format(
        'SELECT id, parent_id, name, company_id, created_by, created_at, updated_at
         FROM %I.document_folders
         WHERE ($1 IS NULL AND parent_id IS NULL OR parent_id = $1)
           AND ($2 IS NULL OR company_id IS NULL OR company_id = $2)
         ORDER BY name',
        v_schema
    ) USING p_parent_id, p_company_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tenant_documents_get(
    p_user_id    uuid,
    p_folder_id  text  DEFAULT NULL,
    p_company_id text  DEFAULT NULL
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
DECLARE v_schema text;
BEGIN
    v_schema := 'tenant_' || replace(p_user_id::text, '-', '');
    RETURN QUERY EXECUTE format(
        'SELECT id, folder_id, company_id, name, storage_path, mime_type, size_bytes,
                uploaded_by, created_at, updated_at
         FROM %I.documents
         WHERE ($1 IS NULL AND folder_id IS NULL OR folder_id = $1)
           AND ($2 IS NULL OR company_id IS NULL OR company_id = $2)
         ORDER BY created_at DESC',
        v_schema
    ) USING p_folder_id, p_company_id;
END;
$$;
