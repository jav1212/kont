-- =============================================================================
-- 032_documents_rpc_functions.sql
-- Funciones RPC para el módulo Documents (mismo patrón que inventory)
-- Cada función resuelve el schema del tenant a partir de p_user_id
-- =============================================================================

-- ── document_folders ──────────────────────────────────────────────────────────

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
           AND ($2 IS NULL OR company_id = $2)
         ORDER BY name',
        v_schema
    ) USING p_parent_id, p_company_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tenant_documents_folder_insert(
    p_user_id    uuid,
    p_name       text,
    p_parent_id  text  DEFAULT NULL,
    p_company_id text  DEFAULT NULL,
    p_created_by uuid  DEFAULT NULL
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
        'INSERT INTO %I.document_folders (parent_id, name, company_id, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id, parent_id, name, company_id, created_by, created_at, updated_at',
        v_schema
    ) USING p_parent_id, p_name, p_company_id, COALESCE(p_created_by, p_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.tenant_documents_folder_delete(
    p_user_id uuid,
    p_id      text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_schema text;
BEGIN
    v_schema := 'tenant_' || replace(p_user_id::text, '-', '');
    EXECUTE format('DELETE FROM %I.document_folders WHERE id = $1', v_schema) USING p_id;
END;
$$;

-- ── documents ─────────────────────────────────────────────────────────────────

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
           AND ($2 IS NULL OR company_id = $2)
         ORDER BY created_at DESC',
        v_schema
    ) USING p_folder_id, p_company_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tenant_documents_get_by_id(
    p_user_id uuid,
    p_id      text
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
         WHERE id = $1
         LIMIT 1',
        v_schema
    ) USING p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tenant_documents_insert(
    p_user_id     uuid,
    p_name        text,
    p_storage_path text,
    p_uploaded_by uuid,
    p_folder_id   text    DEFAULT NULL,
    p_company_id  text    DEFAULT NULL,
    p_mime_type   text    DEFAULT NULL,
    p_size_bytes  bigint  DEFAULT NULL
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
        'INSERT INTO %I.documents (folder_id, company_id, name, storage_path, mime_type, size_bytes, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, folder_id, company_id, name, storage_path, mime_type, size_bytes,
                   uploaded_by, created_at, updated_at',
        v_schema
    ) USING p_folder_id, p_company_id, p_name, p_storage_path, p_mime_type, p_size_bytes, p_uploaded_by;
END;
$$;

CREATE OR REPLACE FUNCTION public.tenant_documents_delete(
    p_user_id uuid,
    p_id      text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_schema text;
BEGIN
    v_schema := 'tenant_' || replace(p_user_id::text, '-', '');
    EXECUTE format('DELETE FROM %I.documents WHERE id = $1', v_schema) USING p_id;
END;
$$;
