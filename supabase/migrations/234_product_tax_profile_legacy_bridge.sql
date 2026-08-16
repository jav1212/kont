-- Keeps the portable temporal tax profile aligned while production Web still
-- writes the legacy vat_type column. Native writes are idempotent through the
-- current-treatment comparison and therefore do not create duplicate history.
create or replace function public.sync_shared_product_tax_profile_from_legacy()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_profile_id text;v_profile_version integer;v_assignment record;v_treatment text:=case when new.vat_type='exento'then'exempt'else'taxed'end;v_date date:=current_date;
begin
 v_profile_id:='legacy:'||new.id;
 insert into public.shared_product_tax_profiles(tenant_id,id,company_id,product_id,jurisdiction,version)values(new.tenant_id,v_profile_id,new.company_id,new.id,'VE',1)on conflict(tenant_id,product_id)do nothing;
 select version into v_profile_version from public.shared_product_tax_profiles where tenant_id=new.tenant_id and product_id=new.id for update;
 select*into v_assignment from public.shared_product_tax_assignments where tenant_id=new.tenant_id and profile_id=v_profile_id and tax_code='IVA'and effective_to is null for update;
 if not found then
  insert into public.shared_product_tax_assignments(tenant_id,id,profile_id,tax_code,treatment,effective_from,effective_to,legal_basis,classification_version)values(new.tenant_id,gen_random_uuid()::text,v_profile_id,'IVA',v_treatment,least(new.created_at::date,v_date),null,'Synchronized from the production product IVA classification.','legacy-bridge:'||v_profile_version::text);
 elsif v_assignment.treatment<>v_treatment then
  if v_assignment.effective_from>=v_date then update public.shared_product_tax_assignments set treatment=v_treatment,legal_basis='Synchronized from the production product IVA classification.',classification_version='legacy-bridge:'||(v_profile_version+1)::text where tenant_id=new.tenant_id and id=v_assignment.id;
  else update public.shared_product_tax_assignments set effective_to=v_date-1 where tenant_id=new.tenant_id and id=v_assignment.id;insert into public.shared_product_tax_assignments(tenant_id,id,profile_id,tax_code,treatment,effective_from,effective_to,legal_basis,classification_version)values(new.tenant_id,gen_random_uuid()::text,v_profile_id,'IVA',v_treatment,v_date,null,'Synchronized from the production product IVA classification.','legacy-bridge:'||(v_profile_version+1)::text);end if;
  update public.shared_product_tax_profiles set version=version+1,updated_at=now()where tenant_id=new.tenant_id and product_id=new.id;
 end if;
 return new;
end$$;
drop trigger if exists shared_product_tax_profile_legacy_bridge on public.shared_inventory_products;
create trigger shared_product_tax_profile_legacy_bridge after insert or update of vat_type on public.shared_inventory_products for each row execute function public.sync_shared_product_tax_profile_from_legacy();
revoke all on function public.sync_shared_product_tax_profile_from_legacy()from public,anon,authenticated;grant execute on function public.sync_shared_product_tax_profile_from_legacy()to service_role;
