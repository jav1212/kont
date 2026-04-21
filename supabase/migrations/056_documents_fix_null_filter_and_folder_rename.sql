-- =============================================================================
-- 056_documents_fix_null_filter_and_folder_rename.sql
-- Fix: tenant_documents_folders_get and tenant_documents_get were treating
--      p_parent_id/p_folder_id = NULL as "return unassigned only" instead of
--      "return all". This caused the dashboard KPIs to show wrong counts.
-- Add: tenant_documents_folder_update RPC to support folder rename.
-- =============================================================================

-- ── Fix tenant_documents_folders_get ──────────────────────────────────────────
-- NULL p_parent_id now means "all folders" (no parent filter).
-- Specific p_parent_id still filters to that parent only.

CREATE OR REPLACE FUNCTION public.tenant_documents_folders_get(
    p_user_id    uuid,
    p_parent_id  text  DEFAULT NULL,
    p_company_id text  DEFAULT NULL
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
         WHERE ($1 IS NULL OR parent_id = $1)
           AND ($2 IS NULL OR company_id = $2)
         ORDER BY name',
        v_schema
    ) USING p_parent_id, p_company_id;
END;
$$;

-- ── Fix tenant_documents_get ───────────────────────────────────────────────────
-- NULL p_folder_id now means "all documents" (no folder filter).
-- Specific p_folder_id still filters to that folder only.

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
         WHERE ($1 IS NULL OR folder_id = $1)
           AND ($2 IS NULL OR company_id = $2)
         ORDER BY created_at DESC',
        v_schema
    ) USING p_folder_id, p_company_id;
END;
$$;

-- ── Add tenant_documents_folder_update ────────────────────────────────────────
-- Renames a folder by id within the caller's tenant schema.

CREATE OR REPLACE FUNCTION public.tenant_documents_folder_update(
    p_user_id uuid,
    p_id      text,
    p_name    text
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
        'UPDATE %I.document_folders
         SET name = $1, updated_at = now()
         WHERE id = $2
         RETURNING id, parent_id, name, company_id, created_by, created_at, updated_at',
        v_schema
    ) USING p_name, p_id;
END;
$$;
