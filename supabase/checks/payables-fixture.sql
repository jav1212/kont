create role anon;
create role authenticated;
create role service_role;
create schema if not exists auth;
create table auth.users(id uuid primary key);
create table public.tenants(id uuid primary key);
create table public.organizations(id uuid primary key);
create table public.shared_companies(
 tenant_id uuid not null,id text not null,organization_id uuid not null,status text not null default 'active',name text not null default 'Empresa',rif text,address text,
 primary key(tenant_id,id),unique(organization_id,id)
);
create table public.shared_inventory_suppliers(
 tenant_id uuid not null,id text not null,company_id text not null,rif text not null default '',name text not null,
 contact text not null default '',phone text not null default '',email text not null default '',address text not null default '',notes text not null default '',active boolean not null default true,
 primary key(tenant_id,id)
);
create table public.shared_inventory_purchase_invoices(
 tenant_id uuid not null,id text not null,company_id text not null,supplier_id text not null,
 invoice_number text not null default '',invoice_date date not null default current_date,period text not null default '2026-10',status text not null default 'borrador',branch_id uuid,control_number text,vat_retention_receipt_number text,income_tax_receipt_number text,
 subtotal numeric(14,2) not null default 0,vat_amount numeric(14,2) not null default 0,total numeric(14,2) not null default 0,
 notes text not null default '',dollar_rate numeric(14,6),document_type text not null default 'factura',affected_invoice_id text,
 financial_tax_amount numeric(14,2) default 0,vat_retention_amount numeric(14,2) default 0,income_tax_amount numeric(14,2) default 0,taxes jsonb not null default '[]'::jsonb,exchange_rates jsonb not null default '[]'::jsonb,
 primary key(tenant_id,id)
);
create table public.shared_inventory_purchase_invoice_items(tenant_id uuid not null,invoice_id text not null,currency char(1),dollar_rate numeric);
create table public.shared_accounting_periods(tenant_id uuid not null,id text not null,company_id text not null,name text not null default '',start_date date not null,end_date date not null,status text not null default 'open',primary key(tenant_id,id));
-- Treasury foundation runs for real in these checks; these are only its external prerequisites.
create table public.shared_accounting_accounts(tenant_id uuid not null,id text not null,company_id text not null,code text not null,name text not null default '',type text not null default 'asset',is_active boolean not null default true,is_group boolean not null default false,primary key(tenant_id,id));
create table public.shared_accounting_integration_rules(tenant_id uuid not null,id text not null,company_id text not null,source text not null check(source in('payroll','inventory_purchase','inventory_movement')),debit_account_id text not null,credit_account_id text not null,amount_field text not null,description text,is_active boolean not null default true,updated_at timestamptz not null default now(),primary key(tenant_id,id));
create table public.shared_accounting_entries(tenant_id uuid not null,id text not null,company_id text not null,period_id text not null,entry_number integer not null,entry_date date not null,description text not null,status text not null check(status in('draft','posted')),source text not null check(source in('manual','payroll','inventory')),source_ref text,posted_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),primary key(tenant_id,id));
create table public.shared_accounting_entry_lines(tenant_id uuid not null,id text not null,entry_id text not null,account_id text not null,type text not null check(type in('debit','credit')),amount numeric not null check(amount>0),description text,created_at timestamptz not null default now(),primary key(tenant_id,id));
create table public.shared_accounting_integration_log(tenant_id uuid not null,id text not null,company_id text not null,source text not null,source_ref text not null,entry_id text,status text not null check(status in('success','error','skipped')),error_message text,created_at timestamptz not null default now(),primary key(tenant_id,id));
create table public.shared_native_accounting_rule_config_events(id uuid primary key default gen_random_uuid(),tenant_id uuid not null,organization_id uuid not null,company_id text not null,source text not null check(source in('payroll','inventory_purchase')),previous_version text not null,resulting_version text not null,previous_rules jsonb not null,resulting_rules jsonb not null,changed_by uuid not null,changed_at timestamptz not null default clock_timestamp());
create table public.shared_payment_orders(tenant_id uuid not null,id text not null,company_id text not null,beneficiary text not null,concept text not null,amount numeric(28,8) not null,currency varchar(3) not null,due_date date,status text not null default 'draft',version integer not null default 1,created_at timestamptz default now(),updated_at timestamptz default now(),primary key(tenant_id,id));
create table public.shared_sales_receivables(tenant_id uuid not null,id text not null,company_id text not null,primary key(tenant_id,id));
create table public.shared_sales_receivable_payments(tenant_id uuid not null,id text not null,receivable_id text not null,received_amount numeric(28,8) not null,received_currency_code varchar(3) not null,primary key(tenant_id,id));
create table public.shared_sales_payment_reversals(tenant_id uuid not null,id text not null,payment_id text not null,primary key(tenant_id,id));
create or replace function public.digest(text,text) returns bytea language sql immutable as $$ select convert_to($1,'UTF8') $$;
create or replace function public.set_operational_audit_context(p_actor uuid,p_org uuid,p_company text,p_branch text,p_device text) returns void language plpgsql as $$ begin perform set_config('kontave.operation.organization_id',p_org::text,true); end $$;
create table public.access_control_permissions(code text primary key,resource text,action text,description text);
create table public.organization_roles(id uuid primary key,code text,status text);
create table public.organization_role_permissions(role_id uuid,permission_code text,primary key(role_id,permission_code));
create table public.module_catalog(id uuid primary key default gen_random_uuid(),code text unique not null check(code in('payroll','inventory','accounting','purchases','sales','tools','companies','documents','treasury')),name text not null,status text not null,supported_platforms text[] not null default '{}');
create table public.module_capabilities(module_id uuid,capability_code text,primary key(module_id,capability_code));
create table public.shared_operational_audit_trail(
 tenant_id uuid,organization_id uuid,company_id text,entity_type text,entity_id text,action text,actor_id uuid,occurred_at timestamptz,before_snapshot jsonb,after_snapshot jsonb
);
create or replace function public.append_operational_audit_trigger() returns trigger language plpgsql as $$ begin return new; end $$;
create or replace function public.assert_user_security_access(p_actor_user_id uuid,p_organization_id uuid,p_company_id text,p_permission text)
returns uuid language plpgsql as $$ declare v_tenant uuid; begin
 if p_actor_user_id not in ('00000000-0000-4000-8000-000000000003'::uuid,'00000000-0000-4000-8000-000000000013'::uuid) then raise exception 'ORGANIZATIONAL_USER_ACCESS_DENIED'; end if;
 select tenant_id into v_tenant from public.shared_companies where organization_id=p_organization_id and id=p_company_id for share;
 if v_tenant is null then raise exception 'ORGANIZATIONAL_USER_COMPANY_INVALID'; end if;
 return v_tenant;
