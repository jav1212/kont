/** Local UI contract smoke tests; requests are fixtures and never create real sessions. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(new URL('../tooling/ui-smoke/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const origin = process.env.BARCODE_WEB_TEST_URL ?? 'http://127.0.0.1:3108';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Use a local test server.');
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
try {
    // Production's service worker must not bypass the mocked navigation/auth routes.
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
    let session = { status: 200, terminal: { ready: true } };
    let attempts = 0;
    const submittedBarcodes = [];
    const barcodeAttemptWaiters = new Map();
    const waitForBarcodeAttempt = (expected) => attempts >= expected
        ? Promise.resolve()
        : new Promise((resolve) => barcodeAttemptWaiters.set(expected, resolve));
    let finishAttempt;
    let holdTerminalCheck = false;
    let releaseTerminalCheck;
    let passwordAttempts = 0;
    let finishPasswordAttempt;
    let loginAccepted = false;
    await page.route('**/api/**', async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === '/api/auth/barcode/session') {
            if (holdTerminalCheck) await new Promise((resolve) => { releaseTerminalCheck = resolve; });
            if (session.status === 502) return route.fulfill({ status: 502, contentType: 'text/html', body: '<h1>Bad gateway</h1>' });
            return route.fulfill({ status: session.status, json: { data: { registered: false, active: false, terminal: session.terminal } } });
        }
        if (path === '/api/auth/barcode') {
            attempts++;
            barcodeAttemptWaiters.get(attempts)?.();
            barcodeAttemptWaiters.delete(attempts);
            submittedBarcodes.push(route.request().postDataJSON().barcode);
            await new Promise((resolve) => { finishAttempt = resolve; });
            if (loginAccepted) return route.fulfill({ status: 200, json: { data: { session: { id: 'fixture-barcode-session' } } } });
            return route.fulfill({ status: 401, json: { error: 'No se pudo validar el carnet.' } });
        }
        return route.fulfill({ status: 200, json: { data: null } });
    });
    await page.route('**/auth/v1/token**', async (route) => {
        passwordAttempts++;
        await new Promise((resolve) => { finishPasswordAttempt = resolve; });
        return route.fulfill({ status: 400, json: { error: 'invalid_credentials', error_description: 'Invalid login credentials' } });
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
    await waitForBarcodeAttempt(1);
    await page.getByRole('heading', { name: 'Validando carnet…' }).waitFor();
    await page.getByText('Estamos comprobando tu acceso. Espera un momento.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Código no válido', exact: true }).count(), 0);
    assert.equal(await page.getByRole('tab', { name: 'Correo', exact: true }).isDisabled(), true, 'A barcode validation must block a competing password login.');
    await page.keyboard.type(credential, { delay: 1 });
    await page.keyboard.press('Enter');
    assert.equal(attempts, 1, 'Duplicate scans during validation must not create extra logins.');
    finishAttempt();
    await page.getByText('No se pudo validar el carnet.', { exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Acceso no validado', exact: true }).waitFor();
    assert.equal((await page.locator('body').innerText()).includes(credential), false);
    await page.screenshot({ path: join(tmpdir(), 'kont-barcode-scan-smoke.png'), fullPage: true });
    await page.getByRole('tab', { name: 'Correo', exact: true }).click();
    assert.equal(await page.locator('input[type=email]').count(), 1);
    assert.equal(await page.getByRole('heading', { name: 'Escanea tu carnet' }).count(), 0);
    await page.locator('input[type=email]').fill('operator@example.test');
    await page.locator('input[type=password]').fill('test-password');
    await page.locator('input[type=password]').pressSequentially('x', { delay: 1 });
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Verificando…' }).waitFor();
    assert.equal(passwordAttempts, 1, 'Fast ordinary typing followed by Enter must keep the password login flow.');
    await page.keyboard.type(credential, { delay: 1 });
    await page.keyboard.press('Enter');
    assert.equal(attempts, 1, 'A badge read during password authentication must not create a competing barcode login.');
    assert.equal(await page.locator('input[type=email]').count(), 1, 'A badge read during password authentication must keep the password form visible.');
    assert.equal(await page.getByRole('tab', { name: 'Carnet', exact: true }).isDisabled(), true, 'Password authentication must block a competing scanner login.');
    finishPasswordAttempt();
    await page.getByText('Correo o contraseña incorrectos.', { exact: true }).waitFor();
    await page.keyboard.type(credential, { delay: 1 });
    await page.keyboard.press('Enter');
    await page.getByRole('heading', { name: 'Validando carnet…' }).waitFor();
    await waitForBarcodeAttempt(2);
    assert.equal(await page.locator('input[type=email]').count(), 0, 'A badge scan from Correo must switch to Carnet before the form can submit it.');
    assert.equal(attempts, 2, 'The first credential scanned from Correo must be submitted once.');
    finishAttempt();
    await page.getByRole('heading', { name: 'Acceso no validado', exact: true }).waitFor();
    holdTerminalCheck = true;
    await page.goto(`${origin}/sign-in`);
    await page.locator('input[type=email]').waitFor();
    await page.keyboard.type(credential, { delay: 1 });
    await page.keyboard.press('Enter');
    await page.getByRole('heading', { name: 'Verificando terminal…' }).waitFor();
    assert.equal(attempts, 2, 'The terminal check must defer, rather than lose, the first credential read from Correo.');
    holdTerminalCheck = false;
    releaseTerminalCheck();
    await page.getByRole('heading', { name: 'Validando carnet…' }).waitFor();
    await waitForBarcodeAttempt(3);
    assert.equal(attempts, 3, 'The deferred credential must authenticate once when the terminal becomes ready.');
    finishAttempt();
    await page.getByRole('heading', { name: 'Acceso no validado', exact: true }).waitFor();
    session = { status: 200, terminal: { ready: false } };
    await page.goto(`${origin}/sign-in?mode=barcode`);
    await page.getByRole('heading', { name: 'Terminal no habilitada' }).waitFor();
    session = { status: 200, terminal: { ready: false, reason: 'not_enrolled' } };
    await page.goto(`${origin}/sign-in?mode=barcode`);
    await page.getByRole('heading', { name: 'Terminal no habilitada' }).waitFor();
    await page.keyboard.type(credential, { delay: 1 });
    await page.keyboard.press('Enter');
    assert.equal(attempts, 3, 'An unenrolled terminal must not subscribe to login scans.');
    session = { status: 200, terminal: { ready: false, reason: 'revoked' } };
    await page.goto(`${origin}/sign-in?mode=barcode`);
    await page.getByRole('heading', { name: 'Terminal revocada' }).waitFor();
    assert.equal(attempts, 3, 'A revoked terminal must not subscribe to login scans.');
    session = { status: 200, terminal: { ready: false, reason: 'access_unavailable' } };
    await page.goto(`${origin}/sign-in?mode=barcode`);
    await page.getByRole('heading', { name: 'Acceso temporalmente no disponible' }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Terminal no habilitada' }).count(), 0);
    assert.equal(attempts, 3, 'An unavailable access service must not subscribe to login scans.');
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
        await waitForBarcodeAttempt(capsLock ? 5 : 4);
        assert.equal(submittedBarcodes.at(-1), mixedCredential, 'Keyboard layout must not alter the credential submitted to authentication.');
        finishAttempt();
        await page.getByText('No se pudo validar el carnet.', { exact: true }).waitFor();
        assert.equal((await page.locator('body').innerText()).includes(mixedCredential), false);
    }
    assert.equal(attempts, 5, 'Each complete keyboard scan must create exactly one login request.');
    loginAccepted = true;
    let finishLanding;
    await page.route('**/tools?barcode-landing=1', async (route) => {
        await new Promise((resolve) => { finishLanding = resolve; });
        return route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Landing fixture</title>' });
    });
    await page.keyboard.type(credential, { delay: 1 });
    await page.keyboard.press('Enter');
    await page.getByRole('heading', { name: 'Validando carnet…' }).waitFor();
    const landingRequest = page.waitForRequest((request) => new URL(request.url()).pathname === '/tools' && request.isNavigationRequest());
    void landingRequest.catch(() => {});
    await waitForBarcodeAttempt(6);
    finishAttempt();
    await page.getByRole('heading', { name: 'Acceso concedido', exact: true }).waitFor();
    await page.getByText('Abriendo tu espacio de trabajo…', { exact: true }).waitFor();
    const destination = await landingRequest;
    assert.equal(new URL(destination.url()).searchParams.get('barcode-landing'), '1');
    await page.keyboard.type(credential, { delay: 1 });
    await page.keyboard.press('Enter');
    assert.equal(attempts, 6, 'A confirmed login must ignore new scans while its destination is loading.');
    finishLanding();
    await page.waitForURL('**/tools?barcode-landing=1');
    console.log('PASS: automatic badge detection from Correo, normal password Enter, authentication concurrency, pending terminal scan, invalid format feedback, server denial, success navigation, duplicate suppression, terminal recovery, and Spanish keyboard/Caps Lock credential preservation.');
} catch (error) {
    console.error(error.stack);
    process.exitCode = 1;
} finally {
    await browser.close();
}
