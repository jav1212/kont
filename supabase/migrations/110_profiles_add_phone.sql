-- =============================================================================
-- 110_profiles_add_phone.sql
-- Agrega columna phone a profiles y actualiza handle_new_user() para leer
-- name y phone desde raw_user_meta_data al crear el usuario.
-- =============================================================================

ALTER TABLE public.profiles ADD COLUMN phone text;

-- Reescribir trigger para poblar name y phone desde la metadata de sign-up.
-- Resto del cuerpo identico a 062_auto_accept_invitations_on_signup.sql.
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
    INSERT INTO public.profiles (id, email, name, phone, created_at, updated_at)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'name',
        NEW.raw_user_meta_data->>'phone',
        now(),
        now()
    )
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

    -- 3. Si no habia invitaciones, es un owner genuino: aprovisionar tenant
    SELECT count(*) INTO v_invitations_count
    FROM public.tenant_memberships
    WHERE member_id = NEW.id AND revoked_at IS NULL;

    IF v_invitations_count = 0 THEN
        PERFORM public.provision_tenant_schema(NEW.id);
    END IF;

    RETURN NEW;
END;
$$;
