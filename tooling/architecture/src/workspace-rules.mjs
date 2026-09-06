import { existsSync, statSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import {
  dirname,
  extname,
  join,
  normalize,
  relative,
  resolve,
  sep,
} from "node:path";
import ts from "typescript";

const SOURCE_EXTENSIONS = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
]);
const FRAMEWORK_OR_PLATFORM_PACKAGES =
  /^(?:node:|(?:fs|http|https|net|tls|child_process|process|axios|undici)(?:\/|$)|react(?:-dom|-native)?(?:\/|$)|next(?:\/|$)|electron(?:-|\/|$)|@supabase\/|serialport(?:\/|$)|@tauri-app\/|@react-native-async-storage\/)/;
const LAYERS = new Set([
  "domain",
  "application",
  "adapters",
  "infrastructure",
  "composition",
]);
// UI's root is checked by renderer below; its portable subpaths stay subject
// to the same transitive checks as every other inward-facing package.
const OUTER_PACKAGES = new Set(["@kontave/client-remote"]);

/**
 * Recursively lists source files below a directory.
 *
 * @param {string} root - Directory to inspect.
 * @param {(path: string) => boolean} accept - Predicate selecting returned files.
 * @returns {Promise<string[]>} Matching absolute paths.
 */
async function walk(root, accept) {
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (
      ["node_modules", "dist", "out", "release", "coverage", "build"].includes(
        entry.name,
      ) ||
      entry.name.startsWith(".")
    )
      continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path, accept)));
    else if (accept(path)) files.push(path);
  }
  return files;
}

/** @param {string} workspaceRoot @returns {Promise<Array<{manifest: object, path: string, root: string}>>} */
async function packageRecords(workspaceRoot) {
  const manifests = [];
  for (const directory of ["apps", "packages", "tooling"]) {
    for (const path of await walk(join(workspaceRoot, directory), (candidate) =>
      candidate.endsWith(`${sep}package.json`),
    )) {
      const manifest = JSON.parse(await readFile(path, "utf8"));
      if (typeof manifest.name === "string")
        manifests.push({ manifest, path, root: dirname(path) });
    }
  }
  return manifests.sort((a, b) => b.root.length - a.root.length);
}

/** @param {object} manifest @returns {string[]} */
function declaredDependencies(manifest) {
  return Object.keys({
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.optionalDependencies,
    ...manifest.peerDependencies,
  });
}

/** @param {string} file @param {string} source @returns {string[]} */
function moduleSpecifiers(file, source) {
  const script = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const values = [];
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      isLiteralModuleSpecifier(node.moduleSpecifier)
    )
      values.push(node.moduleSpecifier.text);
    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      isLiteralModuleSpecifier(node.moduleReference.expression)
    )
      values.push(node.moduleReference.expression.text);
    if (
      ts.isCallExpression(node) &&
      node.arguments.length === 1 &&
      isLiteralModuleSpecifier(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require"))
    )
      values.push(node.arguments[0].text);
    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      isLiteralModuleSpecifier(node.argument.literal)
    )
      values.push(node.argument.literal.text);
    ts.forEachChild(node, visit);
  };
  visit(script);
  return values;
}

