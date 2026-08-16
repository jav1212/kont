-- Data parity was verified before cutover: every compatibility company maps to
-- shared_companies and every activation maps to shared_company_module_activations.
drop function if exists public.activate_company_module(uuid,text,timestamptz);
drop function if exists public.suspend_company_module(uuid,text,timestamptz);
drop table if exists public.company_module_activations;
drop table if exists public.companies;
