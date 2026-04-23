-- =============================================================================
-- 062_auto_accept_invitations_on_signup.sql
-- Auto-acepta invitaciones pendientes al crear un nuevo user.
--
-- Problema que resuelve: si un invitado ignora el link con ?token=... del correo
-- de invitación y se registra directamente vía /sign-up, se creaba el usuario
-- en auth.users pero ninguna fila en tenant_memberships. El middleware lo
-- trataba como sesión huérfana y lo expulsaba.
--
-- Con este cambio, al crear el user:
--   1. Se crea el perfil (como antes).
--   2. Se crean memberships para TODAS las invitaciones pendientes vigentes
--      que coincidan con su email, y las invitaciones se marcan como aceptadas.
--   3. Si tras procesar invitaciones NO hay ninguna, se considera "owner" y
--      se aprovisiona su propio tenant (como antes).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invitations_count integer;
BEGIN
    -- 1. Perfil (idempotente)
    INSERT INTO public.profiles (id, email, created_at, updated_at)
    VALUES (NEW.id, NEW.email, now(), now())
    ON CONFLICT (id) DO NOTHING;

    -- 2. Auto-aceptar invitaciones pendientes para este email
    WITH pending AS (
        SELECT id, tenant_id, role, invited_by
        FROM public.tenant_invitations
        WHERE lower(email) = lower(NEW.email)
          AND accepted_at IS NULL
          AND expires_at > now()
    ),
    accepted AS (
        UPDATE public.tenant_invitations i
        SET accepted_at = now()
        FROM pending p
        WHERE i.id = p.id
        RETURNING p.tenant_id, p.role, p.invited_by
    )
    INSERT INTO public.tenant_memberships (tenant_id, member_id, role, invited_by, accepted_at)
    SELECT a.tenant_id, NEW.id, a.role, a.invited_by, now()
    FROM accepted a
    ON CONFLICT DO NOTHING;

    -- 3. Si no había invitaciones, es un owner genuino: aprovisionar tenant
    SELECT count(*) INTO v_invitations_count
    FROM public.tenant_memberships
    WHERE member_id = NEW.id AND revoked_at IS NULL;

    IF v_invitations_count = 0 THEN
        PERFORM public.provision_tenant_schema(NEW.id);
    END IF;

    RETURN NEW;
END;
$$;
