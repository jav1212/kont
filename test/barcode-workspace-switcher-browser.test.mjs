import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(new URL("../package.json", import.meta.url));
const { build } = createRequire(require.resolve("tsx"))("esbuild");
const { chromium } = createRequire(new URL("../tooling/ui-smoke/package.json", import.meta.url))("@playwright/test");

test("a workspace badge exchange preserves rejection and replaces the authorized actor", { timeout: 20_000 }, async () => {
  const bundle = await build({
    absWorkingDir: root, bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"', "process.env.NEXT_PUBLIC_DEVICE_MANAGER_URL": "undefined" },
    stdin: { resolveDir: root, loader: "tsx", contents: `
      import React, { useEffect } from 'react'; import { createRoot } from 'react-dom/client';
      import { DeviceManagerProvider } from './src/shared/frontend/devices/device-manager-provider';
      import { WorkspaceBarcodeSessionSwitcher } from './src/modules/auth/frontend/components/workspace-barcode-session-switcher';
      import { useAuth } from './src/modules/auth/frontend/hooks/use-auth';
      if (!localStorage.getItem('fixture-initialized')) { localStorage.setItem('fixture-initialized', 'true'); localStorage.setItem('kontave.devices.enabled', 'true'); localStorage.setItem('kont-active-tenant-id', 'tenant-a'); localStorage.setItem('kont-company-id', 'company-a'); localStorage.setItem('kont-active-module', 'sales'); localStorage.setItem('sidebar-module', 'sales'); localStorage.setItem('kont-session-user-id', 'operator-old'); }
      window.WebSocket = class { static OPEN = 1; readyState = 0; close() {} };
      const interaction = { getSnapshot: () => ({ activeBlock: null }), acquire: () => ({ release: () => window.releases = (window.releases || 0) + 1 }) };
      function Probe() { const auth = useAuth(); window.actor = auth.user?.id ?? null; useEffect(() => { if (auth.user) sessionStorage.setItem('actor-before-navigation', auth.user.id); }, [auth.user]); return <><input aria-label="Scanner target" /><WorkspaceBarcodeSessionSwitcher controller={{ interaction, getSnapshot: () => ({ tenantId: 'tenant-a' }) }} active /></>; }
      createRoot(document.getElementById('root')).render(<DeviceManagerProvider><Probe /></DeviceManagerProvider>);
    ` },
    plugins: [{ name: "stubs", setup(builder) {
      builder.onResolve({ filter: /supabase-browser$/ }, () => ({ path: "supabase", namespace: "stub" }));
      builder.onResolve({ filter: /^sonner$/ }, () => ({ path: "sonner", namespace: "stub" }));
      builder.onLoad({ filter: /supabase/, namespace: "stub" }, () => ({ loader: "js", contents: `export const getSupabaseBrowser = () => ({ auth: { getSession: async () => ({ data: { session: { user: { id: 'operator-old', email: 'old@example.test' } } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } });` }));
      builder.onLoad({ filter: /sonner/, namespace: "stub" }, () => ({ loader: "js", contents: "export const toast = { error: message => window.errors.push(message) };" }));
    } }],
  });
  let mode = "reject"; let calls = 0; let header = null; let releaseSuccess;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://fixture");
    if (url.pathname === "/bundle.js") { response.setHeader("Content-Type", "text/javascript"); response.end(bundle.outputFiles[0].text); return; }
    if (url.pathname === "/tools") { response.setHeader("Content-Type", "text/html"); response.end("<title>Workspace landing</title>"); return; }
    if (url.pathname === "/mode/success") { mode = "success"; response.end(); return; }
    if (url.pathname === "/observed") { response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify({ calls, header })); return; }
    if (url.pathname === "/api/auth/barcode") { calls += 1; header = request.headers["x-tenant-id"] ?? null; if (mode === "success") await new Promise((resolve) => { releaseSuccess = resolve; }); response.statusCode = mode === "success" ? 200 : 401; response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify(mode === "success" ? { data: { user: { id: "operator-new", email: "new@example.test" }, session: { id: "session-new" } } } : { error: "No autorizado" })); return; }
    response.setHeader("Content-Type", "text/html"); response.end('<div id="root"></div><script>window.errors=[]</script><script src="/bundle.js"></script>');
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
    const page = await browser.newPage(); const origin = `http://127.0.0.1:${server.address().port}`;
    await page.goto(origin); await page.waitForFunction(() => window.actor === "operator-old", null, { timeout: 3_000 }); await page.getByLabel("Scanner target").focus();
    const scan = async () => page.evaluate(() => {
      const target = document.activeElement;
      for (const key of "KONT-AbCdEfGhIjKlMnOpQrSt_") target?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
      target?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    await scan(); await page.waitForFunction(() => window.errors.length === 1, null, { timeout: 3_000 });
    assert.equal(await page.evaluate(() => window.actor), "operator-old");
    assert.equal(await page.evaluate(() => localStorage.getItem("kont-company-id")), "company-a");
    await page.evaluate(() => fetch("/mode/success"));
    await page.evaluate(() => localStorage.setItem("kont-active-tenant-id", "tenant-from-another-tab"));
    await scan(); await scan();
    await page.waitForFunction(async () => (await (await fetch("/observed")).json()).calls === 2, null, { timeout: 3_000 });
    releaseSuccess();
    await page.waitForURL("**/tools?barcode-landing=1", { timeout: 3_000 });
    const observed = await (await page.request.get(`${origin}/observed`)).json();
    assert.equal(observed.calls, 2, "a duplicate successful read must not issue a second exchange");
    assert.equal(observed.header, "tenant-a");
    assert.equal(await page.evaluate(() => sessionStorage.getItem("actor-before-navigation")), "operator-new");
    assert.equal(await page.evaluate(() => localStorage.getItem("kont-company-id")), null);
  } finally { releaseSuccess?.(); await browser?.close(); await new Promise((resolve) => server.close(resolve)); }
});
