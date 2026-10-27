import type { IncidentReference, IncidentReporter, UnexpectedFailureReport } from "@kontave/client-feedback/application";
import { createIncidentCode } from "@/src/core/errors/incident-code";

const ENDPOINT = "/api/system-errors";
const TENANT_KEY = "kont-active-tenant-id";
const DEDUPLICATION_WINDOW_MS = 60_000;
const MAX_REPORTS_PER_PAGE = 25;

interface RecentReport {
    readonly code: string;
    readonly at: number;
}

/**
 * Sends unexpected Web failures to `/api/system-errors`.
 * Repeated failures with the same signature reuse the reference for one minute, and each page load has a
 * report budget, so an error loop cannot flood the incident table.
 */
export class WebIncidentReporter implements IncidentReporter {
    private readonly recent = new Map<string, RecentReport>();
    private sent = 0;

    /**
     * {@inheritDoc IncidentReporter.report}
     * @throws {Error} When the page report budget is exhausted or the endpoint rejects the incident.
     */
    async report(failure: UnexpectedFailureReport): Promise<IncidentReference> {
        const signature = failure.fingerprint ?? `${failure.eventName}:${errorSignature(failure.error)}`;
        const now = Date.now();
        const previous = this.recent.get(signature);
        if (previous && now - previous.at < DEDUPLICATION_WINDOW_MS) return { code: previous.code, recorded: true };
        if (this.sent >= MAX_REPORTS_PER_PAGE) throw new Error("Incident report budget exhausted for this page.");
        this.sent += 1;

        const error = failure.error instanceof Error ? failure.error : null;
        const response = await fetch(ENDPOINT, {
            method: "POST",
            headers: requestHeaders(),
            keepalive: true,
            body: JSON.stringify({
                code: createIncidentCode(),
                eventName: failure.eventName,
                message: failure.publicMessage,
                technicalMessage: error?.message ?? String(failure.error),
                stack: error?.stack,
                source: "client",
                severity: "error",
                route: failure.route ?? currentRoute(),
                method: "CLIENT",
                requestId: failure.requestId,
                metadata: {
                    ...failure.attributes,
                    errorType: error?.name ?? typeof failure.error,
                    fingerprint: failure.fingerprint ?? null,
                    ...(typeof navigator !== "undefined" ? { userAgent: navigator.userAgent } : {}),
                },
            }),
        });
        if (!response.ok) throw new Error(`Incident endpoint responded ${response.status}.`);
        const body = await response.json() as { data?: { code?: unknown } };
        const code = body.data?.code;
        if (typeof code !== "string") throw new Error("Incident endpoint returned no code.");
        this.recent.set(signature, { code, at: now });
        return { code, recorded: true };
    }
}

function requestHeaders(): Headers {
    const headers = new Headers({ "Content-Type": "application/json" });
    try {
        const tenantId = typeof window !== "undefined" ? window.localStorage.getItem(TENANT_KEY) : null;
        if (tenantId) headers.set("X-Tenant-Id", tenantId);
    } catch {
        // Storage can be unavailable (private mode); the server then records the incident without tenant attribution.
    }
    return headers;
}

function currentRoute(): string | undefined {
    return typeof window !== "undefined" ? window.location.pathname : undefined;
}

function errorSignature(error: unknown): string {
    if (!(error instanceof Error)) return typeof error;
    const frame = error.stack?.split("\n").find((line) => line.trim().startsWith("at ")) ?? "";
    return `${error.name}:${error.message.slice(0, 200)}:${frame.trim()}`;
}
