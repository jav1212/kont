import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

const desktopRoot = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(desktopRoot, "../..");

function developmentContentSecurityPolicy(): Plugin {
  return {
    name: "kontave-development-content-security-policy",
    apply: "serve",
    transformIndexHtml(html) {
      // React Fast Refresh injects a local inline preamble in development.
      // Packaged builds retain the strict policy declared in index.html.
      return html.replace(
        "script-src 'self';",
        "script-src 'self' 'unsafe-inline';",
      );
    },
  };
}

export default defineConfig({
  main: {
    // Desktop shares the workspace environment with the production Web app.
    // Only the main process receives the Supabase configuration.
    envDir: workspaceRoot,
    envPrefix: ["MAIN_VITE_", "VITE_", "NEXT_PUBLIC_", "KONTAVE_"],
    plugins: [
      externalizeDepsPlugin({
        exclude: [
          // electron-vite matches dependency package names, not export subpaths.
          // Bundle workspace packages so Electron never loads their TypeScript
          // source exports directly through Node's strip-only loader.
          "@kontave/access-control",
          "@kontave/auth",
          "@kontave/client-connectivity",
          "@kontave/client-contracts",
          "@kontave/client-remote",
          "@kontave/client-runtime",
          "@kontave/client-updates",
          "@kontave/delegated-access",
          "@kontave/devices",
          "@kontave/monetary",
          "@kontave/operation-context",
          "@kontave/organizations",
          "@kontave/workspace-context-application",
        ],
      }),
    ],
  },
  preload: {
    // Sandboxed preload scripts must be self-contained CommonJS bundles.
    build: {
      lib: {
        entry: resolve(desktopRoot, "src/preload/index.ts"),
        formats: ["cjs"],
        fileName: () => "index.js",
      },
    },
  },
  renderer: {
    plugins: [react(), developmentContentSecurityPolicy()],
    resolve: {
      // Workspace UI is linked during development; ensure it shares Desktop's
      // React runtime instead of bundling a second copy from its own package.
      dedupe: ["react", "react-dom"],
    },
  },
});
