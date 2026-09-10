import assert from "node:assert/strict";
import test from "node:test";
import { ListSystemErrorsUseCase } from "@/src/modules/system-errors/backend/application/list-system-errors.use-case";
import { SetSystemErrorResolutionUseCase } from "@/src/modules/system-errors/backend/application/set-system-error-resolution.use-case";
import { SupabaseSystemErrorRepository } from "@/src/modules/system-errors/backend/infrastructure/repository/supabase-system-error.repository";
import { Result } from "@/src/core/domain/result";
import type {
    ListSystemErrorsInput,
    SetSystemErrorResolutionInput,
    SystemErrorPage,
    SystemErrorRecord,
    SystemErrorRepository,
} from "@/src/modules/system-errors/backend/domain/system-error";
import { isResolutionStatus } from "@/src/modules/system-errors/backend/domain/system-error";

interface RawErrorRow {
    readonly id: string;
    readonly error_code: string;
    readonly message: string;
    readonly technical_message: string | null;
    readonly stack_trace: string | null;
    readonly source: string;
    readonly route: string | null;
    readonly method: string | null;
    readonly status_code: number | null;
    readonly tenant_id: string | null;
    readonly user_id: string | null;
    readonly request_id: string | null;
    readonly metadata: Record<string, unknown>;
    readonly created_at: string;
    readonly resolution_status: "pending" | "resolved";
    readonly resolved_at: string | null;
    readonly resolved_by: string | null;
}

const rawPending: RawErrorRow = {
    id: "incident-id", error_code: "KNT-20260910-7A32E2BB", message: "Falló", technical_message: null,
    stack_trace: null, source: "client", route: null, method: null, status_code: null, tenant_id: null,
    user_id: "reporter", request_id: null, metadata: {}, created_at: "2026-09-10T00:00:00.000Z",
    resolution_status: "pending", resolved_at: null, resolved_by: null,
};

class SupabaseStub {
    public updates: Array<Record<string, unknown>> = [];
    public filters: Array<[string, string, unknown]> = [];
    public profileBatches: string[][] = [];
    public changed: RawErrorRow | null = null;
    public existing: RawErrorRow | null = rawPending;
    public listRows: RawErrorRow[] = [rawPending];
    public listError: string | null = null;

    /** Emulates the small query surface required by the system-error adapter. */
    from(table: string): unknown {
        if (table === "profiles") {
            return {
                select: () => ({
                    in: (_column: string, ids: string[]) => {
                        this.profileBatches.push(ids);
                        return Promise.resolve({
                            data: ids.map((id) => ({ id, name: `${id} name`, email: `${id}@example.com` })),
                            error: null,
                        });
                    },
                }),
            };
        }

        return {
            select: (_columns: string, options?: { count?: string }) => {
                if (options?.count) {
                    const response = {
                        data: this.listRows,
                        count: this.listRows.length,
                        error: this.listError ? { message: this.listError } : null,
                    };
                    const chain = {
                        order: () => chain,
                        range: () => chain,
                        eq: (column: string, value: unknown) => { this.filters.push(["eq", column, value]); return chain; },
                        ilike: (column: string, value: unknown) => { this.filters.push(["ilike", column, value]); return chain; },
                        then: <T>(resolve: (value: typeof response) => T | PromiseLike<T>) => Promise.resolve(response).then(resolve),
                    };
                    return chain;
                }
                const chain = {
                    eq: (column: string, value: unknown) => { this.filters.push(["eq", column, value]); return chain; },
                    maybeSingle: () => Promise.resolve({ data: this.existing, error: null }),
                };
                return chain;
            },
            update: (values: Record<string, unknown>) => {
                this.updates.push(values);
                const chain = {
                    eq: (column: string, value: unknown) => { this.filters.push(["eq", column, value]); return chain; },
                    neq: (column: string, value: unknown) => { this.filters.push(["neq", column, value]); return chain; },
                    select: () => ({ maybeSingle: () => Promise.resolve({ data: this.changed, error: null }) }),
                };
                return chain;
            },
        };
    }
}

function repositoryWith(stub: SupabaseStub): SupabaseSystemErrorRepository {
    return new SupabaseSystemErrorRepository({ instance: stub as never } as never);
}

const record: SystemErrorRecord = {
    id: "incident-id", errorCode: "KNT-20260910-7A32E2BB", message: "Falló", technicalMessage: null,
    stackTrace: null, source: "client", route: null, method: null, statusCode: null, tenantId: null,
    userId: "reporter", requestId: null, metadata: {}, createdAt: "2026-09-10T00:00:00.000Z",
    resolutionStatus: "pending", resolvedAt: null, resolvedBy: null,
    user: { id: "reporter", name: "Ana", email: "ana@example.com" }, resolver: null,
};

class FakeSystemErrorRepository implements SystemErrorRepository {
    public listInput: ListSystemErrorsInput | null = null;
    public resolutionInput: SetSystemErrorResolutionInput | null = null;

