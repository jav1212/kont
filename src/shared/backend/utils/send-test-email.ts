// =============================================================================
// Shared — sendTestEmail
// Disparado desde el panel admin para validar que los correos llegan a un
// tenant con el branding correcto. Usa el layout shared `email-layout.ts`.
// =============================================================================

import { Resend } from "resend";
import { renderEmailLayout } from "./email-layout";

interface SendTestEmailOptions {
    to:           string;
    ownerName?:   string | null;
    tenantId:     string;
    tenantEmail:  string;
    planName?:    string | null;
    appUrl:       string;
}

export async function sendTestEmail(opts: SendTestEmailOptions): Promise<{ messageId: string }> {
    const resend = new Resend(process.env.RESEND_API_KEY);

    const greeting = opts.ownerName ? `Hola, ${opts.ownerName}` : "Hola";
    const sentAt   = new Date().toISOString().replace("T", " ").replace(/\..+$/, " UTC");

    const html = renderEmailLayout({
        preheader: "Verificación de entrega desde el panel de administración de Konta.",
        heading:   greeting,
        bodyHtml:  `
            <p style="margin:0 0 12px;">
                Este es un correo de prueba enviado desde el panel de Konta para validar que la entrega y el branding llegan correctamente a tu bandeja.
            </p>
            <p style="margin:0;">
                Si lo recibes, no hace falta hacer nada. Puedes ignorarlo o responder si algo se ve mal.
            </p>
        `,
        cta: { label: "Ir a Konta", href: opts.appUrl },
        metaRows: [
            { label: "Tenant",  value: opts.tenantId },
            { label: "Correo",  value: opts.tenantEmail },
            { label: "Plan",    value: opts.planName ?? "—" },
            { label: "Enviado", value: sentAt },
        ],
        footerNote: "Enviado por el equipo de Konta · si no esperabas este correo, puedes ignorarlo.",
        badge: "PRUEBA DE ENTREGA",
    });

    const result = await resend.emails.send({
        from:    process.env.RESEND_FROM_EMAIL ?? "konta <no-reply@kontave.com>",
        to:      opts.to,
        subject: "Konta · prueba de entrega",
        html,
    });

    if (result.error) {
        throw new Error(result.error.message ?? "Resend rechazó el envío");
    }

    return { messageId: result.data?.id ?? "" };
}
