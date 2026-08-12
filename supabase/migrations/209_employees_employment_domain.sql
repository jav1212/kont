-- Employee represents employment owned by an operational company.
-- Additive only: shared_employees and current Web payroll remain unchanged.
create table if not exists public.employees(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id) on delete restrict,
 legacy_employee_id text,national_id text not null,full_name text not null,position text not null default '',hired_on date,
 employment_type text not null default 'indefinite' check(employment_type in('indefinite','fixed_term','contractor')),
 terminated_on date,status text not null default 'active' check(status in('active','suspended','terminated')),
 version integer not null default 1 check(version>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(company_id,legacy_employee_id),unique(company_id,national_id)
);
create index if not exists employees_company_status_idx on public.employees(company_id,status,full_name);
create table if not exists public.employee_compensations(
 id uuid primary key default gen_random_uuid(),employee_id uuid not null references public.employees(id) on delete cascade,
 monthly_salary_minor bigint not null check(monthly_salary_minor>=0),currency char(3) not null check(currency in('VES','USD')),
 effective_from date not null,effective_until date,reason text not null default 'migration',created_at timestamptz not null default now(),
 check(effective_until is null or effective_until>=effective_from),unique(employee_id,effective_from)
);
create unique index if not exists employee_compensations_current_idx on public.employee_compensations(employee_id) where effective_until is null;
create table if not exists public.employee_leaves(
 id uuid primary key default gen_random_uuid(),employee_id uuid not null references public.employees(id) on delete cascade,
 kind text not null check(kind in('vacation','medical','maternity','paternity','unpaid')),starts_on date not null,ends_on date not null,
 status text not null check(status in('scheduled','active','completed','cancelled')),notes text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),check(ends_on>=starts_on)
);
create index if not exists employee_leaves_employee_period_idx on public.employee_leaves(employee_id,starts_on desc);

insert into public.employees(company_id,legacy_employee_id,national_id,full_name,position,hired_on,employment_type,status,created_at,updated_at)
select company.id,legacy.id,upper(trim(legacy.cedula)),legacy.nombre,coalesce(legacy.cargo,''),legacy.fecha_ingreso,'indefinite',
 case when legacy.estado='activo' or legacy.estado='vacacion' then 'active' else 'suspended' end,legacy.created_at,legacy.updated_at
from public.shared_employees legacy join public.companies company on company.organization_id=(select o.id from public.organizations o where o.legacy_tenant_id=legacy.tenant_id) and company.legacy_company_id=legacy.company_id
on conflict(company_id,legacy_employee_id) do update set national_id=excluded.national_id,full_name=excluded.full_name,position=excluded.position,hired_on=excluded.hired_on,status=excluded.status,updated_at=excluded.updated_at;

with compensation_sources as (
 select employee.id employee_id,history.fecha_desde effective_from,round(history.salario_mensual*100)::bigint monthly_salary_minor,
  case when history.moneda in('VES','USD') then history.moneda else 'VES' end currency,'legacy_salary_history' reason,history.created_at
 from public.shared_employee_salary_history history
 join public.companies company on company.organization_id=(select o.id from public.organizations o where o.legacy_tenant_id=history.tenant_id) and company.legacy_company_id=history.company_id
 join public.employees employee on employee.company_id=company.id and employee.national_id=upper(trim(history.employee_cedula))
 union all
 select employee.id,coalesce(legacy.fecha_ingreso,legacy.created_at::date),round(legacy.salario_mensual*100)::bigint,
  case when legacy.moneda in('VES','USD') then legacy.moneda else 'VES' end,'legacy_current_salary',legacy.updated_at
 from public.shared_employees legacy
 join public.companies company on company.organization_id=(select o.id from public.organizations o where o.legacy_tenant_id=legacy.tenant_id) and company.legacy_company_id=legacy.company_id
 join public.employees employee on employee.company_id=company.id and employee.legacy_employee_id=legacy.id
),deduplicated as (
 select distinct on(employee_id,effective_from) employee_id,effective_from,monthly_salary_minor,currency,reason
 from compensation_sources order by employee_id,effective_from,created_at desc
),periods as (
 select *,lead(effective_from) over(partition by employee_id order by effective_from)-1 effective_until from deduplicated
)
insert into public.employee_compensations(employee_id,monthly_salary_minor,currency,effective_from,effective_until,reason)
select employee_id,monthly_salary_minor,currency,effective_from,effective_until,reason from periods
on conflict(employee_id,effective_from) do update set monthly_salary_minor=excluded.monthly_salary_minor,currency=excluded.currency,effective_until=excluded.effective_until,reason=excluded.reason;

