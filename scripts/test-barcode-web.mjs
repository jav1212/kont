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
    let session = { status: 200, terminal: { ready: true } };
    let attempts = 0;
    let finishAttempt;
    await page.route('**/api/**', async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === '/api/auth/barcode/session') {
            if (session.status === 502) return route.fulfill({ status: 502, contentType: 'text/html', body: '<h1>Bad gateway</h1>' });
            return route.fulfill({ status: session.status, json: { data: { registered: false, active: false, terminal: session.terminal } } });
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
    session = { status: 200, terminal: { ready: false } };
    await page.goto(`${origin}/sign-in?mode=barcode`);
    await page.getByRole('heading', { name: 'Terminal no habilitada' }).waitFor();
    session = { status: 200, terminal: { ready: false, reason: 'not_enrolled' } };
    await page.goto(`${origin}/sign-in?mode=barcode`);
    await page.getByRole('heading', { name: 'Terminal no habilitada' }).waitFor();
    await page.keyboard.type(credential, { delay: 1 });
    await page.keyboard.press('Enter');
    assert.equal(attempts, 1, 'An unenrolled terminal must not subscribe to login scans.');
    session = { status: 200, terminal: { ready: false, reason: 'revoked' } };
    await page.goto(`${origin}/sign-in?mode=barcode`);
    await page.getByRole('heading', { name: 'Terminal revocada' }).waitFor();
    assert.equal(attempts, 1, 'A revoked terminal must not subscribe to login scans.');
    session = { status: 200, terminal: { ready: false, reason: 'access_unavailable' } };
    await page.goto(`${origin}/sign-in?mode=barcode`);
    await page.getByRole('heading', { name: 'Acceso temporalmente no disponible' }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Terminal no habilitada' }).count(), 0);
    assert.equal(attempts, 1, 'An unavailable access service must not subscribe to login scans.');
    session = { status: 503, terminal: { ready: false } };
    await page.goto(`${origin}/sign-in?mode=barcode`);
    await page.getByRole('heading', { name: 'Acceso temporalmente no disponible' }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Terminal no habilitada' }).count(), 0, 'Server errors must not be presented as an unenrolled browser.');
    session = { status: 502, terminal: { ready: false } };
    await page.goto(`${origin}/sign-in?mode=barcode`);
    await page.getByRole('heading', { name: 'Acceso temporalmente no disponible' }).waitFor();
    session = { status: 200, terminal: { ready: true } };
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await page.getByRole('heading', { name: 'Escanea tu carnet' }).waitFor();
    assert.equal(await page.getByText('No se pudo validar el carnet.', { exact: true }).count(), 0, 'Retry must clear an earlier scan error.');
    console.log('PASS: explicit carnet mode, exclusive credential forms, scanner submission, duplicate suppression, generic denial without credential disclosure, conventional login fallback, terminal reasons, temporary server failures, and retry recovery.');
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
} finally {
    await browser.close();
}
