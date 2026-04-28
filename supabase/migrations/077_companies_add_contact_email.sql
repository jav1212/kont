-- =============================================================================
-- 077_companies_add_contact_email.sql
-- Agrega contact_email a la tabla companies de cada tenant. Sirve para que el
-- recordatorio del Calendario SENIAT pueda enviarse al cliente directamente
-- (la contadora figura como remitente vía Reply-To, no como destinatario).
--
-- Anterior: 076_payroll_drafts.sql
-- Siguiente: —
-- =============================================================================

-- 1. Agregar la columna a todos los schemas de tenant ya provisionados
DO $$
DECLARE rec RECORD;
BEGIN
    FOR rec IN SELECT schema_name FROM public.tenants LOOP
        EXECUTE format(
            'ALTER TABLE %I.companies ADD COLUMN IF NOT EXISTS contact_email text',
            rec.schema_name
        );
    END LOOP;
END;
$$;

-- 2. Refrescar tenant_company_save con el nuevo parámetro p_contact_email.
--    Mantiene el orden previo (rif, phone, address, logo_url, sector, taxpayer_type)
--    y añade contact_email al final para no romper llamadas posicionales.
CREATE OR REPLACE FUNCTION public.tenant_company_save(
    p_user_id        uuid,
    p_id             text,
    p_owner_id       text,
    p_name           text,
    p_rif            text DEFAULT NULL,
    p_phone          text DEFAULT NULL,
    p_address        text DEFAULT NULL,
    p_logo_url       text DEFAULT NULL,
    p_sector         text DEFAULT NULL,
    p_taxpayer_type  text DEFAULT 'ordinario',
    p_contact_email  text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text; v_now timestamptz := now();
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    EXECUTE format(
        'INSERT INTO %I.companies (id, owner_id, name, rif, phone, address, logo_url, sector, taxpayer_type, contact_email, created_at, updated_at)
         VALUES (%L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L)
         ON CONFLICT (id) DO UPDATE SET name = %L, rif = %L, phone = %L, address = %L, logo_url = %L, sector = %L, taxpayer_type = %L, contact_email = %L, updated_at = %L',
        v_schema,
        p_id, p_owner_id, p_name, p_rif, p_phone, p_address, p_logo_url, p_sector, COALESCE(p_taxpayer_type, 'ordinario'), p_contact_email, v_now, v_now,
        p_name, p_rif, p_phone, p_address, p_logo_url, p_sector, COALESCE(p_taxpayer_type, 'ordinario'), p_contact_email, v_now
    );
END;
$$;

-- 3. Refrescar tenant_company_update con p_contact_email.
--    Convención (heredada de 065): NULL en p_contact_email significa "sin cambios"
--    cuando se quiere preservar el valor — aquí sobreescribimos siempre porque
--    los campos de contacto se editan juntos y el llamador siempre envía un
--    snapshot completo (mismo patrón que phone/address).
CREATE OR REPLACE FUNCTION public.tenant_company_update(
    p_user_id          uuid,
    p_id               text,
    p_name             text,
    p_rif              text    DEFAULT NULL,
    p_phone            text    DEFAULT NULL,
    p_address          text    DEFAULT NULL,
    p_logo_url         text    DEFAULT NULL,
    p_show_logo_in_pdf boolean DEFAULT NULL,
    p_sector           text    DEFAULT NULL,
    p_taxpayer_type    text    DEFAULT NULL,
    p_contact_email    text    DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text; v_result jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    EXECUTE format(
        'UPDATE %I.companies
         SET name             = %L,
             rif              = %L,
             phone            = %L,
             address          = %L,
             logo_url         = %L,
             show_logo_in_pdf = COALESCE(%L, show_logo_in_pdf),
             sector           = COALESCE(%L, sector),
             taxpayer_type    = COALESCE(%L, taxpayer_type),
             contact_email    = %L,
             updated_at       = now()
         WHERE id = %L RETURNING row_to_json(companies)',
        v_schema, p_name, p_rif, p_phone, p_address, p_logo_url, p_show_logo_in_pdf, p_sector, p_taxpayer_type, p_contact_email, p_id
    ) INTO v_result;
    RETURN v_result;
END;
$$;
