import assert from 'node:assert/strict';
import test from 'node:test';
import { mayExchangeBadgeInWorkspace } from './barcode-workspace-policy';

test('allows replacing an actor only inside the server-validated organization', () => {
    assert.equal(mayExchangeBadgeInWorkspace('organization-a', 'organization-a'), true);
});

test('rejects a badge from another organization before session issuance', () => {
    assert.equal(mayExchangeBadgeInWorkspace('organization-b', 'organization-a'), false);
});

test('allows a first badge sign-in from an anonymous browser', () => {
    assert.equal(mayExchangeBadgeInWorkspace('organization-a', null), true);
});

test('permits a locked or idle prior badge session only for its registered organization', () => {
    const priorRegisteredTenant = 'organization-a';
    assert.equal(mayExchangeBadgeInWorkspace(priorRegisteredTenant, 'organization-a'), true);
    assert.equal(mayExchangeBadgeInWorkspace('organization-b', priorRegisteredTenant), false);
});

test('fails closed when an existing browser session cannot be authorized', () => {
    assert.equal(mayExchangeBadgeInWorkspace('organization-a', undefined), false);
    assert.equal(mayExchangeBadgeInWorkspace('organization-a', ''), false);
});
