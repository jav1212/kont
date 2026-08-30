import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";

const SOURCE_EXTENSIONS = new Set([".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const IMPORT_PATTERN = /(?:from\s*|import\s*\(|require\s*\()\s*["']([^"']+)["']/g;

async function walk(root, accept) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path, accept));
    else if (accept(path)) files.push(path);
  }
  return files;
}

async function packageRecords(workspaceRoot) {
  const manifests = [];
  for (const directory of ["apps", "packages", "tooling"]) {
    const root = join(workspaceRoot, directory);
    for (const path of await walk(root, (candidate) => candidate.endsWith(`${sep}package.json`))) {
      const manifest = JSON.parse(await readFile(path, "utf8"));
      if (typeof manifest.name === "string") manifests.push({ manifest, path, root: dirname(path) });
    }
  }
  return manifests;
}

function declaredDependencies(manifest) {
  return Object.keys({
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.optionalDependencies,
    ...manifest.peerDependencies,
  });
}

/**
 * Audits workspace package identity and application dependency boundaries.
 *
 * @param workspaceRoot - Absolute repository root containing apps, packages and tooling.
 * @returns A promise resolving to every detected architecture violation.
 */
export async function auditWorkspace(workspaceRoot) {
  const records = await packageRecords(workspaceRoot);
  const violations = [];
  const byName = new Map();
  for (const record of records) {
    const previous = byName.get(record.manifest.name);
    if (previous) violations.push(`Duplicate package name '${record.manifest.name}': ${relative(workspaceRoot, previous.path)} and ${relative(workspaceRoot, record.path)}`);
    else byName.set(record.manifest.name, record);
  }

  const appRoot = join(workspaceRoot, "apps");
  const appRecords = records.filter((record) => record.root.startsWith(`${appRoot}${sep}`));
  const appNames = new Set(appRecords.map((record) => record.manifest.name));
  for (const record of records) {
    for (const dependency of declaredDependencies(record.manifest)) {
      if (!appNames.has(dependency)) continue;
      const ownerIsSameApp = record.manifest.name === dependency && record.root.startsWith(`${appRoot}${sep}`);
      if (!ownerIsSameApp) violations.push(`${relative(workspaceRoot, record.path)} depends on application package '${dependency}'`);
    }
  }

  for (const directory of ["apps", "packages"]) {
    const sourceRoot = join(workspaceRoot, directory);
    const files = await walk(sourceRoot, (path) => SOURCE_EXTENSIONS.has(extname(path)));
    for (const path of files) {
      const source = await readFile(path, "utf8");
      for (const match of source.matchAll(IMPORT_PATTERN)) {
        const specifier = match[1];
        if (appNames.has(specifier)) violations.push(`${relative(workspaceRoot, path)} imports application package '${specifier}'`);
        if (!specifier.startsWith(".")) continue;
        const target = resolve(dirname(path), specifier);
        if (directory === "packages" && (target === appRoot || target.startsWith(`${appRoot}${sep}`))) {
          violations.push(`${relative(workspaceRoot, path)} imports from apps/ through '${specifier}'`);
        }
        if (directory === "apps" && target.startsWith(`${appRoot}${sep}`)) {
          const owner = appRecords.find((record) => path.startsWith(`${record.root}${sep}`));
          if (owner && !target.startsWith(`${owner.root}${sep}`)) violations.push(`${relative(workspaceRoot, path)} imports another application through '${specifier}'`);
        }
      }
    }
  }
  return violations;
}
