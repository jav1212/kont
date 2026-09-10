import assert from 'node:assert/strict';
import test from 'node:test';
import { isBarcodeSessionActive, type BarcodeSessionPolicyInput } from './barcode-session-policy';

const now = Date.parse('2026-09-10T12:00:00.000Z');
const active = (): BarcodeSessionPolicyInput => ({ status: 'active', expiresAt: '2026-09-10T20:00:00.000Z', lastActivityAt: '2026-09-10T11:59:00.000Z', terminalStatus: 'active', terminalReady: true, badgeStatus: 'active', membershipActive: true, tenantStatus: 'active', cookieTerminalId: 'terminal-a', registeredTerminalId: 'terminal-a', now });

test('permits only a current session with its enrolled terminal', () => {
    assert.equal(isBarcodeSessionActive(active()), true);
    assert.equal(isBarcodeSessionActive({ ...active(), cookieTerminalId: 'terminal-b' }), false);
    assert.equal(isBarcodeSessionActive({ ...active(), cookieTerminalId: null }), false);
});

test('denies idle, revoked, suspended, and expired session facts', () => {
    assert.equal(isBarcodeSessionActive({ ...active(), lastActivityAt: '2026-09-10T11:55:00.000Z' }), false);
    assert.equal(isBarcodeSessionActive({ ...active(), badgeStatus: 'revoked' }), false);
    assert.equal(isBarcodeSessionActive({ ...active(), membershipActive: false }), false);
    assert.equal(isBarcodeSessionActive({ ...active(), tenantStatus: 'suspended' }), false);
    assert.equal(isBarcodeSessionActive({ ...active(), tenantStatus: null }), false);
    assert.equal(isBarcodeSessionActive({ ...active(), tenantStatus: 'cancelled' }), false);
    assert.equal(isBarcodeSessionActive({ ...active(), tenantStatus: 'trial' }), true);
    assert.equal(isBarcodeSessionActive({ ...active(), expiresAt: '2026-09-10T11:59:59.000Z' }), false);
});
