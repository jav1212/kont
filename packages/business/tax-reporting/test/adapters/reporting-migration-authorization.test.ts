import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("reporting migration authorizes active delegates by direction and requires both books for cross-book reports", async () => {
  const sql = await readFile(new URL("../../../../../supabase/migrations/322_iva_reporting.sql", import.meta.url), "utf8");
  assert.match(sql, /organization_delegation_member_assignments/);
  assert.match(sql, /s\.scope=case p_fact_snapshot->>'direction' when 'sale' then 'sales' else 'purchases' end/);
  assert.match(sql, /s\.scope='purchases'/);
  assert.match(sql, /s\.scope='sales'/);
  assert.match(sql, /p_actor_id uuid/);
  assert.match(sql, /p_fact_snapshot->>'direction' is null/);
  assert.match(sql, /p_declaration_snapshot->>'status' is null/);
  assert.match(sql, /status'='void'.*voidEvidence/s);
  assert.match(sql, /voidEvidence' is distinct from 'null'::jsonb/);
  assert.match(sql, /voidEvidence'->>'actorId' is distinct from p_actor_id::text/);
  assert.match(sql, /shared_tax_reporting_declaration_list/);
  assert.match(sql, /s\.scope='purchases'/);
  assert.match(sql, /s\.scope='sales'/);
  assert.match(sql, /p_limit\+1/);
  assert.match(sql, /limit p_limit\+1/);
  assert.match(sql, /count\(\*\)>p_limit/);
  assert.match(sql, /:tax-reporting-fact:'\|\|btrim\(p_idempotency_key\)/);
  assert.match(sql, /:vat-declaration-command:'\|\|btrim\(p_idempotency_key\)/);
  assert.match(sql, /:vat-declaration:'\|\|btrim\(p_declaration_id\)/);
  assert.equal((sql.match(/pg_advisory_xact_lock\(hashtextextended/g) ?? []).length, 3);
});
