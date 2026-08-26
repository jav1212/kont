import assert from "node:assert/strict";
import test from "node:test";
import { WORKER, VES } from "../src/index";
test("canonical payroll fixtures expose stable worker and monetary identities", () => { assert.equal(WORKER.displayName, "Ada Lovelace"); assert.equal(VES.code, "VES"); });
