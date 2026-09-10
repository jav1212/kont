import assert from "node:assert/strict";
import test from "node:test";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";
import { SupabaseMembershipsRepository } from "./supabase-memberships.repository";

const input = {
    tenantOwnerId: '11111111-1111-1111-1111-111111111111',
    invitedBy: '22222222-2222-2222-2222-222222222222',
    email: 'cajero@example.com',
    password: 'secure-password',
    role: 'cajero' as const,
};

function repository(options: {
    ready?: boolean;
    readinessError?: unknown;
    createResult?: unknown;
    rpcThrows?: boolean;
    createThrows?: boolean;
} = {}) {
    const calls: unknown[] = [];
    const client = {
        rpc: async () => {
            if (options.rpcThrows) throw new Error('network unavailable');
            return { data: options.ready ?? true, error: options.readinessError ?? null };
        },
        auth: {
            admin: {
                createUser: async (attributes: unknown) => {
                    calls.push(attributes);
                    if (options.createThrows) throw new Error('network unavailable');
                    return options.createResult ?? {
                        data: { user: { id: 'member-id', email: 'cajero@example.com' } },
                        error: null,
                    };
                },
            },
        },
    };
    return {
        calls,
        repo: new SupabaseMembershipsRepository({ instance: client } as unknown as ServerSupabaseSource),
    };
}

test('readiness failures prevent Auth creation', async () => {
    for (const options of [{ ready: false }, { readinessError: { code: 'PGRST202' } }, { rpcThrows: true }]) {
        const { repo, calls } = repository(options);
        const result = await repo.createDirectMember(input);
        assert.equal(result.getError(), options.rpcThrows ? 'auth_create_failed' : 'provisioning_unavailable');
        assert.equal(calls.length, 0);
    }
});

test('creates a confirmed user with only trusted provisioning app metadata', async () => {
    const { repo, calls } = repository();
    const result = await repo.createDirectMember(input);

    assert.deepEqual(result.getValue(), { id: 'member-id', email: 'cajero@example.com', role: 'cajero' });
    assert.deepEqual(calls, [{
        email: 'cajero@example.com',
        password: 'secure-password',
        email_confirm: true,
        app_metadata: {
            provisioned_membership: {
                tenant_id: input.tenantOwnerId,
                role: 'cajero',
                invited_by: input.invitedBy,
            },
        },
    }]);
});

test('maps only explicit provider error codes to safe expected failures', async () => {
    const cases = [
        ['email_exists', 'email_already_exists'],
        ['user_already_exists', 'email_already_exists'],
        ['weak_password', 'password_requirements'],
        ['password_too_short', 'invalid_password'],
        ['email_address_invalid', 'invalid_email'],
        ['unknown_code', 'auth_create_failed'],
    ] as const;

    for (const [code, expected] of cases) {
        const { repo } = repository({ createResult: { data: { user: null }, error: { code, message: 'provider detail' } } });
        const result = await repo.createDirectMember(input);
        assert.equal(result.getError(), expected);
    }
});

test('converts unexpected Auth client failures into a generic failure', async () => {
    const { repo } = repository({ createThrows: true });
    const result = await repo.createDirectMember(input);
    assert.equal(result.getError(), 'auth_create_failed');
});
