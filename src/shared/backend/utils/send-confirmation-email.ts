import { Resend } from "resend";
import { renderEmailLayout } from "./email-layout";

interface SendConfirmationEmailOptions {
    to:          string;
    actionLink:  string;
}

export async function sendConfirmationEmail({
    to,
    actionLink,
}: SendConfirmationEmailOptions): Promise<void> {
    const resend = new Resend(process.env.RESEND_API_KEY);

    const html = renderEmailLayout({
        preheader: "Confirma tu correo para entrar a Konta. El enlace es personal y de un solo uso.",
        heading:   "Confirma tu correo para entrar a Konta",
        bodyHtml:  `
            <p style="margin:0 0 12px;">
                Haz clic en el botón para confirmar tu cuenta y entrar automáticamente. Este enlace es personal y de un solo uso.
            </p>
            <p style="margin:0;font-size:11px;color:#94A3B8;">
                Si el botón no funciona, copia este enlace en tu navegador:<br />
                <a href="${actionLink}" style="color:#FF4A18;text-decoration:none;word-break:break-all;">${actionLink}</a>
            </p>
        `,
        cta:        { label: "Confirmar y entrar", href: actionLink },
        badge:      "CONFIRMACIÓN",
        footerNote: "Si no pediste este correo, puedes ignorarlo. El enlace expira automáticamente.",
    });

    await resend.emails.send({
        from:    process.env.RESEND_FROM_EMAIL ?? "konta <no-reply@kontave.com>",
        to,
        subject: "Confirma tu correo en Konta",
        html,
    });
}
