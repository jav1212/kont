import assert from "node:assert/strict";
import test from "node:test";
import { PERMISSIONS } from "@kontave/access-control/domain";
import { treasuryCommandPermission } from "../src/client-api/v1/treasury/treasury-command-permission";

test("manual reconciliation requires the reconciliation permission", () => {
  assert.equal(treasuryCommandPermission("reconcile_manually"), PERMISSIONS.TREASURY_RECONCILE);
});

test("ledger drafts use the posting permission", () => {
  assert.equal(treasuryCommandPermission("create_ledger_draft"), PERMISSIONS.TREASURY_POST);
  assert.equal(treasuryCommandPermission("post_ledger_draft"), PERMISSIONS.TREASURY_POST);
});

test("reconciliation reversals and unrelated commands retain their least privilege", () => {
  assert.equal(treasuryCommandPermission("undo_reconciliation_match"), PERMISSIONS.TREASURY_REVERSE);
  assert.equal(treasuryCommandPermission("post_ledger_entry"), PERMISSIONS.TREASURY_POST);
  assert.equal(treasuryCommandPermission("unknown_command"), undefined);
  assert.equal(treasuryCommandPermission(null), undefined);
});
