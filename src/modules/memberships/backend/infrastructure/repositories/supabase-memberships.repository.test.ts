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
    linkage?: 'verified' | 'mismatched_legacy' | 'foreign_role' | 'absent_organization' | 'query_failure' | 'absent_membership' | 'archived_role' | 'query_throw';
} = {}) {
    const calls: unknown[] = [];
    const queries: Array<{ table: string; filters: Array<readonly unknown[]> }> = [];
    const linkage = options.linkage ?? 'verified';
    const queryResult = (table: string) => {
        if (linkage === 'query_throw') throw new Error('unavailable');
        if (linkage === 'query_failure' && table === 'organizations') {
            return { data: null, error: { message: 'unavailable' } };
        }
        if (table === 'tenant_memberships') {
            return {
                data: {
                    tenant_id: linkage === 'mismatched_legacy' ? 'other-tenant' : input.tenantOwnerId,
                    member_id: 'member-id',
                    role: input.role,
                    accepted_at: '2026-09-11T00:00:00.000Z',
                    revoked_at: null,
                },
                error: null,
            };
        }
        if (table === 'organizations') {
            return linkage === 'absent_organization'
                ? { data: null, error: null }
                : { data: { id: 'organization-id', legacy_tenant_id: input.tenantOwnerId, status: 'active' }, error: null };
        }
        if (table === 'organization_memberships') {
            if (linkage === 'absent_membership') return { data: null, error: null };
            return {
                data: {
                    organization_id: 'organization-id',
                    user_id: 'member-id',
                    role: 'cashier',
                    role_id: 'role-id',
                    status: 'active',
                },
                error: null,
            };
        }
        if (table === 'organization_roles') {
            return {
                data: {
                    id: 'role-id',
                    organization_id: linkage === 'foreign_role' ? 'other-organization' : 'organization-id',
                    code: 'cashier',
                    status: linkage === 'archived_role' ? 'archived' : 'active',
                },
                error: null,
            };
        }
        throw new Error(`Unexpected table ${table}`);
    };
    const query = (table: string) => {
        const filters: Array<readonly unknown[]> = [];
        queries.push({ table, filters });
        const builder = {
            select: () => builder,
            eq: (...args: readonly unknown[]) => {
                filters.push(args);
                return builder;
            },
            not: (...args: readonly unknown[]) => {
                filters.push(args);
                return builder;
            },
            is: (...args: readonly unknown[]) => {
                filters.push(args);
                return builder;
            },
            maybeSingle: async () => queryResult(table),
        };
        return builder;
    };
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
        from: query,
    };
    return {
        calls,
        queries,
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
    const { repo, calls, queries } = repository();
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
    assert.deepEqual(queries.map((query) => query.table), [
        'tenant_memberships',
        'organizations',
        'organization_memberships',
        'organization_roles',
    ]);
});

test('does not report success when any required direct-member linkage is absent or mismatched', async () => {
    for (const linkage of ['mismatched_legacy', 'foreign_role', 'absent_organization', 'query_failure', 'absent_membership', 'archived_role', 'query_throw'] as const) {
        const { repo } = repository({ linkage });
        const result = await repo.createDirectMember(input);
        assert.equal(result.isFailure, true, linkage);
        assert.equal(result.getError(), 'provisioning_incomplete', linkage);
    }
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
