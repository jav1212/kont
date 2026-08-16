-- Employment remains in the shared company model used by Web, Desktop and Mobile.
-- This migration intentionally extends shared_employees instead of creating a
-- second employees source of truth.
alter table public.shared_employees add column if not exists employment_type text not null default 'indefinite' check(employment_type in('indefinite','fixed_term','contractor'));
alter table public.shared_employees add column if not exists terminated_on date;
alter table public.shared_employees add column if not exists version integer not null default 1 check(version>0);

create or replace function public.list_shared_company_employees(p_company_id text,p_organization_id uuid)
returns setof jsonb language sql stable security definer set search_path=public as $$
 select to_jsonb(e)||jsonb_build_object(
   'legacy_employee_id',e.id,'national_id',e.cedula,'full_name',e.nombre,'position',e.cargo,
   'hired_on',e.fecha_ingreso,'status',case when e.estado in('activo','vacacion') then 'active' else 'suspended' end,
   'monthly_salary_minor',round(e.salario_mensual*100)::bigint::text,'currency',e.moneda,
   'effective_from',coalesce((select max(h.fecha_desde) from public.shared_employee_salary_history h where h.tenant_id=e.tenant_id and h.company_id=e.company_id and h.employee_cedula=e.cedula),e.fecha_ingreso,e.created_at::date)
 ) from public.shared_employees e join public.shared_companies company on company.tenant_id=e.tenant_id and company.id=e.company_id
 where e.company_id=p_company_id and (p_organization_id is null or company.organization_id=p_organization_id) order by e.nombre
$$;

create or replace function public.save_shared_employee(p_employee_id text,p_company_id text,p_national_id text,p_full_name text,p_position text,p_hired_on date,p_employment_type text,p_terminated_on date,p_status text,p_version integer)
returns void language plpgsql security definer set search_path=public as $$
declare v_tenant_id uuid;
begin
 select tenant_id into v_tenant_id from public.shared_companies where id=p_company_id;
 if v_tenant_id is null then raise exception 'COMPANY_NOT_FOUND'; end if;
 insert into public.shared_employees(tenant_id,id,company_id,cedula,nombre,cargo,fecha_ingreso,employment_type,terminated_on,estado,version)
 values(v_tenant_id,p_employee_id,p_company_id,p_national_id,p_full_name,p_position,p_hired_on,p_employment_type,p_terminated_on,case when p_status='active' then 'activo' else 'inactivo' end,p_version)
 on conflict(tenant_id,id) do update set cedula=excluded.cedula,nombre=excluded.nombre,cargo=excluded.cargo,fecha_ingreso=excluded.fecha_ingreso,employment_type=excluded.employment_type,terminated_on=excluded.terminated_on,estado=excluded.estado,version=excluded.version,updated_at=now();
end $$;

create or replace function public.change_shared_employee_compensation(p_employee_id text,p_company_id text,p_monthly_salary_minor bigint,p_currency text,p_effective_from date)
returns void language plpgsql security definer set search_path=public as $$
declare v_employee public.shared_employees%rowtype;
begin
 select * into v_employee from public.shared_employees where id=p_employee_id and company_id=p_company_id for update;
 if not found then raise exception 'EMPLOYEE_NOT_FOUND'; end if;
 insert into public.shared_employee_salary_history(tenant_id,employee_cedula,company_id,salario_mensual,moneda,fecha_desde)
 values(v_employee.tenant_id,v_employee.cedula,p_company_id,p_monthly_salary_minor/100.0,p_currency,p_effective_from)
 on conflict do nothing;
 update public.shared_employees set salario_mensual=p_monthly_salary_minor/100.0,moneda=p_currency,version=version+1,updated_at=now() where tenant_id=v_employee.tenant_id and id=p_employee_id;
end $$;
revoke all on function public.list_shared_company_employees(text,uuid),public.save_shared_employee(text,text,text,text,text,date,text,date,text,integer),public.change_shared_employee_compensation(text,text,bigint,text,date) from public,anon,authenticated;
grant execute on function public.list_shared_company_employees(text,uuid),public.save_shared_employee(text,text,text,text,text,date,text,date,text,integer),public.change_shared_employee_compensation(text,text,bigint,text,date) to service_role;
