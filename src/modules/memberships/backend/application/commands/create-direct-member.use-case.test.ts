import assert from "node:assert/strict";
import test from "node:test";
import { Result } from "@/src/core/domain/result";
import {
    CreatedDirectMember,
    CreateDirectMemberInput as RepositoryInput,
    IMembershipsRepository,
} from "../../domain/memberships-repository";
import { CreateDirectMemberUseCase } from "./create-direct-member.use-case";

function repository(result: Result<CreatedDirectMember>): {
    readonly repo: IMembershipsRepository;
    readonly calls: RepositoryInput[];
} {
    const calls: RepositoryInput[] = [];
    const repo = {
        createDirectMember: async (input: RepositoryInput) => {
            calls.push(input);
            return result;
        },
    } as unknown as IMembershipsRepository;
    return { repo, calls };
}

function input(overrides: Partial<{
    email: string;
    password: string;
    role: 'admin' | 'contador' | 'vendedor' | 'cajero';
    callerRole: string;
}> = {}) {
    return {
        tenantOwnerId: 'tenant-id',
        invitedBy: 'inviter-id',
        email: ' Cashier@Example.com ',
        password: 'secure-password',
        role: 'cajero' as const,
        callerRole: 'owner',
        ...overrides,
    };
}

test('only owner and admin can directly create members', async () => {
    const { repo, calls } = repository(Result.success({ id: 'member-id', email: 'cashier@example.com', role: 'cajero' }));
    const useCase = new CreateDirectMemberUseCase(repo);

    for (const callerRole of ['contador', 'contable', 'vendedor', 'cajero']) {
        const result = await useCase.execute(input({ callerRole }));
        assert.equal(result.isFailure, true);
        assert.equal(result.getError(), 'insufficient_permissions');
    }
    assert.equal(calls.length, 0);
});

test('admin cannot create another admin', async () => {
    const { repo, calls } = repository(Result.success({ id: 'member-id', email: 'admin@example.com', role: 'admin' }));
    const result = await new CreateDirectMemberUseCase(repo).execute(input({ callerRole: 'admin', role: 'admin' }));

    assert.equal(result.isFailure, true);
    assert.equal(result.getError(), 'admins_cannot_create_admins');
    assert.equal(calls.length, 0);
});

test('normalizes permitted roles before passing credentials to the repository', async () => {
    for (const role of ['admin', 'contador', 'vendedor', 'cajero'] as const) {
        const expected = { id: `${role}-id`, email: 'cashier@example.com', role };
        const { repo, calls } = repository(Result.success(expected));
        const result = await new CreateDirectMemberUseCase(repo).execute(input({ role }));

        assert.deepEqual(result.getValue(), expected);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].email, 'cashier@example.com');
        assert.equal(calls[0].role, role);
    }
});

test('preserves duplicate, password, and Auth provisioning failures for HTTP mapping', async () => {
    for (const failure of ['email_already_exists', 'password_requirements', 'auth_create_failed'] as const) {
        const { repo } = repository(Result.fail(failure));
        const result = await new CreateDirectMemberUseCase(repo).execute(input());
        assert.equal(result.isFailure, true);
        assert.equal(result.getError(), failure);
    }
});

test('rejects malformed credentials and roles without calling Auth', async () => {
    const { repo, calls } = repository(Result.success({ id: 'member-id', email: 'cashier@example.com', role: 'cajero' }));
    const useCase = new CreateDirectMemberUseCase(repo);

    assert.equal((await useCase.execute(input({ email: 'not-an-email' }))).getError(), 'invalid_email');
    assert.equal((await useCase.execute(input({ password: 'short' }))).getError(), 'invalid_password');
    assert.equal((await useCase.execute(input({ role: 'contable' as never }))).getError(), 'invalid_role');
    assert.equal(calls.length, 0);
});