/** @param {ts.Node} node @returns {node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral} */
function isLiteralModuleSpecifier(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

/** @param {string} path @param {string} root @returns {string | undefined} */
function layerFor(path, root) {
  const parts = relative(root, path).split(sep);
  const sourceIndex = parts.indexOf("src");
  const candidate = sourceIndex < 0 ? undefined : parts[sourceIndex + 1];
  return LAYERS.has(candidate) ? candidate : undefined;
}

/** @param {string} from @param {string} specifier @returns {string | undefined} */
function resolveLocal(from, specifier) {
  const base = resolve(dirname(from), specifier);
  const candidates = [
    base,
    ...[...SOURCE_EXTENSIONS].map((extension) => `${base}${extension}`),
    ...[...SOURCE_EXTENSIONS].map((extension) =>
      join(base, `index${extension}`),
    ),
  ];
  return candidates.find(
    (candidate) => existsSync(candidate) && statSync(candidate).isFile(),
  );
}

/** @param {string} specifier @returns {string} */
function packageNameFor(specifier) {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

/** @param {string} path @param {Array<{manifest: object, path: string, root: string}>} records */
function recordForPath(path, records) {
  return records.find(
    (record) => path === record.root || path.startsWith(`${record.root}${sep}`),
  );
}

/** @param {string} specifier @param {object} manifest @returns {boolean} */
function isPublicSpecifier(specifier, manifest) {
  const packageName = packageNameFor(specifier);
  const suffix = specifier.slice(packageName.length);
  const subpath = suffix ? `.${suffix}` : ".";
  if (!manifest.exports) return subpath === ".";
  if (Object.prototype.hasOwnProperty.call(manifest.exports, subpath))
    return true;
  return Object.keys(manifest.exports).some(
    (key) =>
      key.includes("*") &&
      new RegExp(
        `^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace("\\*", ".+")}$`,
      ).test(subpath),
  );
}

/** @param {unknown} target @returns {string | undefined} */
function sourceTarget(target) {
  if (typeof target === "string")
    return target.includes("/src/") || target.startsWith("./src/")
      ? target
      : undefined;
  if (Array.isArray(target)) return target.map(sourceTarget).find(Boolean);
  if (target && typeof target === "object") {
    const conditions = /** @type {Record<string, unknown>} */ (target);
    for (const condition of ["types", "import", "default", "node", "browser"]) {
      const source = sourceTarget(conditions[condition]);
      if (source) return source;
    }
    return Object.values(conditions).map(sourceTarget).find(Boolean);
  }
  return undefined;
}

/**
 * Collects every conditional source entry so non-default branches cannot hide leaks.
 * @param {unknown} target - An exports-map value, including nested conditions.
 * @returns {string[]} Unique source paths in declaration order.
 */
function sourceTargets(target) {
  if (typeof target === "string") return sourceTarget(target) ? [target] : [];
  if (!target || typeof target !== "object") return [];
  return [...new Set(Object.values(target).flatMap(sourceTargets))];
}

/** @param {string} key @param {{manifest: object, root: string}} record @returns {string | undefined} */
function exportedFile(key, record) {
  const exports = key.startsWith("#")
    ? record.manifest.imports
    : record.manifest.exports;
  let target = sourceTarget(exports?.[key]);
  if (!target) {
    for (const [pattern, value] of Object.entries(exports ?? {})) {
      const star = pattern.indexOf("*");
      if (star < 0) continue;
      const prefix = pattern.slice(0, star);
      const suffix = pattern.slice(star + 1);
      if (!key.startsWith(prefix) || !key.endsWith(suffix)) continue;
      const matched = key.slice(
        prefix.length,
        suffix ? -suffix.length : undefined,
      );
      target = sourceTarget(value)?.replaceAll("*", matched);
      if (target) break;
    }
  }
  const path = target ? resolve(record.root, target) : undefined;
  return path && existsSync(path) ? path : undefined;
}

/** @param {string} entry @param {{manifest: object, root: string}} record @param {Map<string, object>} byName @param {Set<string>} visited @returns {Promise<boolean>} */
async function reexportsInfrastructure(
  entry,
  record,
  byName,
  visited = new Set(),
) {
  const normalized = normalize(entry);
  if (visited.has(normalized) || !normalized.startsWith(`${record.root}${sep}`))
    return false;
  visited.add(normalized);
  if (
    ["adapters", "infrastructure"].includes(layerFor(normalized, record.root))
  )
    return true;
  const source = await readFile(normalized, "utf8");
  for (const specifier of moduleSpecifiers(normalized, source)) {
    if (FRAMEWORK_OR_PLATFORM_PACKAGES.test(specifier)) return true;
    if (specifier.startsWith(".")) {
      const target = resolveLocal(normalized, specifier);
      if (
        target &&
        (await reexportsInfrastructure(target, record, byName, visited))
      )
        return true;
      continue;
    }
    const imported = specifier.startsWith("#")
      ? record
      : byName.get(packageNameFor(specifier));
    if (!imported) continue;
    const suffix = specifier.slice(packageNameFor(specifier).length);
    const target = exportedFile(
      specifier.startsWith("#") ? specifier : suffix ? `.${suffix}` : ".",
      imported,
    );
    if (
      target &&
      (await reexportsInfrastructure(target, imported, byName, visited))
    )
      return true;
  }
  return false;
}

/** @param {string} entry @param {{manifest: object, root: string}} record @param {Map<string, object>} byName @param {Set<string>} visited @returns {Promise<boolean>} */
async function reachesNonDomainLayer(
  entry,
  record,
  byName,
  visited = new Set(),
) {
  const normalized = normalize(entry);
  if (visited.has(normalized) || !normalized.startsWith(`${record.root}${sep}`))
    return false;
  visited.add(normalized);
  const layer = layerFor(normalized, record.root);
  if (layer && layer !== "domain") return true;
  const source = await readFile(normalized, "utf8");
  for (const specifier of moduleSpecifiers(normalized, source)) {
    if (specifier.startsWith(".")) {
      const target = resolveLocal(normalized, specifier);
      if (
        target &&
        (await reachesNonDomainLayer(target, record, byName, visited))
      )
        return true;
      continue;
    }
    const imported = specifier.startsWith("#")
      ? record
      : byName.get(packageNameFor(specifier));
    if (!imported) continue;
    const suffix = specifier.slice(packageNameFor(specifier).length);
    const target = exportedFile(
      specifier.startsWith("#") ? specifier : suffix ? `.${suffix}` : ".",
      imported,
    );
    if (
      target &&
      (await reachesNonDomainLayer(target, imported, byName, visited))
    )
      return true;
  }
  return false;
}

/** @param {{manifest: object, root: string}} record @param {string} key @returns {boolean} */
function isExplicitOuterEntry(record, key) {
  const entry = exportedFile(key, record);
  return (
    Boolean(
      entry &&
      ["adapters", "infrastructure"].includes(layerFor(entry, record.root)),
    ) ||
    OUTER_PACKAGES.has(record.manifest.name) ||
    (record.manifest.name === "@kontave/ui" && key === ".")
  );
}

/**
 * Enforces UI's consumer-independent foundation and separate renderer graphs.
 * @param {{manifest: object, root: string}} record - The unified UI package.
 * @param {string} workspaceRoot - Repository root used for diagnostic paths.
 * @returns {Promise<string[]>} Boundary and conditional-export violations.
 */
async function auditUiBoundaries(record, workspaceRoot) {
  const violations = [];
  const scopes = ["core", "dom", "react-native"];
  const scopeFor = (path) =>
    scopes.find((scope) =>
      path.startsWith(`${join(record.root, scope, "src")}${sep}`),
    );
  const rootExport = record.manifest.exports?.["."];
  if (rootExport) {
    for (const [condition, scope] of [
      ["default", "dom"],
      ["react-native", "react-native"],
      ["kontave-react-native", "react-native"],
    ]) {
      const targets = sourceTargets(rootExport[condition]);
      if (
        !targets.length ||
        targets.some(
          (target) =>
            scopeFor(resolve(record.root, target)) !== scope ||
            !existsSync(resolve(record.root, target)),
        )
      )
        violations.push(
          `${relative(workspaceRoot, record.path)} UI '${condition}' export must resolve exclusively to ${scope}/src`,
        );
    }
    const keys = Object.keys(rootExport);
    if (keys.indexOf("default") !== keys.length - 1)
      violations.push(
        `${relative(workspaceRoot, record.path)} UI default condition must follow native conditions`,
      );
  }
  for (const scope of scopes) {
    const files = await walk(join(record.root, scope, "src"), (path) =>
      SOURCE_EXTENSIONS.has(extname(path)),
    );
    for (const path of files) {
      for (const specifier of moduleSpecifiers(
        path,
        await readFile(path, "utf8"),
      )) {
        const prefix = `${relative(workspaceRoot, path)} UI ${scope}`;
        const target = specifier.startsWith(".")
          ? resolveLocal(path, specifier)
          : undefined;
        const targetScope = target ? scopeFor(target) : undefined;
        if (targetScope && targetScope !== scope && targetScope !== "core")
          violations.push(
            `${prefix} imports another renderer through '${specifier}'`,
          );
        if (scope === "core" && FRAMEWORK_OR_PLATFORM_PACKAGES.test(specifier))
          violations.push(
            `${prefix} imports framework or platform dependency '${specifier}'`,
          );
        if (
          scope === "dom" &&
          /^(?:react-native(?:\/|$)|@react-native(?:-community)?\/|expo(?:-|\/|$))/.test(
            specifier,
          )
        )
          violations.push(`${prefix} imports native dependency '${specifier}'`);
        if (
          scope === "react-native" &&
          /^(?:react-dom(?:\/|$)|react-aria(?:-components)?(?:\/|$)|@react-aria\/|next(?:\/|$)|sonner$|flag-icons(?:\/|$))|\.css$/.test(
            specifier,
          )
        )
          violations.push(`${prefix} imports DOM dependency '${specifier}'`);
        if (
          specifier.startsWith("@kontave/") &&
          !["@kontave/ui/tokens", "@kontave/ui/contracts"].includes(
            specifier,
          ) &&
          !(scope !== "core" && specifier.startsWith("@kontave/brand-assets"))
        )
          violations.push(
            `${prefix} imports consumer or business dependency '${specifier}'`,
          );
      }
    }
  }
  return violations;
}

/**
 * Audits package identity and portable architecture boundaries through TypeScript ASTs.
 *
 * A source is classified by package-local `src/<layer>`: domain and application are inward
 * portable layers; adapters and infrastructure are outer layers; composition is a permitted root.
 *
 * @param {string} workspaceRoot - Absolute repository root containing apps, packages and tooling.
 * @returns {Promise<string[]>} Every actionable architecture violation.
 */
export async function auditWorkspace(workspaceRoot) {
  const records = await packageRecords(workspaceRoot);
  const violations = [];
  const byName = new Map();
  for (const record of records) {
    const previous = byName.get(record.manifest.name);
    if (previous)
      violations.push(
        `Duplicate package name '${record.manifest.name}': ${relative(workspaceRoot, previous.path)} and ${relative(workspaceRoot, record.path)}`,
      );
    else byName.set(record.manifest.name, record);
  }
  const appRoot = join(workspaceRoot, "apps");
  const appRecords = records.filter((record) =>
    record.root.startsWith(`${appRoot}${sep}`),
  );
  const appNames = new Set(appRecords.map((record) => record.manifest.name));
  const edges = new Map(
    records.map((record) => [record.manifest.name, new Set()]),
  );

  for (const record of records) {
    for (const dependency of Object.keys({
      ...record.manifest.dependencies,
      ...record.manifest.optionalDependencies,
      ...record.manifest.peerDependencies,
    })) {
      if (byName.has(dependency) && dependency !== record.manifest.name)
        edges.get(record.manifest.name).add(dependency);
    }
    for (const dependency of declaredDependencies(record.manifest)) {
      if (appNames.has(dependency) && record.manifest.name !== dependency)
        violations.push(
          `${relative(workspaceRoot, record.path)} depends on application package '${dependency}'`,
        );
    }
    const files = await walk(record.root, (path) =>
      SOURCE_EXTENSIONS.has(extname(path)),
    );
    for (const path of files) {
      if (recordForPath(path, records) !== record) continue;
      const source = await readFile(path, "utf8");
      const layer = layerFor(path, record.root);
      for (const specifier of moduleSpecifiers(path, source)) {
        const importedName = packageNameFor(specifier);
        if (appNames.has(importedName) && record.manifest.name !== importedName)
          violations.push(
            `${relative(workspaceRoot, path)} imports application package '${importedName}'`,
          );
        const importedRecord = specifier.startsWith("#")
          ? record
          : byName.get(importedName);
        if (
          importedRecord &&
          importedRecord.manifest.name !== record.manifest.name
        ) {
          if (path.startsWith(`${record.root}${sep}src${sep}`))
            edges.get(record.manifest.name).add(importedRecord.manifest.name);
          if (!isPublicSpecifier(specifier, importedRecord.manifest))
            violations.push(
              `${relative(workspaceRoot, path)} imports private workspace path '${specifier}'; import a declared export instead`,
            );
        }
        if (
          layer &&
          ["domain", "application"].includes(layer) &&
          FRAMEWORK_OR_PLATFORM_PACKAGES.test(specifier)
        )
          violations.push(
            `${relative(workspaceRoot, path)} ${layer} layer imports framework or platform dependency '${specifier}'`,
          );
        if (
          layer &&
          ["domain", "application"].includes(layer) &&
          importedRecord
        ) {
          const suffix = specifier.slice(importedName.length);
          const exported = exportedFile(
            specifier.startsWith("#") ? specifier : suffix ? `.${suffix}` : ".",
            importedRecord,
          );
          const importedLayer =
            exported && layerFor(exported, importedRecord.root);
          const leaksOuterLayer =
            exported &&
            (await reexportsInfrastructure(exported, importedRecord, byName));
          if (
            ["adapters", "infrastructure"].includes(importedLayer) ||
            leaksOuterLayer
          )
            violations.push(
              `${relative(workspaceRoot, path)} ${layer} layer imports ${importedLayer ?? "adapter or infrastructure"} workspace export '${specifier}'`,
            );
          if (
            layer === "domain" &&
            exported &&
            (await reachesNonDomainLayer(exported, importedRecord, byName))
          )
            violations.push(
              `${relative(workspaceRoot, path)} domain layer reaches a non-domain layer through '${specifier}'`,
            );
        }
        if (!specifier.startsWith(".")) continue;
        const target = resolveLocal(path, specifier);
        if (!target) continue;
        const targetRecord = recordForPath(target, records);
        if (targetRecord && targetRecord.manifest.name !== record.manifest.name)
          violations.push(
            `${relative(workspaceRoot, path)} crosses into workspace '${targetRecord.manifest.name}' through relative import '${specifier}'`,
          );
        if (
          record.root.startsWith(`${workspaceRoot}${sep}packages${sep}`) &&
          (target === workspaceRoot ||
            target.startsWith(`${workspaceRoot}${sep}app${sep}`) ||
            target.startsWith(`${workspaceRoot}${sep}src${sep}`))
        )
          violations.push(
            `${relative(workspaceRoot, path)} imports protected production Web code through '${specifier}'`,
          );
        const targetLayer = layerFor(target, record.root);
        if (layer === "domain" && targetLayer && targetLayer !== "domain")
          violations.push(
            `${relative(workspaceRoot, path)} domain layer imports ${targetLayer} layer through '${specifier}'`,
          );
        if (
          layer === "domain" &&
          !targetLayer &&
          (await reachesNonDomainLayer(target, record, byName))
        )
          violations.push(
            `${relative(workspaceRoot, path)} domain layer reaches a non-domain layer through '${specifier}'`,
          );
        if (
          layer === "application" &&
          ["adapters", "infrastructure"].includes(targetLayer)
        )
          violations.push(
            `${relative(workspaceRoot, path)} application layer imports ${targetLayer} layer through '${specifier}'`,
          );
        if (
          layer === "application" &&
          !["adapters", "infrastructure"].includes(targetLayer) &&
          (await reexportsInfrastructure(target, record, byName))
        )
          violations.push(
            `${relative(workspaceRoot, path)} application layer reaches infrastructure through '${specifier}'`,
          );
      }
    }
  }

  const visiting = new Set();
  const visited = new Set();
  const trail = [];
  const visit = (name) => {
    if (visiting.has(name)) {
      const start = trail.indexOf(name);
      violations.push(
        `Workspace package cycle: ${[...trail.slice(start), name].join(" -> ")}`,
      );
      return;
    }
    if (visited.has(name)) return;
    visiting.add(name);
    trail.push(name);
    for (const next of edges.get(name) ?? []) visit(next);
    trail.pop();
    visiting.delete(name);
    visited.add(name);
  };
  for (const name of edges.keys()) visit(name);

  for (const record of records) {
    if (record.manifest.name === "@kontave/ui")
      violations.push(...(await auditUiBoundaries(record, workspaceRoot)));
    for (const [key, target] of Object.entries(record.manifest.exports ?? {})) {
      if (!sourceTarget(target) || isExplicitOuterEntry(record, key)) continue;
      for (const source of sourceTargets(target)) {
        const entry = resolve(record.root, source);
        if (
          existsSync(entry) &&
          (await reexportsInfrastructure(entry, record, byName))
        )
          violations.push(
            `${relative(workspaceRoot, record.path)} portable export '${key}' transitively exposes adapter, infrastructure, framework, or platform code`,
          );
      }
    }
  }
  return [...new Set(violations)].sort();
}
