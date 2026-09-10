/** Local UI contract smoke tests; requests are fixtures and never create real sessions. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../tooling/ui-smoke/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const origin = process.env.BARCODE_WEB_TEST_URL ?? 'http://127.0.0.1:3108';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Use a local test server.');
const browser = await chromium.launch({ headless: true });
try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    let ready = true;
    let attempts = 0;
    let finishAttempt;
    await page.route('**/api/**', async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === '/api/auth/barcode/session') {
            return route.fulfill({ json: { data: { registered: false, active: false, terminal: { ready } } } });
        }
        if (path === '/api/auth/barcode') {
            attempts++;
            await new Promise((resolve) => { finishAttempt = resolve; });
            return route.fulfill({ status: 401, json: { error: 'No se pudo validar el carnet.' } });
        }
        return route.fulfill({ status: 200, json: { data: null } });
    });
    await page.goto(`${origin}/sign-in?mode=barcode`);
    await page.getByRole('heading', { name: 'Escanea tu carnet' }).waitFor();
    assert.equal(await page.locator('input[type=email]').count(), 0);
    const credential = 'KONT-0123456789abcdefghijkl';
    await page.keyboard.type(credential, { delay: 1 });
    await page.keyboard.press('Enter');
    await page.getByRole('heading', { name: 'Validando carnet…' }).waitFor();
    await page.keyboard.type(credential, { delay: 1 });
    await page.keyboard.press('Enter');
    assert.equal(attempts, 1, 'Duplicate scans during validation must not create extra logins.');
    finishAttempt();
    await page.getByText('No se pudo validar el carnet.', { exact: true }).waitFor();
    assert.equal((await page.locator('body').innerText()).includes(credential), false);
    await page.screenshot({ path: '/private/tmp/kont-barcode-scan-smoke.png', fullPage: true });
    await page.getByRole('tab', { name: 'Correo', exact: true }).click();
    assert.equal(await page.locator('input[type=email]').count(), 1);
    assert.equal(await page.getByRole('heading', { name: 'Escanea tu carnet' }).count(), 0);
    ready = false;
    await page.goto(`${origin}/sign-in?mode=barcode`);
    await page.getByRole('heading', { name: 'Terminal no habilitada' }).waitFor();
    await page.keyboard.type(credential, { delay: 1 });
    await page.keyboard.press('Enter');
    assert.equal(attempts, 1, 'An unenrolled terminal must not subscribe to login scans.');
    console.log('PASS: explicit carnet mode, exclusive credential forms, scanner submission, duplicate suppression, generic denial without credential disclosure, conventional login fallback, and unenrolled-terminal refusal.');
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
} finally {
    await browser.close();
}
