import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import test from "node:test";

// Uses existing workspace tooling; bundles the production provider and POS in
// memory, stubbing only remote data and unrelated presentation dependencies.
const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(new URL("../package.json", import.meta.url));
const { build } = createRequire(require.resolve("tsx"))("esbuild");
const { chromium, expect } = createRequire(new URL("../tooling/ui-smoke/package.json", import.meta.url))("@playwright/test");
const stubs = {
    "use-companies": "export const useCompany = () => ({ companyId: null });",
    "use-inventory": `const products = [
        { id: 'priced', name: 'Milk', code: 'MILK', barcode: '7501234567890', active: true, currentStock: 10, measureUnit: 'UND', vatType: 'exento', salePricing: { mode: 'fixed', currency: 'VES', amount: 10 } },
        { id: 'manual', name: 'Manual', code: 'MANUAL', barcode: '8901234567890', active: true, currentStock: 10, measureUnit: 'UND', vatType: 'exento' }
    ]; export const useInventory = () => ({ products, departments: [], loadingProducts: false });`,
    "use-sales": "export const useSales = () => ({ customers: [] });",
    "use-invoice-exchange-rates": "const getRate = () => 1; export const useInvoiceExchangeRates = () => ({ options: [], appliedRates: [], getRate });",
    "currency-combobox": "export const CurrencyCombobox = () => null;",
    "customer-combobox": "export const CustomerCombobox = () => null;",
    "device-status-control": "export const DeviceStatusControl = () => null;",
    "context-link": "export const ContextLink = () => null;",
    "notify": "export const notify = { error: (message) => window.failures.push(message) };",
    "report-client-error": "export const reportClientError = () => {};",
    "delivery-note-pdf": "export const generateDeliveryNotePdf = () => {};",
    "sales-invoice-pdf": "export const generateSalesInvoicePdf = () => {};",
};

