import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";
import { createIncidentCode } from "@/src/core/errors/incident-code";

export type SystemErrorSource = "api" | "client" | "database" | "auth" | "network" | "unknown";

export interface SystemErrorContext {
    source?: SystemErrorSource;
    route?: string;
    method?: string;
    statusCode?: number;
    tenantId?: string | null;
    userId?: string | null;
    requestId?: string | null;
    metadata?: Record<string, unknown>;
}

export interface ClientErrorPayload extends SystemErrorContext {
    code: string;
    message: string;
    technicalMessage?: string;
    stack?: string;
}

const SECRET_KEY = /(authorization|cookie|password|token|secret|api[_-]?key|service[_-]?role|cedula|national[_-]?id|email|phone)/i;
const MAX_TEXT = 8_000;

// Personal data can arrive inside free text (server messages, client error
// messages, metadata values), not only under sensitive keys. Company RIFs
// (J/G) are kept because they identify the tenant being debugged.
const PERSONAL_DATA: ReadonlyArray<readonly [RegExp, string]> = [
    [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]"],
    [/\b[VE]-?\d{6,9}(?:-?\d)?\b/gi, "[cedula]"],
    [/(?:\+?58[\s-]?)?\b0?4(?:12|14|16|24|26)[\s-]?\d{3}[\s-]?\d{4}\b/g, "[telefono]"],
];

/**
 * Replaces personal identifiers (emails, cédulas, Venezuelan mobile numbers) in free text before it is persisted.
 * @param value - Text that may contain user-supplied data.
 * @returns The text with each identifier replaced by a neutral placeholder.
 */
export function redactPersonalData(value: string): string {
    return PERSONAL_DATA.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
}

function safeMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> {
    if (!metadata) return {};
    return Object.fromEntries(Object.entries(metadata)
        .filter(([key]) => !SECRET_KEY.test(key))
        .map(([key, value]) => [key, typeof value === "string" ? redactPersonalData(value.slice(0, 1_000)) : value])
        .slice(0, 40));
}

async function requestIdentity(): Promise<{ userId: string | null; tenantId: string | null }> {
    try {
        const cookieStore = await cookies();
        const authClient = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
        );
        const { data } = await authClient.auth.getUser();
        const tenant = cookieStore.get("kont-active-tenant-id")?.value ?? null;
        return { userId: data.user?.id ?? null, tenantId: tenant };
    } catch {
        return { userId: null, tenantId: null };
    }
}

export async function logSystemError(
    error: unknown,
    context: SystemErrorContext = {},
    suppliedCode?: string,
): Promise<string> {
    const code = suppliedCode ?? createIncidentCode();
    const identity = await requestIdentity();
    const normalized = error instanceof Error ? error : new Error(String(error));
    const client = new ServerSupabaseSource().instance;

    const { error: insertError } = await client.from("system_error_logs").insert({
        error_code: code,
        message: redactPersonalData(normalized.message || "Ocurrió un error inesperado."),
        technical_message: redactPersonalData((normalized.message || "").slice(0, MAX_TEXT)) || null,
        stack_trace: normalized.stack?.slice(0, MAX_TEXT) ?? null,
        source: context.source ?? "unknown",
        route: context.route ?? null,
        method: context.method ?? null,
        status_code: context.statusCode ?? null,
        tenant_id: context.tenantId ?? identity.tenantId,
        user_id: context.userId ?? identity.userId,
        request_id: context.requestId ?? null,
        metadata: safeMetadata(context.metadata),
    });
    if (insertError) console.error("[system-error] could not persist incident", insertError.message);
    return code;
}

export function errorResponseBody(message: string, code: string) {
    return { error: message, errorCode: code };
}

export async function logAndGetCode(error: unknown, context: SystemErrorContext = {}): Promise<string> {
    try { return await logSystemError(error, context); }
    catch (loggingError) {
        console.error("[system-error] logging failed", loggingError);
        return createIncidentCode();
    }
}

export function getErrorMessage(error: unknown, fallback = "Ocurrió un error inesperado."): string {
    return error instanceof Error && error.message ? error.message : fallback;
}
