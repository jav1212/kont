import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Native clients and portable workspaces keep the common React/TypeScript
// checks, but Next.js routing and bundler conventions belong to the root Web.
const nativeWorkspaceRules = Object.fromEntries(
  nextVitals.flatMap((config) =>
    Object.keys(config.rules ?? {})
      .filter((rule) => rule.startsWith("@next/next/"))
      .map((rule) => [rule, "off"]),
  ),
);

const productionTestingImports = [
  {
    group: ["@kontave/*/testing"],
    message: "La subruta /testing es solo para pruebas; no la importes en producción.",
  },
];

const clientInfrastructureMessage =
  "Los adaptadores de infraestructura solo se importan desde app/api o src/**/backend; expón los datos mediante una ruta API.";

// Legacy backend/domain modules are framework-free, and type-only imports are
// erased at build time; neither can carry adapters or service-role code.
const clientInfrastructureImports = [
  {
    group: [
      "@kontave/*/supabase",
      "@kontave/*/postgres",
      "@kontave/*/adapters/*",
      "@kontave/*/node",
      "@kontave/monetary/monitor-bcv",
      "@/src/client-api/**",
      "@/src/shared/backend/**",
      "server-only",
    ],
    allowTypeImports: true,
    message: clientInfrastructureMessage,
  },
  {
    // gitignore-style groups cannot re-include a child of an excluded folder.
    regex: "^@/src/modules/[^/]+/backend/(?!domain/)",
    allowTypeImports: true,
    message: clientInfrastructureMessage,
  },
];

// app/ mixes Server and Client Components, so only files declaring
// "use client" are restricted there; src/**/frontend is client-only by layout.
const clientDirectiveInfrastructureImport =
  "Program:has(> ExpressionStatement[directive='use client']) > ImportDeclaration[importKind!='type'][source.value=/^(@kontave\\/[a-z0-9-]+\\/(supabase|postgres|node|adapters\\/.+)|@kontave\\/monetary\\/monitor-bcv|@\\/src\\/(client-api|shared\\/backend)(\\/.*)?|@\\/src\\/modules\\/[a-z0-9-]+\\/backend\\/(?!domain\\/).+|server-only)$/]";

const testFiles = ["**/*.test.{ts,tsx}", "test/**"];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Flat config replaces a rule's options per matching block instead of
  // merging them, so the client block repeats the testing patterns and comes last.
  {
    files: ["app/**/*.{ts,tsx}", "src/**/*.{ts,tsx}", "middleware.ts", "instrumentation.ts"],
    ignores: testFiles,
    rules: {
      "@typescript-eslint/no-restricted-imports": ["error", { patterns: productionTestingImports }],
    },
  },
  {
    files: ["src/**/frontend/**/*.{ts,tsx}"],
    ignores: testFiles,
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        { patterns: [...clientInfrastructureImports, ...productionTestingImports] },
      ],
    },
  },
  {
    files: [
      "packages/**/*.{js,jsx,mjs,ts,tsx,mts,cts}",
      "apps/**/*.{js,jsx,mjs,ts,tsx,mts,cts}",
      "tooling/**/*.{js,jsx,mjs,ts,tsx,mts,cts}",
    ],
    rules: nativeWorkspaceRules,
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "apps/*/out/**",
    "apps/*/release/**",
    "tooling/*/out/**",
    "next-env.d.ts",
    // Generated service worker — not editable source
    "public/sw.js",
    "public/workbox-*.js",
  ]),
  {
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "ImportDeclaration[source.value=/^\\.\\.?\\/.*\\.js$/]",
          message: "Los imports TypeScript relativos deben omitir la extensión .js.",
        },
        {
          selector: "ExportNamedDeclaration[source.value=/^\\.\\.?\\/.*\\.js$/], ExportAllDeclaration[source.value=/^\\.\\.?\\/.*\\.js$/]",
          message: "Los exports TypeScript relativos deben omitir la extensión .js.",
        },
        {
          selector: "ImportExpression[source.value=/^\\.\\.?\\/.*\\.js$/]",
          message: "Los imports dinámicos TypeScript relativos deben omitir la extensión .js.",
        },
        {
          selector: clientDirectiveInfrastructureImport,
          message: clientInfrastructureMessage,
        },
      ],
      // Honor _ prefix convention: _name signals intentionally unused
      "@typescript-eslint/no-unused-vars": ["warn", {
        varsIgnorePattern: "^_",
        argsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
    },
  },
]);

export default eslintConfig;
