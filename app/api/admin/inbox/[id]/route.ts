import { NextRequest } from "next/server";
import { requireAdmin } from "@/src/shared/backend/utils/require-admin";

// =============================================================================
// GET /api/admin/inbox/[id]
// Detalle de un correo recibido + adjuntos con download_url firmado.
// Proxy admin-only a Resend `GET /emails/receiving/{id}` y
// `GET /emails/receiving/{id}/attachments` (en paralelo).
// =============================================================================

interface ResendReceivedEmail {
    object:     "received_email";
    id:         string;
    created_at: string;
    to:         string[];
    from:       string;
    cc:         string[];
    bcc:        string[];
    reply_to:   string[];
    subject:    string | null;
    html:       string | null;
    text:       string | null;
    headers:    Record<string, string>;
    message_id: string;
    raw: {
        download_url: string;
        expires_at:   string;
    };
    attachments: Array<{
        id:                   string;
        filename:             string | null;
        content_type:         string;
        content_id:           string | null;
        content_disposition:  string | null;
    }>;
}

interface ResendAttachmentDownload {
    id:                   string;
    filename:             string | null;
    size:                 number;
    content_type:         string;
    content_disposition:  string | null;
    content_id:           string | null;
    download_url:         string;
    expires_at:           string;
}

interface ResendAttachmentsResponse {
    object:   "list";
    has_more: boolean;
    data:     ResendAttachmentDownload[];
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const adminCheck = await requireAdmin(req);
    if (adminCheck) return adminCheck;

    const { id } = await params;
    if (!id) return Response.json({ error: "Falta id." }, { status: 400 });

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        return Response.json({ error: "RESEND_API_KEY no configurada." }, { status: 500 });
    }

    const headers = { Authorization: `Bearer ${apiKey}` };

    try {
        const [emailRes, attRes] = await Promise.all([
            fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(id)}`, {
                headers, cache: "no-store",
            }),
            fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(id)}/attachments`, {
                headers, cache: "no-store",
            }),
        ]);

        if (!emailRes.ok) {
            const txt = await emailRes.text();
            return Response.json(
                { error: `Resend respondió ${emailRes.status}: ${txt.slice(0, 300)}` },
                { status: emailRes.status === 404 ? 404 : 502 },
            );
        }

        const email = (await emailRes.json()) as ResendReceivedEmail;

        // Si /attachments falla, no rompemos la vista — devolvemos vacío.
        let attachments: ResendAttachmentDownload[] = [];
        if (attRes.ok) {
            const json = (await attRes.json()) as ResendAttachmentsResponse;
            attachments = json.data ?? [];
        }

        return Response.json({ data: { email, attachments } });
    } catch (e) {
        const msg = e instanceof Error ? e.message : "Error desconocido";
        return Response.json({ error: `No se pudo consultar Resend: ${msg}` }, { status: 502 });
    }
}