insert into public.employee_leaves(employee_id,kind,starts_on,ends_on,status,notes)
select employee.id,'vacation',current_date,current_date,'active','Migrated from legacy employee status'
from public.shared_employees legacy join public.companies company on company.organization_id=(select o.id from public.organizations o where o.legacy_tenant_id=legacy.tenant_id) and company.legacy_company_id=legacy.company_id
join public.employees employee on employee.company_id=company.id and employee.legacy_employee_id=legacy.id where legacy.estado='vacacion';

alter table public.employees enable row level security;alter table public.employee_compensations enable row level security;alter table public.employee_leaves enable row level security;
revoke all on public.employees,public.employee_compensations,public.employee_leaves from anon,authenticated;
create or replace function public.list_company_employees(p_company_id uuid)returns setof jsonb language sql stable security definer set search_path=public as $$
 select to_jsonb(e)||jsonb_build_object('monthly_salary_minor',c.monthly_salary_minor::text,'currency',c.currency,'effective_from',c.effective_from)
 from public.employees e join public.employee_compensations c on c.employee_id=e.id and c.effective_until is null where e.company_id=p_company_id order by e.full_name $$;
create or replace function public.save_operational_employee(p_employee_id uuid,p_company_id uuid,p_legacy_employee_id text,p_national_id text,p_full_name text,p_position text,p_hired_on date,p_employment_type text,p_terminated_on date,p_status text,p_version integer)returns void language sql security definer set search_path=public as $$
 insert into public.employees(id,company_id,legacy_employee_id,national_id,full_name,position,hired_on,employment_type,terminated_on,status,version)values(p_employee_id,p_company_id,p_legacy_employee_id,p_national_id,p_full_name,p_position,p_hired_on,p_employment_type,p_terminated_on,p_status,p_version)
 on conflict(id)do update set full_name=excluded.full_name,position=excluded.position,hired_on=excluded.hired_on,employment_type=excluded.employment_type,terminated_on=excluded.terminated_on,status=excluded.status,version=excluded.version,updated_at=now() $$;
create or replace function public.change_operational_employee_compensation(p_employee_id uuid,p_monthly_salary_minor bigint,p_currency text,p_effective_from date,p_reason text)returns void language plpgsql security definer set search_path=public as $$ begin
 update public.employee_compensations set effective_until=p_effective_from-1 where employee_id=p_employee_id and effective_until is null and effective_from<p_effective_from;
 insert into public.employee_compensations(employee_id,monthly_salary_minor,currency,effective_from,reason)values(p_employee_id,p_monthly_salary_minor,p_currency,p_effective_from,p_reason)
 on conflict(employee_id,effective_from)do update set monthly_salary_minor=excluded.monthly_salary_minor,currency=excluded.currency,reason=excluded.reason,effective_until=null;end $$;
revoke all on function public.list_company_employees(uuid) from public,anon,authenticated;revoke all on function public.save_operational_employee(uuid,uuid,text,text,text,text,date,text,date,text,integer) from public,anon,authenticated;revoke all on function public.change_operational_employee_compensation(uuid,bigint,text,date,text) from public,anon,authenticated;
grant execute on function public.list_company_employees(uuid) to service_role;grant execute on function public.save_operational_employee(uuid,uuid,text,text,text,text,date,text,date,text,integer) to service_role;grant execute on function public.change_operational_employee_compensation(uuid,bigint,text,date,text) to service_role;
