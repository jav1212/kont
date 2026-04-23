-- =============================================================================
-- 060_fix_new_user_trigger.sql
-- Restaura el aprovisionamiento de tenant al crear un usuario.
--
-- Contexto: una edición manual en producción dejó `handle_new_user()` limitada
-- a insertar en `public.profiles`, saltándose `provision_tenant_schema`. Como
-- consecuencia, los usuarios nuevos quedaban sin fila en `public.tenants` y
-- el middleware los redirigía a /sign-in tras autenticarse.
--
-- Esta migración reescribe `handle_new_user()` para que haga ambas cosas:
--   1. Insertar el perfil en public.profiles (idempotente).
--   2. Aprovisionar el schema y registro del tenant.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, created_at, updated_at)
    VALUES (NEW.id, NEW.email, now(), now())
    ON CONFLICT (id) DO NOTHING;

    PERFORM public.provision_tenant_schema(NEW.id);

    RETURN NEW;
END;
$$;
