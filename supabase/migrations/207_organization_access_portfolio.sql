-- Explicit organization-to-organization access delegation for native clients.
-- Additive only: existing tenant memberships and Web behavior remain unchanged.

insert into public.access_control_permissions(code, resource, action, description) values
    ('organization_delegations.read', 'organization_delegations', 'read', 'Ver accesos organizacionales delegados'),
    ('organization_delegations.manage', 'organization_delegations', 'manage', 'Gestionar accesos organizacionales delegados')
on conflict (code) do update set resource = excluded.resource, action = excluded.action, description = excluded.description;

insert into public.organization_role_permissions(role_id, permission_code)
select role.id, permission.code
from public.organization_roles role
cross join public.access_control_permissions permission
where role.code = 'owner' and permission.code in ('organization_delegations.read', 'organization_delegations.manage')
on conflict do nothing;

insert into public.organization_role_permissions(role_id, permission_code)
select role.id, permission.code
from public.organization_roles role
cross join public.access_control_permissions permission
where role.code = 'admin' and permission.code in ('organization_delegations.read', 'organization_delegations.manage')
on conflict do nothing;

insert into public.organization_role_permissions(role_id, permission_code)
select role.id, permission.code
from public.organization_roles role
cross join public.access_control_permissions permission
where role.code = 'accountant' and permission.code = 'organization_delegations.read'
on conflict do nothing;

create table if not exists public.organization_delegations (
    id uuid primary key default gen_random_uuid(),
    provider_organization_id uuid not null references public.organizations(id) on delete restrict,
    client_organization_id uuid not null references public.organizations(id) on delete restrict,
    status text not null default 'pending' check (status in ('pending', 'active', 'suspended', 'revoked', 'expired')),
    valid_from timestamptz not null,
    valid_until timestamptz,
    requested_by_user_id uuid not null references auth.users(id) on delete restrict,
    accepted_by_user_id uuid references auth.users(id) on delete restrict,
    accepted_at timestamptz,
    suspended_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (provider_organization_id <> client_organization_id),
    check (valid_until is null or valid_until > valid_from)
);

create unique index if not exists organization_delegations_live_pair_idx
    on public.organization_delegations(provider_organization_id, client_organization_id)
    where status in ('pending', 'active', 'suspended');
create index if not exists organization_delegations_client_idx
    on public.organization_delegations(client_organization_id, status);
create index if not exists organization_delegations_requested_by_idx
    on public.organization_delegations(requested_by_user_id);
create index if not exists organization_delegations_accepted_by_idx
    on public.organization_delegations(accepted_by_user_id) where accepted_by_user_id is not null;

create table if not exists public.organization_delegation_scopes (
    delegation_id uuid not null references public.organization_delegations(id) on delete cascade,
    scope text not null check (scope in ('accounting', 'payroll', 'inventory', 'tax', 'documents', 'administration')),
    primary key (delegation_id, scope)
);

