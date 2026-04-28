import { Resend } from "resend";
import { renderEmailLayout } from "./email-layout";

interface SendInviteEmailOptions {
    to:           string;
    role:         "admin" | "contable";
    tenantName:   string;
    inviterEmail: string;
    acceptUrl:    string;
}

export async function sendInviteEmail({
    to,
    role,
    tenantName,
    inviterEmail,
    acceptUrl,
}: SendInviteEmailOptions): Promise<void> {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const roleLabel = role === "admin" ? "Administrador" : "Contable";

    const html = renderEmailLayout({
        preheader: `${inviterEmail} te invitó a colaborar en ${tenantName} en Konta.`,
        heading:   `Te invitaron a unirte a ${tenantName}`,
        bodyHtml:  `
            <p style="margin:0 0 12px;">
                <strong style="color:#0F172A;">${inviterEmail}</strong> te invitó a colaborar en
                <strong style="color:#0F172A;">${tenantName}</strong> como
                <strong style="color:#0F172A;">${roleLabel}</strong>.
            </p>
            <p style="margin:0;font-size:11px;color:#94A3B8;">
                Si el botón no funciona, copia este enlace en tu navegador:<br />
                <a href="${acceptUrl}" style="color:#FF4A18;text-decoration:none;word-break:break-all;">${acceptUrl}</a>
            </p>
        `,
        cta: { label: "Aceptar invitación", href: acceptUrl },
        metaRows: [
            { label: "Empresa", value: tenantName },
            { label: "Rol",     value: roleLabel },
            { label: "Invitó",  value: inviterEmail },
        ],
        badge:      "INVITACIÓN",
        footerNote: "Este enlace expira en 7 días. Si no esperabas esta invitación, puedes ignorar este correo.",
    });

    await resend.emails.send({
        from:    process.env.RESEND_FROM_EMAIL ?? "konta <no-reply@kontave.com>",
        to,
        subject: `Invitación a Konta — ${tenantName}`,
        html,
    });
}
