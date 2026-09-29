import assert from "node:assert/strict";
import test from "node:test";
import { createSupabaseScopedAccessGrants } from "../../src/adapters/supabase";
import { AuthorizationDenied, permissionCode, ScopedAccessTargetKind } from "../../src/domain";

test("scoped grant reader fails closed when persistence denies the exact target", async (context) => {
  context.mock.method(globalThis, "fetch", async () => Response.json(false));
  const grants = createSupabaseScopedAccessGrants({ url: "https://access.test", serviceRoleKey: "test-key" });
  const permitted = await grants.hasGrant({ actor: { userId: "actor", organizationId: "organization", membershipId: "membership" as never }, permission: permissionCode("modules.access"), target: { kind: ScopedAccessTargetKind.Module, id: "payroll" }, resource: { organizationId: "organization", type: "module" } });
  assert.equal(permitted, false);
});

test("scoped grant reader sends only the RPC signature accepted by SQL", async (context) => {
  let body = "";
  context.mock.method(globalThis, "fetch", async (_request: Parameters<typeof fetch>[0], init?: RequestInit) => { body = String(init?.body); return Response.json(true); });
  const grants = createSupabaseScopedAccessGrants({ url: "https://access.test", serviceRoleKey: "test-key" });
  await grants.hasGrant({ actor: { userId: "actor", organizationId: "organization" }, permission: permissionCode("modules.access"), target: { kind: ScopedAccessTargetKind.Module, id: "payroll" }, resource: { organizationId: "organization", type: "module" } });
  assert.equal(body.includes("p_membership_id"), false);
});

test("a cross-organization scoped request is denied before contacting persistence",async(context)=>{
 let contacted=false;
 context.mock.method(globalThis,"fetch",async()=>{contacted=true;return Response.json(true);});
 const grants=createSupabaseScopedAccessGrants({url:"https://access.test",serviceRoleKey:"test-key"});
 await assert.rejects(()=>grants.hasGrant({actor:{userId:"actor",organizationId:"organization"},permission:permissionCode("modules.access"),target:{kind:ScopedAccessTargetKind.Module,id:"payroll"},resource:{organizationId:"other",type:"module"}}),AuthorizationDenied);
 assert.equal(contacted,false);
});
