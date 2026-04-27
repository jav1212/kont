-- =============================================================================
-- 072_accounting_entry_reversal_by_source.sql
--
-- Adds an RPC to delete journal entries by their (source, source_ref) pair.
-- Used by the inventory purchase unconfirm flow to revert the accounting
-- integration that ran on confirmation, keeping inventory and accounting
-- consistent across the confirm/unconfirm cycle.
--
--  - Deletes posted entries as well (intentional: the caller is the integration
--    engine, not a human posting manually). Lines cascade-delete via the schema
--    FK, but we delete them explicitly to be defensive across older tenants.
--  - Returns the list of deleted entry ids so the caller can log each reversal.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.tenant_accounting_entries_delete_by_source(
    p_user_id    uuid,
    p_company_id text,
    p_source     text,
    p_source_ref text
)
RETURNS TABLE (entry_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schema text;
BEGIN
    v_schema := 'tenant_' || replace(p_user_id::text, '-', '');

    RETURN QUERY EXECUTE format($q$
        WITH targets AS (
            SELECT id FROM %I.accounting_entries
            WHERE company_id = %L
              AND source     = %L
              AND source_ref = %L
        ),
        del_lines AS (
            DELETE FROM %I.accounting_entry_lines
            WHERE entry_id IN (SELECT id FROM targets)
            RETURNING entry_id
        ),
        del_entries AS (
            DELETE FROM %I.accounting_entries
            WHERE id IN (SELECT id FROM targets)
            RETURNING id
        )
        SELECT id FROM del_entries
    $q$,
        v_schema, p_company_id, p_source, p_source_ref,
        v_schema,
        v_schema
    );
END;
$$;
