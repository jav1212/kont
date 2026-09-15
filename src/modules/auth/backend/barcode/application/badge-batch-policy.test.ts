import assert from 'node:assert/strict';
import test from 'node:test';
import { parseBadgeBatchCommand, parseBadgePrintCommand } from './badge-batch-policy';

const firstUser = '51b798a6-df21-4b09-9aae-28e844d39f77';
const secondUser = 'cc8a8806-c17b-496e-92b6-258102e4d124';

test('accepts unique bounded IDs and requires explicit replacement consent', () => {
    assert.deepEqual(parseBadgeBatchCommand({ userIds: [firstUser, secondUser] }, 2), {
        userIds: [firstUser, secondUser],
        replaceExisting: false,
    });
    assert.deepEqual(parseBadgeBatchCommand({ userIds: [firstUser], replaceExisting: true }, 2), {
        userIds: [firstUser],
        replaceExisting: true,
    });
});

test('rejects duplicate, malformed, oversized, and non-boolean batch requests', () => {
    assert.equal(parseBadgeBatchCommand({ userIds: [firstUser, firstUser] }, 2), null);
    assert.equal(parseBadgeBatchCommand({ userIds: ['not-a-uuid'] }, 2), null);
    assert.equal(parseBadgeBatchCommand({ userIds: [firstUser, secondUser], replaceExisting: 'true' }, 2), null);
    assert.equal(parseBadgeBatchCommand({ userIds: [firstUser, secondUser] }, 1), null);
});

test('accepts a bounded selected badge export and rejects malformed selections', () => {
    assert.deepEqual(parseBadgePrintCommand({ badgeIds: [secondUser, firstUser] }, 2), {
        badgeIds: [secondUser, firstUser],
    });
    assert.equal(parseBadgePrintCommand({}, 2), null);
    assert.equal(parseBadgePrintCommand({ badgeIds: [firstUser, firstUser] }, 2), null);
    assert.equal(parseBadgePrintCommand({ badgeIds: ['not-a-uuid'] }, 2), null);
    assert.equal(parseBadgePrintCommand({ badgeIds: [firstUser, secondUser] }, 1), null);
});
