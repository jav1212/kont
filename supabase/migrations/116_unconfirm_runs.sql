-- =============================================================================
-- 116_unconfirm_runs.sql
-- Permite DESCONFIRMAR un run confirmado (devolverlo a estado 'draft') para los
-- cuatro módulos de nómina: nómina quincenal, cesta ticket, bono socio-económico
-- y bonificaciones.
--
-- Hasta ahora un run 'confirmed' era inmutable (tenant_*_run_save lanza excepción
-- si ya existe uno confirmado para el período). Estas RPCs revierten el estado a
-- 'draft' para que el run pueda editarse y re-confirmarse.
--
-- Cada función:
--   * Resuelve el esquema del tenant con public.tenant_get_schema(p_user_id).
--   * Verifica que el run exista y esté 'confirmed'; si no, RAISE EXCEPTION.
--   * UPDATE ... SET status = 'draft'.
--   * Devuelve jsonb { id, company_id } — la reversión contable de nómina lo usa.
--
-- La integración contable (asientos con source='payroll') se revierte por separado,
-- de forma no bloqueante, desde el route handler /api/payroll/runs/unconfirm vía la
-- RPC existente tenant_accounting_entries_delete_by_source. Cesta ticket, bono y
-- bonificaciones no generan asientos, así que su desconfirmación es sólo el cambio
-- de estado.
--
-- Lockdown P0 (ver 098_security_p0_lockdown.sql): se revoca EXECUTE de
-- anon/authenticated/public; sólo service_role (backend) puede invocarlas.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Nómina quincenal
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_payroll_run_unconfirm(
    p_user_id uuid,
    p_run_id  text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema     text;
    v_status     text;
    v_company_id text;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);

    EXECUTE format(
        'SELECT status, company_id FROM %I.payroll_runs WHERE id = %L',
        v_schema, p_run_id
    ) INTO v_status, v_company_id;

    IF v_company_id IS NULL THEN
        RAISE EXCEPTION 'Run de nómina no encontrado.';
    END IF;
    IF v_status <> 'confirmed' THEN
        RAISE EXCEPTION 'Sólo se pueden desconfirmar runs confirmados.';
    END IF;

    EXECUTE format(
        'UPDATE %I.payroll_runs SET status = ''draft'' WHERE id = %L',
        v_schema, p_run_id
    );

    RETURN jsonb_build_object('id', p_run_id, 'company_id', v_company_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- Cesta ticket
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_cesta_ticket_run_unconfirm(
    p_user_id uuid,
    p_run_id  text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema     text;
    v_status     text;
    v_company_id text;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);

    EXECUTE format(
        'SELECT status, company_id FROM %I.cesta_ticket_runs WHERE id = %L',
        v_schema, p_run_id
    ) INTO v_status, v_company_id;

    IF v_company_id IS NULL THEN
        RAISE EXCEPTION 'Run de cesta ticket no encontrado.';
    END IF;
    IF v_status <> 'confirmed' THEN
        RAISE EXCEPTION 'Sólo se pueden desconfirmar runs confirmados.';
    END IF;

    EXECUTE format(
        'UPDATE %I.cesta_ticket_runs SET status = ''draft'' WHERE id = %L',
        v_schema, p_run_id
    );

    RETURN jsonb_build_object('id', p_run_id, 'company_id', v_company_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- Bono socio-económico (bono de guerra)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_bono_guerra_run_unconfirm(
    p_user_id uuid,
    p_run_id  text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema     text;
    v_status     text;
    v_company_id text;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);

    EXECUTE format(
        'SELECT status, company_id FROM %I.bono_guerra_runs WHERE id = %L',
        v_schema, p_run_id
    ) INTO v_status, v_company_id;

    IF v_company_id IS NULL THEN
        RAISE EXCEPTION 'Run de bono no encontrado.';
    END IF;
    IF v_status <> 'confirmed' THEN
        RAISE EXCEPTION 'Sólo se pueden desconfirmar runs confirmados.';
    END IF;

    EXECUTE format(
        'UPDATE %I.bono_guerra_runs SET status = ''draft'' WHERE id = %L',
        v_schema, p_run_id
    );

    RETURN jsonb_build_object('id', p_run_id, 'company_id', v_company_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- Bonificaciones
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_bonificaciones_run_unconfirm(
    p_user_id uuid,
    p_run_id  text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema     text;
    v_status     text;
    v_company_id text;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);

    EXECUTE format(
        'SELECT status, company_id FROM %I.bonificaciones_runs WHERE id = %L',
        v_schema, p_run_id
    ) INTO v_status, v_company_id;

    IF v_company_id IS NULL THEN
        RAISE EXCEPTION 'Run de bonificaciones no encontrado.';
    END IF;
    IF v_status <> 'confirmed' THEN
        RAISE EXCEPTION 'Sólo se pueden desconfirmar runs confirmados.';
    END IF;

    EXECUTE format(
        'UPDATE %I.bonificaciones_runs SET status = ''draft'' WHERE id = %L',
        v_schema, p_run_id
    );

    RETURN jsonb_build_object('id', p_run_id, 'company_id', v_company_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- Lockdown P0: sólo service_role puede ejecutar estas RPCs.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.tenant_payroll_run_unconfirm(uuid, text)        FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tenant_cesta_ticket_run_unconfirm(uuid, text)   FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tenant_bono_guerra_run_unconfirm(uuid, text)    FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tenant_bonificaciones_run_unconfirm(uuid, text) FROM anon, authenticated, public;

GRANT EXECUTE ON FUNCTION public.tenant_payroll_run_unconfirm(uuid, text)        TO service_role;
GRANT EXECUTE ON FUNCTION public.tenant_cesta_ticket_run_unconfirm(uuid, text)   TO service_role;
GRANT EXECUTE ON FUNCTION public.tenant_bono_guerra_run_unconfirm(uuid, text)    TO service_role;
GRANT EXECUTE ON FUNCTION public.tenant_bonificaciones_run_unconfirm(uuid, text) TO service_role;
