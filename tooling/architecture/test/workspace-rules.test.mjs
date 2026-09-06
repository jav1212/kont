import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { auditWorkspace } from "../src/workspace-rules.mjs";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "kontave-architecture-"));
  await Promise.all(
    [
      "apps/desktop/src",
      "apps/mobile/src",
      "packages/ui/src",
      "tooling/checks",
    ].map((path) => mkdir(join(root, path), { recursive: true })),
  );
  return root;
}

async function packageFixture(
  root,
  directory,
  name,
  source,
  exports = { ".": "./src/index.ts" },
) {
  await mkdir(join(root, directory, "src"), { recursive: true });
  await writeFile(
    join(root, directory, "package.json"),
    JSON.stringify({ name, exports }),
  );
  for (const [path, content] of Object.entries(source)) {
    const destination = join(root, directory, "src", path);
    await mkdir(join(destination, ".."), { recursive: true });
    await writeFile(destination, content);
  }
}

test("accepts unique packages with inward application dependencies", async () => {
  const root = await fixture();
  await writeFile(
    join(root, "apps/desktop/package.json"),
    JSON.stringify({
      name: "@kontave/desktop",
      dependencies: { "@kontave/ui": "workspace:*" },
    }),
  );
  await writeFile(
    join(root, "apps/mobile/package.json"),
    JSON.stringify({ name: "@kontave/mobile" }),
  );
  await writeFile(
    join(root, "packages/ui/package.json"),
    JSON.stringify({ name: "@kontave/ui" }),
  );
  await writeFile(
    join(root, "apps/desktop/src/index.ts"),
    'import "@kontave/ui";',
  );
  assert.deepEqual(await auditWorkspace(root), []);
});

test("rejects duplicate names and dependencies on applications", async () => {
  const root = await fixture();
  await writeFile(
    join(root, "apps/desktop/package.json"),
    JSON.stringify({ name: "@kontave/desktop" }),
  );
  await writeFile(
    join(root, "apps/mobile/package.json"),
    JSON.stringify({ name: "@kontave/mobile" }),
  );
  await writeFile(
    join(root, "packages/ui/package.json"),
    JSON.stringify({
      name: "@kontave/desktop",
      dependencies: { "@kontave/mobile": "workspace:*" },
    }),
  );
  const violations = await auditWorkspace(root);
  assert.equal(
    violations.some((violation) =>
      violation.includes("Duplicate package name '@kontave/desktop'"),
    ),
    true,
  );
  assert.equal(
    violations.some((violation) =>
      violation.includes("depends on application package '@kontave/mobile'"),
    ),
    true,
  );
});

test("uses TypeScript AST to reject inward-layer framework and adapter imports", async () => {
  const root = await fixture();
  await packageFixture(root, "packages/orders", "@kontave/orders", {
    "domain/order.ts":
      'import type { SupabaseClient } from "@supabase/supabase-js"; export type Order = SupabaseClient;',
    "application/place.ts":
      'import { client } from "../adapters/client"; export { client };',
    "adapters/client.ts": "export const client = {};",
    "index.ts": 'export * from "./domain/order";',
  });
  const violations = await auditWorkspace(root);
  assert.equal(
    violations.some((violation) =>
      violation.includes(
        "domain layer imports framework or platform dependency '@supabase/supabase-js'",
      ),
    ),
    true,
  );
  assert.equal(
    violations.some((violation) =>
      violation.includes("application layer imports adapters layer"),
    ),
    true,
  );
});

