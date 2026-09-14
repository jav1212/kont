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
    const submittedBarcodes = [];
    let finishAttempt;
    let loginAccepted = false;
    await page.route('**/api/**', async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === '/api/auth/barcode/session') {
            if (session.status === 502) return route.fulfill({ status: 502, contentType: 'text/html', body: '<h1>Bad gateway</h1>' });
            return route.fulfill({ status: session.status, json: { data: { registered: false, active: false, terminal: session.terminal } } });
        }
        if (path === '/api/auth/barcode') {
            attempts++;
            submittedBarcodes.push(route.request().postDataJSON().barcode);
            await new Promise((resolve) => { finishAttempt = resolve; });
            if (loginAccepted) return route.fulfill({ status: 200, json: { data: { session: { id: 'fixture-barcode-session' } } } });
            return route.fulfill({ status: 401, json: { error: 'No se pudo validar el carnet.' } });
        }
        return route.fulfill({ status: 200, json: { data: null } });
    });
    await page.goto(`${origin}/sign-in?mode=barcode`);
    await page.getByRole('heading', { name: 'Escanea tu carnet' }).waitFor();
    assert.equal(await page.locator('input[type=email]').count(), 0);
    for (const invalidCode of ['7501234567890', '123']) {
        await page.keyboard.type(invalidCode, { delay: 1 });
        await page.keyboard.press('Enter');
        await page.getByRole('heading', { name: 'Código no válido', exact: true }).waitFor();
        await page.getByText('Este código no corresponde a un carnet de acceso. Escanea tu carnet.', { exact: true }).waitFor();
        assert.equal(attempts, 0, 'Invalid formats must receive immediate feedback without waiting on authentication.');
    }
    const credential = 'KONT-0123456789abcdefghijkl';
    await page.keyboard.type(credential, { delay: 1 });
    await page.keyboard.press('Enter');
    await page.getByRole('heading', { name: 'Validando carnet…' }).waitFor();
    await page.getByText('Estamos comprobando tu acceso. Espera un momento.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Código no válido', exact: true }).count(), 0);
    await page.keyboard.type(credential, { delay: 1 });
    await page.keyboard.press('Enter');
    assert.equal(attempts, 1, 'Duplicate scans during validation must not create extra logins.');
    finishAttempt();
    await page.getByText('No se pudo validar el carnet.', { exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Acceso no validado', exact: true }).waitFor();
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
    // US-configured USB scanners send physical Minus on Spanish keyboards,
    // where the browser interprets it as an apostrophe (or ? with Shift).
    const mixedCredential = 'KONT-Ab_9xY-0123456789abcde';
    for (const capsLock of [false, true]) {
        await page.evaluate(({ value, capsLock }) => {
            for (const character of value) {
                const letter = /^[A-Za-z]$/.test(character);
                // A reader configured for Caps Lock compensates letter Shift;
                // punctuation still depends only on the physical Shift state.
                const shiftKey = letter ? (character === character.toUpperCase()) !== capsLock : character === '_';
                const code = letter ? `Key${character.toUpperCase()}` : /[0-9]/.test(character) ? `Digit${character}` : 'Minus';
                const key = code === 'Minus' ? (shiftKey ? '?' : "'") : character;
                window.dispatchEvent(new KeyboardEvent('keydown', { key, code, shiftKey, modifierCapsLock: capsLock, bubbles: true, cancelable: true }));
            }
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
        }, { value: mixedCredential, capsLock });
        await page.getByRole('heading', { name: 'Validando carnet…' }).waitFor();
        assert.equal(submittedBarcodes.at(-1), mixedCredential, 'Keyboard layout must not alter the credential submitted to authentication.');
        finishAttempt();
        await page.getByText('No se pudo validar el carnet.', { exact: true }).waitFor();
        assert.equal((await page.locator('body').innerText()).includes(mixedCredential), false);
    }
    assert.equal(attempts, 3, 'Each complete keyboard scan must create exactly one login request.');
    loginAccepted = true;
    let finishLanding;
    const landingRequest = page.waitForRequest((request) => new URL(request.url()).pathname === '/tools' && request.isNavigationRequest());
    await page.route('**/tools?barcode-landing=1', async (route) => {
        await new Promise((resolve) => { finishLanding = resolve; });
        return route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Landing fixture</title>' });
    });
    await page.keyboard.type(credential, { delay: 1 });
    await page.keyboard.press('Enter');
    await page.getByRole('heading', { name: 'Validando carnet…' }).waitFor();
    finishAttempt();
    await page.getByRole('heading', { name: 'Acceso concedido', exact: true }).waitFor();
    await page.getByText('Abriendo tu espacio de trabajo…', { exact: true }).waitFor();
    const destination = await landingRequest;
    assert.equal(new URL(destination.url()).searchParams.get('barcode-landing'), '1');
    await page.keyboard.type(credential, { delay: 1 });
    await page.keyboard.press('Enter');
    assert.equal(attempts, 4, 'A confirmed login must ignore new scans while its destination is loading.');
    finishLanding();
    await page.waitForURL('**/tools?barcode-landing=1');
    console.log('PASS: invalid format feedback, server denial, validation progress, success feedback during navigation, safe workspace landing, duplicate suppression, terminal recovery, and Spanish keyboard/Caps Lock credential preservation.');
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
} finally {
    await browser.close();
}