end $$;
create or replace function public.assert_user_security_read_access(p_actor_user_id uuid,p_organization_id uuid,p_company_id text,p_permission text)
returns uuid language plpgsql as $$ declare v_tenant uuid; begin
 if p_actor_user_id not in ('00000000-0000-4000-8000-000000000003'::uuid,'00000000-0000-4000-8000-000000000013'::uuid) then raise exception 'ORGANIZATIONAL_USER_ACCESS_DENIED'; end if;
 select tenant_id into v_tenant from public.shared_companies where organization_id=p_organization_id and id=p_company_id;
 if v_tenant is null then raise exception 'ORGANIZATIONAL_USER_COMPANY_INVALID'; end if;
 return v_tenant;
end $$;

insert into public.tenants values('00000000-0000-4000-8000-000000000001');
insert into public.organizations values('00000000-0000-4000-8000-000000000002');
insert into auth.users values('00000000-0000-4000-8000-000000000003'),('00000000-0000-4000-8000-000000000013');
insert into public.shared_companies(tenant_id,id,organization_id) values('00000000-0000-4000-8000-000000000001','company-1','00000000-0000-4000-8000-000000000002');
insert into public.shared_inventory_suppliers(tenant_id,id,company_id,name) values('00000000-0000-4000-8000-000000000001','supplier-1','company-1','Proveedor Uno');
insert into public.organization_roles(id,code,status) values('00000000-0000-4000-8000-000000000004','owner','active');
insert into public.module_catalog(code,name,status,supported_platforms) values('payroll','Nómina','active',array['web']);