create table if not exists public.organization_delegation_member_assignments (
    id uuid primary key default gen_random_uuid(),
    delegation_id uuid not null references public.organization_delegations(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete restrict,
    status text not null default 'active' check (status in ('active', 'revoked')),
    assigned_by_user_id uuid not null references auth.users(id) on delete restrict,
    assigned_at timestamptz not null default now(),
    revoked_at timestamptz,
    unique (delegation_id, user_id)
);

create index if not exists organization_delegation_assignments_user_idx
    on public.organization_delegation_member_assignments(user_id, status);
create index if not exists organization_delegation_assignments_assigned_by_idx
    on public.organization_delegation_member_assignments(assigned_by_user_id);

create table if not exists public.organization_delegation_audit (
    id uuid primary key default gen_random_uuid(),
    delegation_id uuid not null references public.organization_delegations(id) on delete restrict,
    actor_user_id uuid not null references auth.users(id) on delete restrict,
    action text not null check (action in ('request', 'accept', 'assign_member', 'suspend', 'revoke')),
    request_id uuid not null,
    occurred_at timestamptz not null,
    metadata jsonb not null default '{}'::jsonb
);
create index if not exists organization_delegation_audit_delegation_idx
    on public.organization_delegation_audit(delegation_id, occurred_at desc);
create index if not exists organization_delegation_audit_actor_idx
    on public.organization_delegation_audit(actor_user_id, occurred_at desc);

alter table public.organization_delegations enable row level security;
alter table public.organization_delegation_scopes enable row level security;
alter table public.organization_delegation_member_assignments enable row level security;
alter table public.organization_delegation_audit enable row level security;
revoke all on public.organization_delegations from anon, authenticated;
revoke all on public.organization_delegation_scopes from anon, authenticated;
revoke all on public.organization_delegation_member_assignments from anon, authenticated;
revoke all on public.organization_delegation_audit from anon, authenticated;

create or replace function public.organization_delegation_json(p_delegation_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
    select jsonb_build_object(
        'id', d.id,
        'provider_organization_id', d.provider_organization_id,
        'client_organization_id', d.client_organization_id,
        'status', d.status,
        'valid_from', d.valid_from,
        'valid_until', d.valid_until,
        'accepted_at', d.accepted_at,
        'suspended_at', d.suspended_at,
        'revoked_at', d.revoked_at,
        'scopes', coalesce((select jsonb_agg(s.scope order by s.scope) from public.organization_delegation_scopes s where s.delegation_id = d.id), '[]'::jsonb)
    ) from public.organization_delegations d where d.id = p_delegation_id;
$$;

create or replace function public.get_organization_delegation(p_delegation_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
    select public.organization_delegation_json(p_delegation_id);
$$;

create or replace function public.list_user_organization_delegations(p_user_id uuid)
returns setof jsonb language sql stable security definer set search_path = public as $$
    select public.organization_delegation_json(d.id) || jsonb_build_object(
        'client_organization_name', o.name,
        'assignment_status', a.status
    )
    from public.organization_delegation_member_assignments a
    join public.organization_delegations d on d.id = a.delegation_id
    join public.organizations o on o.id = d.client_organization_id
    where a.user_id = p_user_id;
$$;

create or replace function public.create_organization_delegation(
    p_provider_organization_id uuid,
    p_client_organization_id uuid,
    p_scopes text[],
    p_valid_from timestamptz,
    p_valid_until timestamptz,
    p_requested_by uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_scope text;
begin
    if p_provider_organization_id = p_client_organization_id or coalesce(array_length(p_scopes, 1), 0) = 0 then
        raise exception 'delegation_invalid';
    end if;
    if not exists (select 1 from public.organization_memberships where organization_id = p_provider_organization_id and user_id = p_requested_by and status = 'active') then
        raise exception 'delegation_provider_membership_required';
    end if;
    insert into public.organization_delegations(provider_organization_id, client_organization_id, valid_from, valid_until, requested_by_user_id)
    values (p_provider_organization_id, p_client_organization_id, p_valid_from, p_valid_until, p_requested_by)
    returning id into v_id;
    foreach v_scope in array p_scopes loop
        insert into public.organization_delegation_scopes(delegation_id, scope) values (v_id, v_scope);
    end loop;
    return public.organization_delegation_json(v_id);
end;
$$;

create or replace function public.accept_organization_delegation(
    p_delegation_id uuid,
    p_actor_user_id uuid,
    p_occurred_at timestamptz
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_client uuid;
begin
    select client_organization_id into v_client from public.organization_delegations where id = p_delegation_id and status = 'pending' for update;
    if v_client is null then raise exception 'delegation_transition_invalid'; end if;
    if not exists (select 1 from public.organization_memberships where organization_id = v_client and user_id = p_actor_user_id and status = 'active') then
        raise exception 'delegation_client_membership_required';
    end if;
    update public.organization_delegations set status = 'active', accepted_by_user_id = p_actor_user_id, accepted_at = p_occurred_at, updated_at = p_occurred_at where id = p_delegation_id;
    return public.organization_delegation_json(p_delegation_id);
end;
$$;

create or replace function public.assign_organization_delegation_member(
    p_delegation_id uuid,
    p_user_id uuid,
    p_assigned_by uuid,
    p_occurred_at timestamptz
) returns void language plpgsql security definer set search_path = public as $$
declare v_provider uuid;
begin
    select provider_organization_id into v_provider from public.organization_delegations where id = p_delegation_id and status = 'active';
    if v_provider is null then raise exception 'delegation_not_active'; end if;
    if not exists (select 1 from public.organization_memberships where organization_id = v_provider and user_id = p_user_id and status = 'active')
       or not exists (select 1 from public.organization_memberships where organization_id = v_provider and user_id = p_assigned_by and status = 'active') then
        raise exception 'delegation_provider_membership_required';
    end if;
    insert into public.organization_delegation_member_assignments(delegation_id, user_id, assigned_by_user_id, assigned_at)
    values (p_delegation_id, p_user_id, p_assigned_by, p_occurred_at)
    on conflict (delegation_id, user_id) do update set status = 'active', assigned_by_user_id = excluded.assigned_by_user_id, assigned_at = excluded.assigned_at, revoked_at = null;
end;
$$;

create or replace function public.change_organization_delegation_status(
    p_delegation_id uuid,
    p_status text,
    p_changed_by uuid,
    p_occurred_at timestamptz
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_provider uuid; v_client uuid; v_current text;
begin
    select provider_organization_id, client_organization_id, status into v_provider, v_client, v_current from public.organization_delegations where id = p_delegation_id for update;
    if v_current is null then raise exception 'delegation_not_found'; end if;
    if p_status not in ('suspended', 'revoked') then raise exception 'delegation_transition_invalid'; end if;
    if not exists (select 1 from public.organization_memberships where organization_id in (v_provider, v_client) and user_id = p_changed_by and status = 'active') then
        raise exception 'delegation_membership_required';
    end if;
    update public.organization_delegations set
        status = p_status,
        suspended_at = case when p_status = 'suspended' then p_occurred_at else suspended_at end,
        revoked_at = case when p_status = 'revoked' then p_occurred_at else revoked_at end,
        updated_at = p_occurred_at
    where id = p_delegation_id;
    return public.organization_delegation_json(p_delegation_id);
end;
$$;

revoke all on function public.organization_delegation_json(uuid) from public, anon, authenticated;
revoke all on function public.get_organization_delegation(uuid) from public, anon, authenticated;
revoke all on function public.list_user_organization_delegations(uuid) from public, anon, authenticated;
revoke all on function public.create_organization_delegation(uuid, uuid, text[], timestamptz, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.accept_organization_delegation(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.assign_organization_delegation_member(uuid, uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.change_organization_delegation_status(uuid, text, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.get_organization_delegation(uuid) to service_role;
grant execute on function public.list_user_organization_delegations(uuid) to service_role;
grant execute on function public.create_organization_delegation(uuid, uuid, text[], timestamptz, timestamptz, uuid) to service_role;
grant execute on function public.accept_organization_delegation(uuid, uuid, timestamptz) to service_role;
grant execute on function public.assign_organization_delegation_member(uuid, uuid, uuid, timestamptz) to service_role;
grant execute on function public.change_organization_delegation_status(uuid, text, uuid, timestamptz) to service_role;
