-- =============================================================================
-- 061_handle_invited_users_and_activate.sql
-- Distingue entre "owner" (trae su propio tenant) y "invitado" (sin tenant).
--
-- Cambios:
--   1) `handle_new_user()` sólo aprovisiona tenant si el email NO tiene una
--      invitación pendiente. Un invitado queda con profile + memberships, sin
--      schema propio ni fila en `public.tenants`.
--   2) `activate_own_tenant()` es un RPC que un invitado puede llamar para
--      "activar su cuenta" y obtener su propio tenant bajo demanda.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_has_pending_invitation boolean;
BEGIN
    INSERT INTO public.profiles (id, email, created_at, updated_at)
    VALUES (NEW.id, NEW.email, now(), now())
    ON CONFLICT (id) DO NOTHING;

    -- Si hay invitación pendiente vigente para este email, el usuario es
    -- "invitado": no se aprovisiona tenant propio. El tenant se crea después
    -- si llama a `activate_own_tenant()`.
    SELECT EXISTS (
        SELECT 1 FROM public.tenant_invitations
        WHERE lower(email) = lower(NEW.email)
          AND accepted_at IS NULL
          AND expires_at > now()
    ) INTO v_has_pending_invitation;

    IF NOT v_has_pending_invitation THEN
        PERFORM public.provision_tenant_schema(NEW.id);
    END IF;

    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- activate_own_tenant()
-- Aprovisiona el tenant del usuario autenticado (bajo demanda).
-- Idempotente: si ya existe, no hace nada.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.activate_own_tenant()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_tenant  public.tenants%ROWTYPE;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
    END IF;

    SELECT * INTO v_tenant FROM public.tenants WHERE id = v_user_id;

    IF NOT FOUND THEN
        PERFORM public.provision_tenant_schema(v_user_id);
        SELECT * INTO v_tenant FROM public.tenants WHERE id = v_user_id;
    END IF;

    RETURN jsonb_build_object(
        'tenant_id',   v_tenant.id,
        'schema_name', v_tenant.schema_name,
        'status',      v_tenant.status
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.activate_own_tenant() TO authenticated;
