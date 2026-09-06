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

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
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
    "next-env.d.ts",
    // Generated service worker — not editable source
    "public/sw.js",
    "public/workbox-*.js",
    // Skill kits ship as runnable JSX templates — not part of the app build
    ".claude/skills/**",
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
