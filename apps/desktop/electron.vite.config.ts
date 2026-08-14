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
      return html.replace("script-src 'self';", "script-src 'self' 'unsafe-inline';");
    },
  };
}

export default defineConfig({
    main: {
      // Desktop shares the workspace environment with the production Web app.
      // Only the main process receives the Supabase configuration.
      envDir: workspaceRoot,
      envPrefix: ["MAIN_VITE_", "VITE_", "NEXT_PUBLIC_", "KONTAVE_"],
      plugins: [externalizeDepsPlugin({ exclude: ["@kontave/auth-application", "@kontave/auth-domain", "@kontave/auth-supabase"] })],
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
    renderer: { plugins: [react(), developmentContentSecurityPolicy()] },
  });