test("rejects private imports, package cycles, Web imports, and leaked adapter exports", async () => {
  const root = await fixture();
  await packageFixture(root, "packages/a", "@kontave/a", {
    "domain/model.ts": 'import "@kontave/b/private"; export {};',
    "index.ts": 'export * from "./adapters/source";',
    "adapters/source.ts": "export const source = {};",
  });
  await packageFixture(root, "packages/b", "@kontave/b", {
    "index.ts": 'import "@kontave/a"; export {};',
    "private.ts": "export {};",
  });
  await mkdir(join(root, "app"), { recursive: true });
  await writeFile(join(root, "app", "legacy.ts"), "export {};");
  await writeFile(
    join(root, "packages/a/src/domain/web.ts"),
    'import "../../../../app/legacy";',
  );
  const violations = await auditWorkspace(root);
  assert.equal(
    violations.some((violation) =>
      violation.includes("imports private workspace path '@kontave/b/private'"),
    ),
    true,
  );
  assert.equal(
    violations.some((violation) =>
      violation.includes(
        "Workspace package cycle: @kontave/a -> @kontave/b -> @kontave/a",
      ),
    ),
    true,
  );
  assert.equal(
    violations.some((violation) =>
      violation.includes("imports protected production Web code"),
    ),
    true,
  );
  assert.equal(
    violations.some((violation) =>
      violation.includes(
        "portable export '.' transitively exposes adapter, infrastructure",
      ),
    ),
    true,
  );
});

test("rejects import types, self adapter exports, and cross-package barrel leaks", async () => {
  const root = await fixture();
  await packageFixture(root, "packages/outer", "@kontave/outer", {
    "adapters/client.ts": "export const client = {};",
    "index.ts": 'export * from "./adapters/client";',
  });
  await packageFixture(
    root,
    "packages/portable",
    "@kontave/portable",
    {
      "domain/model.ts":
        "export type Remote = import(`@kontave/outer`).client;",
      "application/place.ts": 'import "@kontave/portable/adapter"; export {};',
      "adapters/index.ts": "export {};",
      "index.ts": 'export * from "@kontave/outer";',
    },
    { ".": "./src/index.ts", "./adapter": "./src/adapters/index.ts" },
  );
  const violations = await auditWorkspace(root);
  assert.equal(
    violations.some((violation) =>
      violation.includes(
        "domain layer imports adapter or infrastructure workspace export '@kontave/outer'",
      ),
    ),
    true,
  );
  assert.equal(
    violations.some((violation) =>
      violation.includes(
        "application layer imports adapters workspace export '@kontave/portable/adapter'",
      ),
    ),
    true,
  );
  assert.equal(
    violations.some(
      (violation) =>
        violation.includes("packages/portable/package.json") &&
        violation.includes("transitively exposes adapter, infrastructure"),
    ),
    true,
  );
});

test("scans app entrypoints and rejects a domain barrel that reaches application", async () => {
  const root = await fixture();
  await writeFile(
    join(root, "apps/mobile/package.json"),
    JSON.stringify({ name: "@kontave/mobile" }),
  );
  await writeFile(
    join(root, "apps/desktop/package.json"),
    JSON.stringify({ name: "@kontave/desktop" }),
  );
  await mkdir(join(root, "apps/mobile/app"), { recursive: true });
  await writeFile(
    join(root, "apps/mobile/app/screen.ts"),
    'import "@kontave/desktop";',
  );
  await packageFixture(root, "packages/catalog", "@kontave/catalog", {
    "domain/model.ts": 'import "../index"; export {};',
    "application/service.ts": "export {};",
    "index.ts": 'export * from "./application/service";',
  });
  const violations = await auditWorkspace(root);
  assert.equal(
    violations.some((violation) =>
      violation.includes(
        "apps/mobile/app/screen.ts imports application package '@kontave/desktop'",
      ),
    ),
    true,
  );
  assert.equal(
    violations.some((violation) =>
      violation.includes(
        "domain layer reaches a non-domain layer through '../index'",
      ),
    ),
    true,
  );
});

test("understands conditional exports and indirect local adapter barrel bindings", async () => {
  const root = await fixture();
  await packageFixture(
    root,
    "packages/conditional",
    "@kontave/conditional",
    {
      "adapters/node.ts": "export const nodeAdapter = {};",
      "index.ts":
        'import { nodeAdapter } from "./adapters/node"; export { nodeAdapter };',
    },
    {
      ".": { types: "./src/index.ts", default: "./dist/index.js" },
      "./node": {
        types: "./src/adapters/node.ts",
        default: "./dist/adapters/node.js",
      },
    },
  );
  const violations = await auditWorkspace(root);
  assert.equal(
    violations.some(
      (violation) =>
        violation.includes("packages/conditional/package.json") &&
        violation.includes("transitively exposes adapter, infrastructure"),
    ),
    true,
  );
});

