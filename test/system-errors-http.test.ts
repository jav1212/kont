import assert from "node:assert/strict";
import { mock, test } from "node:test";

let sessionUser: { id: string } | null = null;
let isAdmin = false;
let actionCalls = 0;
let lastActor: string | undefined;
let incidentExists = true;
let recordedContext: Record<string, unknown> | undefined;

mock.module("next/headers", {
    namedExports: { cookies: async () => ({ getAll: () => [] }) },
});
mock.module("@supabase/ssr", {
    namedExports: {
        createServerClient: () => ({
            auth: { getUser: async () => ({ data: { user: sessionUser }, error: null }) },
        }),
    },
});
mock.module("@supabase/supabase-js", {
    namedExports: {
        createClient: () => ({
            from: () => ({
                select: () => ({
                    eq: (_column: string, userId: string) => ({
                        single: async () => ({ data: isAdmin ? { id: userId } : null }),
                    }),
                }),
            }),
        }),
    },
});

const { Result } = await import("../src/core/domain/result");
mock.module("../src/modules/system-errors/backend/infrastructure/system-error-factory.ts", {
    namedExports: {
        getSystemErrorActions: () => ({
            list: {
                execute: async () => {
                    actionCalls += 1;
                    return Result.success({ items: [], total: 0, page: 1, pageSize: 25 });
                },
            },
            setResolution: {
                execute: async (input: { actorUserId: string }) => {
                    actionCalls += 1;
                    lastActor = input.actorUserId;
                    return Result.success(incidentExists ? { resolutionStatus: "resolved" } : null);
                },
            },
        }),
    },
});
mock.module("../src/shared/backend/errors/system-error.ts", {
    namedExports: {
        logSystemError: async (_error: unknown, context: Record<string, unknown>, code: string) => {
            recordedContext = context;
            return code;
        },
    },
});
mock.module("../src/shared/backend/utils/require-tenant.ts", {
    namedExports: { requireTenant: async () => ({ tenantId: "validated-tenant" }) },
});

const { GET } = await import("../app/api/admin/system-errors/route");
const { PATCH } = await import("../app/api/admin/system-errors/[errorCode]/route");
const { POST } = await import("../app/api/system-errors/route");
const { requireAdmin } = await import("../src/shared/backend/utils/require-admin");
const code = "KNT-20260910-7A32E2BB";
const context = { params: Promise.resolve({ errorCode: code }) };

function request(body: unknown): Request {
    return new Request(`https://kont.test/api/admin/system-errors/${code}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

test("administrative incident routes reject anonymous and non-admin sessions before persistence", async () => {
    for (const [user, expected] of [[null, 401], [{ id: "ordinary-user" }, 403]] as const) {
        sessionUser = user;
        isAdmin = false;
        actionCalls = 0;
        assert.equal((await GET(new Request("https://kont.test/api/admin/system-errors"))).status, expected);
        assert.equal((await PATCH(request({ status: "resolved" }), context)).status, expected);
        assert.equal(actionCalls, 0);
    }
});

test("existing requireAdmin contract remains null for a verified administrator", async () => {
    sessionUser = { id: "verified-admin" };
    isAdmin = true;
    assert.equal(await requireAdmin(new Request("https://kont.test")), null);
});

test("incident list rejects invalid filters and pagination", async () => {
    sessionUser = { id: "verified-admin" };
    isAdmin = true;
    actionCalls = 0;
    for (const query of ["status=unknown", "page=0", "page=1junk", "pageSize=101", "page=10001", "code=*"]) {
        const response = await GET(new Request(`https://kont.test/api/admin/system-errors?${query}`));
        assert.equal(response.status, 400, query);
    }
    assert.equal(actionCalls, 0);
    assert.equal((await GET(new Request("https://kont.test/api/admin/system-errors?status=pending&page=1&pageSize=25"))).status, 200);
});

test("resolution validates JSON shapes and attributes the change to the verified session", async () => {
    sessionUser = { id: "verified-admin" };
    isAdmin = true;
    for (const body of [null, [], "resolved", {}, { status: "unknown" }]) {
        assert.equal((await PATCH(request(body), context)).status, 400);
    }
    assert.equal((await PATCH(request({ status: "resolved", actorUserId: "forged-admin" }), context)).status, 200);
    assert.equal(lastActor, "verified-admin");
    incidentExists = false;
    assert.equal((await PATCH(request({ status: "pending" }), context)).status, 404);
    incidentExists = true;
});

test("client incident reporting discards client-supplied user identity", async () => {
    const response = await POST(new Request("https://kont.test/api/system-errors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, message: "Test incident", userId: "forged-user" }),
    }));
    assert.equal(response.status, 200);
    assert.ok(recordedContext);
    assert.equal(Object.hasOwn(recordedContext, "userId"), false);
    assert.equal(recordedContext.tenantId, "validated-tenant");
});
