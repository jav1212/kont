import assert from "node:assert/strict";
import test from "node:test";
import { SupabaseAuditTrailRepository, type AuditTrailSupabaseSource } from "../../src/adapters/supabase";
import { GetAuditRecordMetadata, QueryAuditTrail } from "../../src/application";

const scope={tenantId:"tenant-a",organizationId:"organization-a",companyId:"company-a"} as const;
const row={id:"audit-1",tenant_id:"tenant-a",organization_id:"organization-a",company_id:"company-a",entity_type:"product",entity_id:"product-1",action:"create",actor_id:null,occurred_at:"2026-01-01T00:00:00.000Z",branch_id:null,device_id:null,before_snapshot:null,after_snapshot:{id:"product-1"}};
/** Makes a narrowly typed source with a deterministic RPC result. */
function source(data:unknown,error:null|{message?:string} = null):AuditTrailSupabaseSource{return{async rpc(){return{data,error};}};}
test("Supabase audit reader decodes null trusted context and forwards bounded pagination",async()=>{
 const calls:Record<string,unknown>[]=[];const client:AuditTrailSupabaseSource={async rpc(_n,args){calls.push(args);return{data:{entries:[row],total:1,offset:0,limit:50},error:null};}};
 const page=await new SupabaseAuditTrailRepository(client,"actor-a").query({scope});
 assert.equal(page.entries[0]!.context.actorId,null);assert.equal(page.entries[0]!.context.branchId,null);
 assert.deepEqual(calls[0],{p_tenant_id:"tenant-a",p_organization_id:"organization-a",p_company_id:"company-a",p_actor_user_id:"actor-a",p_entity_type:null,p_entity_id:null,p_actions:null,p_offset:0,p_limit:50});
});
test("Supabase audit reader rejects malformed RPC entries and cannot accept cross-tenant pages",async()=>{
 await assert.rejects(new SupabaseAuditTrailRepository(source({entries:[{...row,tenant_id:"tenant-b"}],total:1,offset:0,limit:50}),"actor-a").query({scope}),/scope|outside/i);
 await assert.rejects(new SupabaseAuditTrailRepository(source({entries:[{...row,action:"tampered"}],total:1,offset:0,limit:50}),"actor-a").query({scope}),/Invalid action/i);
 await assert.rejects(new SupabaseAuditTrailRepository(source({entries:[],total:1,offset:0,limit:101}),"actor-a").query({scope}),/scope|page/i);
});
test("Supabase audit reader surfaces authorization failures",async()=>{
 await assert.rejects(new SupabaseAuditTrailRepository(source(null,{message:"AUDIT_ACCESS_DENIED"}),"attacker").query({scope}),/AUDIT_ACCESS_DENIED/);
});

test("read-only Supabase persistence composes with both audit query use cases",async()=>{
 const repository=new SupabaseAuditTrailRepository(source({entries:[row],total:1,offset:0,limit:100}),"actor-a");
 const page=await new QueryAuditTrail(repository).execute({scope,limit:100});
 assert.equal(page.entries[0]?.entityId,"product-1");
 const metadata=await new GetAuditRecordMetadata(repository).execute({scope,entityType:"product",entityId:"product-1"});
 assert.equal(metadata?.createdAt,row.occurred_at);
});
