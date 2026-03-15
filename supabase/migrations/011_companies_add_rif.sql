-- =============================================================================
-- 011_companies_add_rif.sql
-- Agrega columna `rif` a la tabla companies de cada tenant existente
-- y actualiza las RPCs de save/update para incluirla.
-- =============================================================================

-- 1. Agregar la columna a todos los schemas de tenant ya provisionados
DO $$
DECLARE rec RECORD;
BEGIN
    FOR rec IN SELECT schema_name FROM public.tenants LOOP
        EXECUTE format(
            'ALTER TABLE %I.companies ADD COLUMN IF NOT EXISTS rif text',
            rec.schema_name
        );
    END LOOP;
END;
$$;

-- 2. Actualizar tenant_company_save para incluir rif
CREATE OR REPLACE FUNCTION public.tenant_company_save(
    p_user_id uuid, p_id text, p_owner_id text, p_name text, p_rif text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text; v_now timestamptz := now();
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    EXECUTE format(
        'INSERT INTO %I.companies (id, owner_id, name, rif, created_at, updated_at)
         VALUES (%L, %L, %L, %L, %L, %L)
         ON CONFLICT (id) DO UPDATE SET name = %L, rif = %L, updated_at = %L',
        v_schema, p_id, p_owner_id, p_name, p_rif, v_now, v_now,
        p_name, p_rif, v_now
    );
END;
$$;

-- 3. Actualizar tenant_company_update para incluir rif
CREATE OR REPLACE FUNCTION public.tenant_company_update(
    p_user_id uuid, p_id text, p_name text, p_rif text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text; v_result jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    EXECUTE format(
        'UPDATE %I.companies SET name = %L, rif = %L, updated_at = now()
         WHERE id = %L RETURNING row_to_json(companies)',
        v_schema, p_name, p_rif, p_id
    ) INTO v_result;
    RETURN v_result;
END;
$$;
