-- Audited W3 command for assigning legacy loose accounts without replacing IDs.
create or replace function public.accounting_execute_assign_account_to_chart(p_scope jsonb,p_command jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
 v_tenant uuid;
 v_account public.shared_accounting_accounts%rowtype;
 v_chart public.shared_accounting_charts%rowtype;
 v_parent public.shared_accounting_accounts%rowtype;
 v_position jsonb;
 v_key text;
 v_hash text;
 v_receipt public.shared_accounting_command_receipts%rowtype;
 v_response jsonb;
begin
 v_tenant:=public.accounting_require_scope(p_scope,'accounting.chart.manage');
 v_key:=nullif(btrim(p_command->>'idempotencyKey'),'');
 if p_command->>'kind'<>'assign_account_to_chart' or v_key is null or length(v_key)>128 or nullif(btrim(p_command->>'correlationId'),'') is null then raise exception 'ACCOUNTING_INVALID'; end if;
 v_hash:=md5(jsonb_strip_nulls(p_command)::text);
 perform pg_advisory_xact_lock(hashtextextended(v_tenant::text||':'||(p_scope->>'companyId')||':'||v_key,0));
 select * into v_receipt from public.shared_accounting_command_receipts where tenant_id=v_tenant and company_id=p_scope->>'companyId' and idempotency_key=v_key for update;
 if found then if v_receipt.intent_hash<>v_hash then raise exception 'ACCOUNTING_IDEMPOTENCY_CONFLICT'; end if; return v_receipt.response||jsonb_build_object('replayed',true); end if;
 perform public.set_operational_audit_context((p_scope->>'actorId')::uuid,(p_scope->>'organizationId')::uuid,p_scope->>'companyId',null,null);
 select * into v_account from public.shared_accounting_accounts where tenant_id=v_tenant and company_id=p_scope->>'companyId' and id=p_command->>'accountId' for update;
 if not found then raise exception 'ACCOUNTING_NOT_FOUND'; end if;
 if v_account.version<>(p_command->>'expectedVersion')::integer then raise exception 'ACCOUNTING_VERSION_CONFLICT'; end if;
 if v_account.chart_id is not null then raise exception 'ACCOUNTING_ACCOUNT_ALREADY_ASSIGNED'; end if;
 select * into v_chart from public.shared_accounting_charts where tenant_id=v_tenant and company_id=p_scope->>'companyId' and id=p_command->>'chartId' for update;
 if not found or v_chart.status='archived' then raise exception 'ACCOUNTING_CHART_COMPANY_MISMATCH'; end if;
 v_position:=public.accounting_code_position(v_chart.code_structure,v_account.code);
 if (v_position->>'parentCode') is distinct from v_account.parent_code then raise exception 'ACCOUNTING_PARENT_INVALID'; end if;
 if v_account.parent_code is not null then
  select * into v_parent from public.shared_accounting_accounts where tenant_id=v_tenant and company_id=p_scope->>'companyId' and code=v_account.parent_code for share;
  -- A missing historical parent remains untouched for separate approval. If it
  -- exists, it must be a summary in this chart or another still-loose account.
  if found and (v_parent.account_kind<>'summary' or (v_parent.chart_id is not null and v_parent.chart_id<>v_chart.id)) then raise exception 'ACCOUNTING_PARENT_INVALID'; end if;
 end if;
 update public.shared_accounting_accounts set chart_id=v_chart.id,version=version+1,updated_at=now() where tenant_id=v_tenant and id=v_account.id;
 v_response:=jsonb_build_object('commandId',v_account.id,'replayed',false,'affectedIds',jsonb_build_array(v_account.id),'versions',jsonb_build_object(v_account.id,v_account.version+1));
 insert into public.shared_accounting_command_receipts(tenant_id,company_id,idempotency_key,intent_hash,response,correlation_id) values(v_tenant,p_scope->>'companyId',v_key,v_hash,v_response,p_command->>'correlationId');
 insert into public.shared_accounting_command_audit(tenant_id,id,organization_id,company_id,actor_id,kind,correlation_id,command) values(v_tenant,md5(v_tenant::text||':'||(p_scope->>'companyId')||':'||v_key),(p_scope->>'organizationId')::uuid,p_scope->>'companyId',(p_scope->>'actorId')::uuid,'assign_account_to_chart',p_command->>'correlationId',p_command);
 return v_response;
end;
$$;

alter function public.shared_accounting_execute_command(jsonb,jsonb) rename to shared_accounting_execute_assign_command_v1;
create or replace function public.shared_accounting_execute_command(p_scope jsonb,p_command jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if p_command->>'kind'='assign_account_to_chart' then return public.accounting_execute_assign_account_to_chart(p_scope,p_command); end if;
 return public.shared_accounting_execute_assign_command_v1(p_scope,p_command);
end;
$$;
revoke all on function public.accounting_execute_assign_account_to_chart(jsonb,jsonb),public.shared_accounting_execute_assign_command_v1(jsonb,jsonb),public.shared_accounting_execute_command(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.shared_accounting_execute_command(jsonb,jsonb),public.shared_accounting_execute_assign_command_v1(jsonb,jsonb) to service_role;
