import { NextRequest } from "next/server";
import { requireAdmin } from "@/src/shared/backend/utils/require-admin";

// =============================================================================
// GET /api/admin/inbox
// Lista de correos recibidos en el dominio kontave.com (Resend inbound).
// Proxy admin-only al endpoint REST de Resend `GET /emails/receiving`.
// Soporta paginación cursor-based (?before / ?after) y ?limit (1..100).
// =============================================================================

interface ResendReceivedListItem {
    id:          string;
    to:          string[];
    from:        string;
    created_at:  string;
    subject:     string | null;
    bcc:         string[];
    cc:          string[];
    reply_to:    string[];
    message_id:  string;
    attachments: Array<{
        id:                   string;
        filename:             string | null;
        content_type:         string;
        content_id:           string | null;
        content_disposition:  string | null;
        size:                 number;
    }>;
}

interface ResendReceivedListResponse {
    object:   "list";
    has_more: boolean;
    data:     ResendReceivedListItem[];
}

export async function GET(req: NextRequest) {
    const adminCheck = await requireAdmin(req);
    if (adminCheck) return adminCheck;

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        return Response.json({ error: "RESEND_API_KEY no configurada." }, { status: 500 });
    }

    const limit  = req.nextUrl.searchParams.get("limit")  ?? "50";
    const before = req.nextUrl.searchParams.get("before");
    const after  = req.nextUrl.searchParams.get("after");

    const params = new URLSearchParams({ limit });
    if (before) params.set("before", before);
    if (after)  params.set("after",  after);

    try {
        const res = await fetch(`https://api.resend.com/emails/receiving?${params.toString()}`, {
            headers: { Authorization: `Bearer ${apiKey}` },
            cache:   "no-store",
        });

        if (!res.ok) {
            const txt = await res.text();
            return Response.json(
                { error: `Resend respondió ${res.status}: ${txt.slice(0, 300)}` },
                { status: 502 },
            );
        }

        const json = (await res.json()) as ResendReceivedListResponse;
        return Response.json({
            data:    json.data,
            hasMore: json.has_more,
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : "Error desconocido";
        return Response.json({ error: `No se pudo consultar Resend: ${msg}` }, { status: 502 });
    }
}