test("HID restores React state across stalls, and POS owns preview focus", async () => {
    const bundle = await build({
        absWorkingDir: root, bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
        define: { "process.env.NODE_ENV": '"development"', "process.env.NEXT_PUBLIC_DEVICE_MANAGER_URL": "undefined" },
        stdin: { resolveDir: root, loader: "tsx", contents: `
            import React, { useState } from 'react';
            import { createRoot } from 'react-dom/client';
            import { DeviceManagerProvider, useDeviceSubscription } from './src/shared/frontend/devices/device-manager-provider';
            import { PosSaleScreen } from './src/modules/sales/frontend/components/pos-sale-screen';
            window.scans = []; window.failures = [];
            localStorage.setItem('kontave.devices.enabled', 'true');
            window.WebSocket = class { static OPEN = 1; readyState = 0; close() {} };
            function Probe() {
                const [text, setText] = useState('milk');
                const [number, setNumber] = useState('12.50');
                const [normalized, setNormalized] = useState('seed');
                const [revision, setRevision] = useState(0);
                useDeviceSubscription('sale', scan => window.scans.push({ barcode: scan.barcode, text, number, normalized }));
                return <><input aria-label="Text" value={text} onChange={e => setText(e.target.value)} />
                    <input aria-label="Number" type="number" value={number} onChange={e => setNumber(e.target.value)} />
                    <textarea aria-label="Normalized" value={normalized} onChange={e => setNormalized(e.target.value.replace(/[0-9]/g, ''))} />
                    <output id="state">{JSON.stringify({ text, number, normalized, revision })}</output>
                    <button onClick={() => setRevision(n => n + 1)}>Render again</button></>;
            }
            createRoot(document.getElementById('root')).render(<DeviceManagerProvider>{location.search ? <PosSaleScreen /> : <Probe />}</DeviceManagerProvider>);
        ` },
        plugins: [{ name: "fixture-data", setup(builder) {
            builder.onResolve({ filter: /./ }, args => {
                const name = args.path.split("/").at(-1);
                return stubs[name] ? { path: name, namespace: "fixture" } : undefined;
            });
            builder.onLoad({ filter: /./, namespace: "fixture" }, args => ({ contents: stubs[args.path], loader: "js" }));
        } }],
    });
    const server = createServer((request, response) => {
        response.setHeader("Content-Type", request.url === "/bundle.js" ? "text/javascript" : "text/html");
        response.end(request.url === "/bundle.js" ? bundle.outputFiles[0].text : '<div id="root"></div><script src="/bundle.js"></script>');
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    let browser;
    try {
        browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
        const page = await browser.newPage();
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        const origin = `http://127.0.0.1:${server.address().port}`;
        await page.goto(origin);
        await expect(page.getByLabel("Text")).toHaveValue("milk");

        // Create real timestamped events before dispatch. Blocking processing
        // mid-burst must not split the original event sequence or its snapshot.
        async function scan(value, stall = false) {
            await page.evaluate(({ value, stall }) => {
                const target = document.activeElement;
                const events = [...value, "Enter"].map(key => new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
                events.forEach((event, index) => {
                    if (stall && index === 3) {
                        const until = performance.now() + 90;
                        while (performance.now() < until) { /* Simulate blocked rendering. */ }
                    }
                    if (!target.dispatchEvent(event) || event.key === "Enter") return;
                    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
                        const prototype = target instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
                        const start = target.selectionStart ?? target.value.length;
                        const end = target.selectionEnd ?? start;
                        const value = target.value.slice(0, start) + event.key + target.value.slice(end);
                        Object.getOwnPropertyDescriptor(prototype, "value").set.call(target, value);
                        if (target.selectionStart !== null) target.setSelectionRange(start + 1, start + 1);
                        target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: event.key }));
                    }
                });
            }, { value, stall });
        }

        await page.getByLabel("Text").focus();
        await page.getByLabel("Text").evaluate(input => input.setSelectionRange(1, 3));
        await scan("7501234567890", true);
        await expect(page.getByLabel("Text")).toHaveValue("milk");
        assert.deepEqual(await page.getByLabel("Text").evaluate(input => [input.selectionStart, input.selectionEnd]), [1, 3]);
        assert.deepEqual(await page.evaluate(() => window.scans.map(scan => [scan.barcode, scan.text])), [["7501234567890", "milk"]]);
        await page.getByLabel("Number", { exact: true }).focus();
        await scan("7501234567890", true);
        await expect(page.getByLabel("Number", { exact: true })).toHaveValue("12.50");
        assert.equal(await page.evaluate(() => window.scans.at(-1).number), "12.50", "React state must be restored before scan delivery");
        await page.getByLabel("Normalized").focus();
        await scan("7501234567890", true);
        await page.getByRole("button", { name: "Render again" }).click();
        await expect(page.getByLabel("Normalized")).toHaveValue("seed");
        const state = JSON.parse(await page.locator("#state").textContent());
        assert.equal(state.text, "milk"); assert.equal(state.number, "12.50"); assert.equal(state.normalized, "seed");
        assert.equal(await page.evaluate(() => window.scans.length), 3);

        // Native browser defaults and discrete React input events, alongside the
        // queued-event/stall simulation above.
        await page.getByLabel("Number", { exact: true }).focus();
        await page.getByLabel("Number", { exact: true }).pressSequentially("7501234567890", { delay: 1 });
        await page.keyboard.press("Enter");
        await expect(page.getByLabel("Number", { exact: true })).toHaveValue("12.50");
        assert.equal(await page.evaluate(() => window.scans.length), 4);

        // Human typing retains normal editing, navigation, and Enter behavior.
        await page.getByLabel("Text").fill("");
        await page.getByLabel("Text").pressSequentially("manual", { delay: 80 });
        await page.keyboard.press("Enter");
        await expect(page.getByLabel("Text")).toHaveValue("manual");
        assert.equal(await page.evaluate(() => window.scans.length), 4);

        await page.goto(`${origin}/?pos`);
        const search = page.getByPlaceholder(/Escanea o busca/);
        await expect(search).toBeFocused();
        await search.fill("Milk");
        await scan("7501234567890", true);
        await expect(page.getByRole("button", { name: /Agregar (a la venta|otra unidad)/ })).toBeFocused();
        await expect(page.getByLabel("Cantidad de Milk")).toHaveCount(0);
        await expect(search).toHaveValue("Milk");
        // Repeated object identity, with editable focus moved behind the dialog.
        await search.focus();
        await scan("7501234567890", true);
        await expect(page.getByRole("button", { name: /Agregar (a la venta|otra unidad)/ })).toBeFocused();
        await page.keyboard.type("7501234567890", { delay: 1 });
        await page.keyboard.press("Enter");
        await expect(page.getByRole("button", { name: "Agregar a la venta", exact: true })).toBeFocused();
        await expect(page.getByLabel("Cantidad de Milk")).toHaveCount(0);
        await page.getByRole("button", { name: "Cerrar", exact: true }).click();
        await expect(page.getByLabel("Punto de venta: escáner listo")).toBeFocused();
        await scan("7501234567890");
        await page.getByRole("button", { name: "Agregar a la venta", exact: true }).click();
        await scan("7501234567890");
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await expect(page.getByRole("button", { name: /Agregar (a la venta|otra unidad)/ })).toBeFocused();
        await expect(page.getByLabel("Cantidad de Milk")).toHaveValue("1");
        await page.keyboard.press("Enter");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(page.getByLabel("Cantidad de Milk")).toHaveValue("2");

        await scan("8901234567890");
        const amount = page.getByLabel("Precio sin IVA", { exact: true });
        await expect(amount).toBeFocused();
        await amount.fill("12.50");
        await scan("8901234567890", true);
        await expect(amount).toHaveValue("12.50");
        await expect(amount).toBeFocused();
        await amount.press("Enter");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(page.getByLabel("Cantidad de Manual")).toHaveValue("1");

        // Manual search and unpriced entry still work without scanner focus.
        await search.fill("MANUAL");
        await search.press("Enter");
        await expect(amount).toBeFocused();
        await amount.pressSequentially("25", { delay: 80 });
        await amount.press("Enter");
        await expect(search).toBeFocused();
        await expect(page.getByLabel("Cantidad de Manual")).toHaveValue("2");
        assert.deepEqual(await page.evaluate(() => window.failures), []);
        assert.deepEqual(errors, []);
    } finally {
        await browser?.close();
        await new Promise(resolve => server.close(resolve));
    }
});
