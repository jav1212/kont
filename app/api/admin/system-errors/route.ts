import { getSystemErrorActions } from "@/src/modules/system-errors/backend/infrastructure/system-error-factory";
import { requireAdmin } from "@/src/shared/backend/utils/require-admin";

const PAGE_SIZE_DEFAULT = 25;
const PAGE_SIZE_MAXIMUM = 100;
const PAGE_MAXIMUM = 10_000;

/**
 * Parses a positive integer query parameter without accepting numeric prefixes.
 * @param value - Raw query parameter value.
 * @param fallback - Value used when the parameter is omitted.
 * @returns The parsed integer, or null when the value is invalid.
 */
function positiveInteger(value: string | null, fallback: number): number | null {
    if (value === null) return fallback;
    if (!/^[1-9]\d*$/.test(value)) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
}

/**
 * Lists centralized incidents for a platform administrator.
 * @param req - HTTP request containing filters and pagination parameters.
 * @returns A paginated administrator-safe incident response.
 */
export async function GET(req: Request): Promise<Response> {
    const adminCheck = await requireAdmin(req);
    if (adminCheck) return adminCheck;

    const url = new URL(req.url);
    const rawStatus = url.searchParams.get("status");
    const page = positiveInteger(url.searchParams.get("page"), 1);
    const pageSize = positiveInteger(url.searchParams.get("pageSize"), PAGE_SIZE_DEFAULT);
    const code = url.searchParams.get("code")?.trim() || undefined;

    if (rawStatus !== null && rawStatus !== "pending" && rawStatus !== "resolved") {
        return Response.json({ error: "status debe ser pending o resolved" }, { status: 400 });
    }
    if (page === null || page > PAGE_MAXIMUM || pageSize === null || pageSize > PAGE_SIZE_MAXIMUM) {
        return Response.json({ error: "page debe estar entre 1 y 10000 y pageSize entre 1 y 100" }, { status: 400 });
    }
    if (code && !/^[A-Za-z0-9-]{1,32}$/.test(code)) {
        return Response.json({ error: "code debe contener hasta 32 letras, números o guiones" }, { status: 400 });
    }

    const result = await getSystemErrorActions().list.execute({
        status: rawStatus ?? undefined,
        code,
        page,
        pageSize,
    });
    if (result.isFailure) {
        console.error("[admin/system-errors] list failed", result.getError());
        return Response.json({ error: "No se pudieron consultar los errores." }, { status: 500 });
    }
    return Response.json({ data: result.getValue() });
}
