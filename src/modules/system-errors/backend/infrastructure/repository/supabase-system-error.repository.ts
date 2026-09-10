import type { SupabaseClient } from "@supabase/supabase-js";
import { Result } from "@/src/core/domain/result";
import type { ISource } from "@/src/shared/backend/source/domain/repository/source.repository";
import type {
    ListSystemErrorsInput,
    ResolutionStatus,
    SetSystemErrorResolutionInput,
    SystemErrorPage,
    SystemErrorRecord,
    SystemErrorRepository,
    SystemErrorUser,
} from "../../domain/system-error";

interface ErrorLogRow {
    id: string;
    error_code: string;
    message: string;
    technical_message: string | null;
    stack_trace: string | null;
    source: string;
    route: string | null;
    method: string | null;
    status_code: number | null;
    tenant_id: string | null;
    user_id: string | null;
    request_id: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
    resolution_status: ResolutionStatus;
    resolved_at: string | null;
    resolved_by: string | null;
}

interface ProfileRow {
    id: string;
    name: string | null;
    email: string | null;
}

const ERROR_LOG_COLUMNS = "id,error_code,message,technical_message,stack_trace,source,route,method,status_code,tenant_id,user_id,request_id,metadata,created_at,resolution_status,resolved_at,resolved_by";

/** Escapes a literal value before it is embedded in a PostgREST ILIKE pattern. */
function escapeIlikeLiteral(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/** Server-side Supabase adapter for administrative system-error operations. */
export class SupabaseSystemErrorRepository implements SystemErrorRepository {
    /**
     * Creates the repository around a service-role source.
     * @param source - Server-only source that owns Supabase credentials.
     */
    constructor(private readonly source: ISource<SupabaseClient>) {}

    /** {@inheritDoc SystemErrorRepository.list} */
    async list(input: ListSystemErrorsInput): Promise<Result<SystemErrorPage>> {
        try {
            const from = (input.page - 1) * input.pageSize;
            const to = from + input.pageSize - 1;
            let query = this.source.instance
                .from("system_error_logs")
                .select(ERROR_LOG_COLUMNS, { count: "exact" })
                .order("created_at", { ascending: false })
                .order("id", { ascending: false })
                .range(from, to);

            if (input.status) query = query.eq("resolution_status", input.status);
            if (input.code) query = query.ilike("error_code", `%${escapeIlikeLiteral(input.code)}%`);

            const { data, error, count } = await query;
            if (error) return Result.fail(error.message);

            const items = await this.withProfiles((data ?? []) as ErrorLogRow[]);
            return Result.success({ items, total: count ?? 0, page: input.page, pageSize: input.pageSize });
        } catch (error) {
            return Result.fail(error instanceof Error ? error.message : "Unable to list system errors");
        }
    }

    /** {@inheritDoc SystemErrorRepository.setResolution} */
    async setResolution(input: SetSystemErrorResolutionInput): Promise<Result<SystemErrorRecord | null>> {
        try {
            const transition = input.status === "resolved"
                ? { resolution_status: "resolved", resolved_at: new Date().toISOString(), resolved_by: input.actorUserId }
                : { resolution_status: "pending", resolved_at: null, resolved_by: null };

            // The conditional update is atomic. It intentionally skips an already-targeted
            // state so a retry cannot replace the original resolution timestamp or actor.
            const { data: changed, error: updateError } = await this.source.instance
                .from("system_error_logs")
                .update(transition)
                .eq("error_code", input.errorCode)
                .neq("resolution_status", input.status)
                .select(ERROR_LOG_COLUMNS)
                .maybeSingle();
            if (updateError) return Result.fail(updateError.message);

            if (changed) return Result.success((await this.withProfiles([changed as ErrorLogRow]))[0]);

            const { data: unchanged, error: readError } = await this.source.instance
                .from("system_error_logs")
                .select(ERROR_LOG_COLUMNS)
                .eq("error_code", input.errorCode)
                .maybeSingle();
            if (readError) return Result.fail(readError.message);
            if (!unchanged) return Result.success(null);
            return Result.success((await this.withProfiles([unchanged as ErrorLogRow]))[0]);
        } catch (error) {
            return Result.fail(error instanceof Error ? error.message : "Unable to update system error resolution");
        }
    }

    /**
     * Resolves reporter and resolver profiles in one bounded query and maps persistence rows.
     * @param rows - Raw incident rows returned by Supabase.
     * @returns Administrator-safe records enriched with available profiles.
     */
    private async withProfiles(rows: ErrorLogRow[]): Promise<SystemErrorRecord[]> {
        const userIds = [...new Set(rows.flatMap((row) => [row.user_id, row.resolved_by]).filter((id): id is string => Boolean(id)))];
        const profilesById = new Map<string, SystemErrorUser>();

        if (userIds.length > 0) {
            const { data, error } = await this.source.instance
                .from("profiles")
                .select("id,name,email")
                .in("id", userIds);
            if (error) throw new Error(error.message);
            for (const profile of (data ?? []) as ProfileRow[]) {
                profilesById.set(profile.id, { id: profile.id, name: profile.name, email: profile.email });
            }
        }

        return rows.map((row) => ({
            id: row.id,
            errorCode: row.error_code,
            message: row.message,
            technicalMessage: row.technical_message,
            stackTrace: row.stack_trace,
            source: row.source,
            route: row.route,
            method: row.method,
            statusCode: row.status_code,
            tenantId: row.tenant_id,
            userId: row.user_id,
            requestId: row.request_id,
            metadata: row.metadata ?? {},
            createdAt: row.created_at,
            resolutionStatus: row.resolution_status,
            resolvedAt: row.resolved_at,
            resolvedBy: row.resolved_by,
            user: row.user_id ? profilesById.get(row.user_id) ?? null : null,
            resolver: row.resolved_by ? profilesById.get(row.resolved_by) ?? null : null,
        }));
    }
}
