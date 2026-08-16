import assert from "node:assert/strict";
import test from "node:test";
import { organizationId } from "../src/index";

test("organization identifiers reject empty values", () => {
  assert.throws(() => organizationId("  "), TypeError);
});

test("organization identifiers normalize surrounding whitespace", () => {
  assert.equal(organizationId(" org-1 "), "org-1");
});
