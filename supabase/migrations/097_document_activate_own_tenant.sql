-- =============================================================================
-- 097_document_activate_own_tenant.sql
-- (1) Anade documentacion canonica (COMMENT) a public.activate_own_tenant().
-- (2) Alinea grants con la intencion original de 061 (REVOKE de PUBLIC y anon).
-- La funcion vive en migracion 061 (inmutable). Esta migracion no toca el
-- cuerpo de la funcion -- solo escribe metadata en pg_proc.description y
-- ajusta privilegios.
-- =============================================================================

COMMENT ON FUNCTION public.activate_own_tenant() IS
$comment$
RPC de aprovisionamiento bajo demanda para usuarios invitados.

CONTEXTO
  En el flujo normal handle_new_user() (trigger en auth.users) llama a
  provision_tenant_schema(NEW.id) y crea el tenant del nuevo usuario. Pero si
  el email tiene una invitacion pendiente vigente en public.tenant_invitations,
  el trigger SALTA el aprovisionamiento: el invitado queda con profile +
  memberships, sin schema propio ni fila en public.tenants. Esta funcion es la
  via oficial para que ese invitado, una vez autenticado, decida convertirse
  tambien en owner de su propio tenant.

CONTRATO
  - Sin parametros. Toma el usuario actual de auth.uid().
  - Idempotente: si ya existe public.tenants WHERE id = auth.uid(), no
    re-aprovisiona; solo retorna los datos.
  - Retorna jsonb { tenant_id, schema_name, status }.
  - Lanza EXCEPTION 'not_authenticated' (SQLSTATE 28000) si auth.uid() es NULL.

COMO INVOCARLA
  Debe correrse bajo la sesion del usuario (JWT con claim sub), NO con
  service-role key. Desde el frontend con el cliente Supabase del navegador:
    const { data, error } = await supabase.rpc('activate_own_tenant');
  Llamarla desde el backend con SUPABASE_SERVICE_ROLE_KEY hace que auth.uid()
  sea NULL y la funcion rechace con 28000. El backend de Kont usa service-role
  por diseno (ver CLAUDE.md "Route protection model"), por eso el callsite
  natural es un Client Component, no una API route.

ESTADO ACTUAL (2026-05-06)
  Dormante: no invocada desde ningun archivo TypeScript del repo. Mantenida
  para cuando se implemente el flujo "invited admin upgrades to their own
  tenant". No eliminar sin descartar permanentemente esa feature.

DEFINICION DE LA FUNCION
  Migracion 061_handle_invited_users_and_activate.sql. La 061 es inmutable;
  cualquier cambio al cuerpo debe ir en una nueva migracion.
$comment$;

-- ---------------------------------------------------------------------------
-- Hardening de grants: revocar EXECUTE de PUBLIC y anon.
-- 061 hizo GRANT EXECUTE ... TO authenticated pero Postgres anade PUBLIC por
-- default al CREATE FUNCTION; nunca se hizo REVOKE. Esto alinea el estado
-- real con la intencion de 061. authenticated y service_role mantienen
-- EXECUTE (concedido en 061 y por Supabase respectivamente).
--
-- Efecto observable: una llamada anonima a supabase.rpc('activate_own_tenant')
-- ahora falla con SQLSTATE 42501 ("permission denied for function ...") en
-- lugar de SQLSTATE 28000 ("not_authenticated") del RAISE interno. La funcion
-- esta dormante (cero callsites en TS), por lo que el cambio de codigo de
-- error no afecta a ningun cliente.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.activate_own_tenant() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.activate_own_tenant() FROM anon;
