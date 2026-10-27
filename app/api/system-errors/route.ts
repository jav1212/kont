import { NextResponse } from "next/server";
import { isIncidentCode, isIncidentSeverity } from "@kontave/observability/contracts";
import { logSystemError, type ClientErrorPayload } from "@/src/shared/backend/errors/system-error";
import { rateLimit } from "@/src/shared/backend/utils/rate-limit";
import { requireTenant } from "@/src/shared/backend/utils/require-tenant";

// Clients deduplicate and budget their own reports; this cap protects the
// incident table from loops on misbehaving clients and from unauthenticated abuse.
const RATE_LIMIT = { bucket: "client-incidents", limit: 30, windowSec: 60 } as const;
const MAX_BODY_BYTES = 32_000;
const EVENT_NAME = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

type ClientIncidentBody = Partial<ClientErrorPayload> & {
    eventName?: unknown;
    severity?: unknown;
};

export async function POST(req: Request) {
    const limited = await rateLimit(req, RATE_LIMIT);
    if (limited) return limited;

    try {
        const raw = await req.text();
        if (raw.length > MAX_BODY_BYTES) {
            return NextResponse.json({ error: "Error payload too large" }, { status: 413 });
        }
        const body = JSON.parse(raw) as ClientIncidentBody;
        if (!isIncidentCode(body.code) || typeof body.message !== "string" || !body.message.trim()) {
            return NextResponse.json({ error: "Invalid error payload" }, { status: 400 });
        }

        // The active tenant is stored in localStorage on the client and is
        // sent as X-Tenant-Id. Resolve it through the normal authorization
        // path before persisting it; never trust the client payload/header as
        // an identity by itself.
        let validatedTenantId: string | null = null;
        try {
            validatedTenantId = (await requireTenant(req)).tenantId;
        } catch {
            // Error reporting must remain best-effort. If the session or
            // tenant is no longer valid, keep the incident but leave tenant
            // attribution empty.
        }

        const source = ["api", "client", "database", "auth", "network", "unknown"].includes(body.source ?? "")
            ? body.source
            : "client";
        const eventName = typeof body.eventName === "string" && body.eventName.length <= 120 && EVENT_NAME.test(body.eventName)
            ? body.eventName
            : null;
        const technical = new Error(body.technicalMessage ?? body.message);
        technical.stack = typeof body.stack === "string" ? body.stack : undefined;
        const code = await logSystemError(
            technical,
            {
                source,
                route: body.route,
                method: body.method,
                statusCode: body.statusCode,
                tenantId: validatedTenantId,
                requestId: body.requestId,
                metadata: {
                    ...body.metadata,
                    publicMessage: body.message,
                    ...(eventName ? { eventName } : {}),
                    ...(isIncidentSeverity(body.severity) ? { severity: body.severity } : {}),
                },
            },
            body.code,
        );
        return NextResponse.json({ data: { code } });
    } catch {
        return NextResponse.json({ error: "Unable to record error" }, { status: 500 });
    }
}
