import type { ClientErrorPayload } from "@/src/shared/backend/errors/system-error";

const TENANT_KEY = "kont-active-tenant-id";

export function reportClientError(payload: ClientErrorPayload): void {
    const headers = new Headers({ "Content-Type": "application/json" });
    const tenantId = typeof window !== "undefined" ? localStorage.getItem(TENANT_KEY) : null;
    if (tenantId) headers.set("X-Tenant-Id", tenantId);

    void fetch("/api/system-errors", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        keepalive: true,
    }).catch(() => {
        console.error("[system-error] client incident could not be sent", payload.code);
    });
}
