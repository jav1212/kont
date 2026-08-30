import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { auditWorkspace } from "../src/workspace-rules.mjs";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "kontave-architecture-"));
  await Promise.all(["apps/desktop/src", "apps/mobile/src", "packages/ui/src", "tooling/checks"].map((path) => mkdir(join(root, path), { recursive: true })));
  return root;
}

test("accepts unique packages with inward application dependencies", async () => {
  const root = await fixture();
  await writeFile(join(root, "apps/desktop/package.json"), JSON.stringify({ name: "@kontave/desktop", dependencies: { "@kontave/ui": "workspace:*" } }));
  await writeFile(join(root, "apps/mobile/package.json"), JSON.stringify({ name: "@kontave/mobile" }));
  await writeFile(join(root, "packages/ui/package.json"), JSON.stringify({ name: "@kontave/ui" }));
  await writeFile(join(root, "apps/desktop/src/index.ts"), 'import "@kontave/ui";');
  assert.deepEqual(await auditWorkspace(root), []);
});

test("rejects duplicate names and dependencies on applications", async () => {
  const root = await fixture();
  await writeFile(join(root, "apps/desktop/package.json"), JSON.stringify({ name: "@kontave/desktop" }));
  await writeFile(join(root, "apps/mobile/package.json"), JSON.stringify({ name: "@kontave/mobile" }));
  await writeFile(join(root, "packages/ui/package.json"), JSON.stringify({ name: "@kontave/desktop", dependencies: { "@kontave/mobile": "workspace:*" } }));
  const violations = await auditWorkspace(root);
  assert.equal(violations.some((violation) => violation.includes("Duplicate package name '@kontave/desktop'")), true);
  assert.equal(violations.some((violation) => violation.includes("depends on application package '@kontave/mobile'")), true);
});
