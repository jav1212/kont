import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
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