    /** @inheritdoc */
    async list(input: ListSystemErrorsInput): Promise<Result<SystemErrorPage>> {
        this.listInput = input;
        return Result.success({ items: [record], total: 1, page: input.page, pageSize: input.pageSize });
    }

    /** @inheritdoc */
    async setResolution(input: SetSystemErrorResolutionInput): Promise<Result<SystemErrorRecord | null>> {
        this.resolutionInput = input;
        return Result.success({ ...record, resolutionStatus: input.status });
    }
}

test("list use case rejects unsafe pagination before persistence", async () => {
    const repository = new FakeSystemErrorRepository();
    const result = await new ListSystemErrorsUseCase(repository).execute({ page: 0, pageSize: 25 });
    assert.equal(result.isFailure, true);
    assert.equal(repository.listInput, null);
});

test("list use case forwards valid filters and page bounds", async () => {
    const repository = new FakeSystemErrorRepository();
    const input: ListSystemErrorsInput = { status: "pending", code: "KNT-20260910", page: 2, pageSize: 25 };
    const result = await new ListSystemErrorsUseCase(repository).execute(input);
    assert.equal(result.isSuccess, true);
    assert.deepEqual(repository.listInput, input);
    assert.equal(result.getValue().items[0]?.user?.email, "ana@example.com");
});

test("resolution use case accepts only known states and authenticated actors", async () => {
    const repository = new FakeSystemErrorRepository();
    const useCase = new SetSystemErrorResolutionUseCase(repository);
    const invalid = await useCase.execute({ errorCode: record.errorCode, status: "invalid" as never, actorUserId: "admin" });
    assert.equal(invalid.isFailure, true);
    assert.equal(repository.resolutionInput, null);

    const valid: SetSystemErrorResolutionInput = { errorCode: record.errorCode, status: "resolved", actorUserId: "admin" };
    const resolved = await useCase.execute(valid);
    assert.equal(resolved.isSuccess, true);
    assert.deepEqual(repository.resolutionInput, valid);
    assert.equal(resolved.getValue()?.resolutionStatus, "resolved");
});

test("resolution status guard rejects null, scalar, and array request values", () => {
    assert.equal(isResolutionStatus(null), false);
    assert.equal(isResolutionStatus("resolved"), true);
    assert.equal(isResolutionStatus("pending"), true);
    assert.equal(isResolutionStatus("invalid"), false);
    assert.equal(isResolutionStatus(["resolved"]), false);
});

test("repository lists literal code matches and batches reporter profiles", async () => {
    const stub = new SupabaseStub();
    const result = await repositoryWith(stub).list({ code: "KNT-20260910", page: 1, pageSize: 25 });
    assert.equal(result.isSuccess, true);
    assert.deepEqual(stub.filters, [["ilike", "error_code", "%KNT-20260910%"]]);
    assert.deepEqual(stub.profileBatches, [["reporter"]]);
    assert.equal(result.getValue().items[0]?.user?.name, "reporter name");
});

test("repository conditional resolve preserves existing resolver when update is a no-op", async () => {
    const stub = new SupabaseStub();
    stub.existing = {
        ...rawPending,
        resolution_status: "resolved",
        resolved_at: "2026-09-10T12:00:00.000Z",
        resolved_by: "first-admin",
    };
    const result = await repositoryWith(stub).setResolution({
        errorCode: rawPending.error_code,
        status: "resolved",
        actorUserId: "retrying-admin",
    });

    assert.equal(result.isSuccess, true);
    assert.equal(stub.updates[0]?.resolution_status, "resolved");
    assert.deepEqual(stub.filters.slice(0, 2), [
        ["eq", "error_code", rawPending.error_code],
        ["neq", "resolution_status", "resolved"],
    ]);
    assert.equal(result.getValue()?.resolvedBy, "first-admin");
    assert.equal(result.getValue()?.resolver?.email, "first-admin@example.com");
});

test("repository reopening clears resolution metadata in its atomic conditional update", async () => {
    const stub = new SupabaseStub();
    stub.changed = rawPending;
    const result = await repositoryWith(stub).setResolution({
        errorCode: rawPending.error_code,
        status: "pending",
        actorUserId: "admin",
    });

    assert.equal(result.isSuccess, true);
    assert.deepEqual(stub.updates[0], { resolution_status: "pending", resolved_at: null, resolved_by: null });
    assert.equal(result.getValue()?.resolvedAt, null);
    assert.equal(result.getValue()?.resolver, null);
});

test("repository returns an expected failure when listing persistence fails", async () => {
    const stub = new SupabaseStub();
    stub.listError = "database unavailable";
    const result = await repositoryWith(stub).list({ page: 1, pageSize: 25 });
    assert.equal(result.isFailure, true);
    assert.equal(result.getError(), "database unavailable");
});