test("domain cannot import external or self application exports", async () => {
  const root = await fixture();
  await packageFixture(
    root,
    "packages/a",
    "@kontave/a",
    {
      "domain/index.ts":
        'import "@kontave/a/application"; import "@kontave/b/application";',
      "application/index.ts": "export {};",
      "index.ts": "export {};",
    },
    { ".": "./src/index.ts", "./application": "./src/application/index.ts" },
  );
  await packageFixture(
    root,
    "packages/b",
    "@kontave/b",
    {
      "application/index.ts": "export {};",
      "index.ts": "export {};",
    },
    { ".": "./src/index.ts", "./application": "./src/application/index.ts" },
  );
  const violations = await auditWorkspace(root);
  for (const name of ["a", "b"]) {
    assert.ok(
      violations.some((message) =>
        message.includes(
          `domain layer reaches a non-domain layer through '@kontave/${name}/application'`,
        ),
      ),
    );
  }
});

test("application cannot reach adapters through a private local barrel or package import alias", async () => {
  const root = await fixture();
  await packageFixture(root, "packages/a", "@kontave/a", {
    "application/index.ts": 'import "../internal"; import "#adapter";',
    "internal.ts": 'export * from "./adapters/source";',
    "adapters/source.ts": "export {};",
    "index.ts": "export {};",
  });
  await writeFile(
    join(root, "packages/a/package.json"),
    JSON.stringify({
      name: "@kontave/a",
      exports: { ".": "./src/index.ts" },
      imports: {
        "#adapter": {
          types: "./src/adapters/source.ts",
          default: "./dist/adapters/source.js",
        },
      },
    }),
  );
  const violations = await auditWorkspace(root);
  assert.ok(
    violations.some((message) =>
      message.includes(
        "application layer reaches infrastructure through '../internal'",
      ),
    ),
  );
  assert.ok(
    violations.some((message) =>
      message.includes(
        "application layer imports adapters workspace export '#adapter'",
      ),
    ),
  );
});

test("wildcard public subpaths still enforce the resolved target layer", async () => {
  const root = await fixture();
  await packageFixture(root, "packages/a", "@kontave/a", {
    "domain/index.ts": 'import "@kontave/b/adapters/store";',
    "index.ts": "export {};",
  });
  await packageFixture(
    root,
    "packages/b",
    "@kontave/b",
    {
      "adapters/store.ts": "export {};",
      "index.ts": "export {};",
    },
    { ".": "./src/index.ts", "./adapters/*": "./src/adapters/*.ts" },
  );
  const violations = await auditWorkspace(root);
  assert.ok(
    violations.some((message) =>
      message.includes(
        "domain layer imports adapters workspace export '@kontave/b/adapters/store'",
      ),
    ),
  );
  assert.ok(
    !violations.some((message) => message.includes("private workspace path")),
  );
});

test("UI contracts stay portable while renderer adapters may import React", async () => {
  const root = await fixture();
  await packageFixture(root, "packages/ui/core", "@kontave/ui", {
    "index.ts": 'import "react";',
  });
  await packageFixture(root, "packages/ui/dom", "@kontave/ui-dom", {
    "index.ts": 'import "react";',
  });
  const violations = await auditWorkspace(root);
  assert.ok(
    violations.some((message) =>
      message.includes("packages/ui/core/package.json portable export"),
    ),
  );
  assert.ok(
    !violations.some((message) =>
      message.includes("packages/ui/dom/package.json portable export"),
    ),
  );
});

test("runtime manifest dependencies cannot form an otherwise unused package cycle", async () => {
  const root = await fixture();
  for (const [name, other] of [
    ["a", "b"],
    ["b", "a"],
  ]) {
    await packageFixture(root, `packages/${name}`, `@kontave/${name}`, {
      "index.ts": "export {};",
    });
    await writeFile(
      join(root, `packages/${name}/package.json`),
      JSON.stringify({
        name: `@kontave/${name}`,
        dependencies: { [`@kontave/${other}`]: "workspace:*" },
      }),
    );
  }
  assert.ok(
    (await auditWorkspace(root)).some((message) =>
      message.includes("Workspace package cycle:"),
    ),
  );
});
