-- Run in a disposable database after migration 292.  The enclosing rollback
-- proves the audit append shares the business transaction.
begin;
do $$
declare v_tenant uuid; v_company text; v_count bigint;
begin
 select tenant_id,id into v_tenant,v_company from public.shared_companies limit 1;
 if v_tenant is null then raise notice 'SKIP: no shared company fixture'; return; end if;
 begin
   insert into public.shared_inventory_products(tenant_id,id,company_id,code,name) values(v_tenant,'audit-rollback-fixture',v_company,'AUD-RB','Audit rollback');
   select count(*) into v_count from public.shared_operational_audit_trail where tenant_id=v_tenant and entity_id='audit-rollback-fixture';
   if v_count<>1 then raise exception 'Expected audit append, got %',v_count; end if;
   raise exception 'force rollback';
 exception when raise_exception then
   if sqlerrm<>'force rollback' then raise; end if;
 end;
 select count(*) into v_count from public.shared_operational_audit_trail where tenant_id=v_tenant and entity_id='audit-rollback-fixture';
 if v_count<>0 then raise exception 'Business rollback leaked % audit rows',v_count; end if;
end $$;
rollback;
