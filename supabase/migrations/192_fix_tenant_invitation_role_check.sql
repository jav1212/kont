-- Keep invitation roles aligned with the roles supported by the memberships flow.
-- The original constraint only allowed admin and contable, while the current
-- application also supports contador, vendedor and cajero.

ALTER TABLE public.tenant_invitations
    DROP CONSTRAINT IF EXISTS tenant_invitations_role_check;

ALTER TABLE public.tenant_invitations
    ADD CONSTRAINT tenant_invitations_role_check
    CHECK (role IN ('admin', 'contador', 'contable', 'vendedor', 'cajero'));
