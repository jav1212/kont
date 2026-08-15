-- Organization branding belongs to the organization itself. Keeping this
-- nullable makes the change additive for existing organizations and clients.
alter table public.organizations
    add column if not exists avatar_url text;
