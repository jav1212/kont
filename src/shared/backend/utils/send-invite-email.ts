import { Resend } from "resend";

interface SendInviteEmailOptions {
    to:         string;
    role:       "admin" | "contable";
    tenantName: string;
    inviterEmail: string;
    acceptUrl:  string;
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

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invitación a kont</title>
</head>
<body style="margin:0;padding:0;background:#0f0f10;font-family:'Courier New',monospace;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f10;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">

          <!-- Logo -->
          <tr>
            <td style="padding-bottom:32px;">
              <span style="font-family:'Courier New',monospace;font-size:18px;font-weight:700;color:#e8e8e8;letter-spacing:-0.5px;">kont</span>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#1a1a1c;border:1px solid #2a2a2c;border-radius:12px;padding:32px;">

              <p style="margin:0 0 8px;font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px;">Invitación</p>
              <h1 style="margin:0 0 16px;font-size:18px;font-weight:700;color:#e8e8e8;line-height:1.3;">
                Te invitaron a unirte a kont
              </h1>

              <p style="margin:0 0 24px;font-size:13px;color:#999;line-height:1.6;">
                <strong style="color:#ccc;">${inviterEmail}</strong> te invitó a colaborar en
                <strong style="color:#ccc;">${tenantName}</strong> como
                <strong style="color:#ccc;">${roleLabel}</strong>.
              </p>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="background:#6366f1;border-radius:8px;">
                    <a href="${acceptUrl}"
                       style="display:inline-block;padding:12px 28px;font-family:'Courier New',monospace;font-size:13px;font-weight:700;color:#fff;text-decoration:none;letter-spacing:0.3px;">
                      Aceptar invitación →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:11px;color:#555;line-height:1.5;">
                O copia este enlace en tu navegador:
              </p>
              <p style="margin:0;font-size:11px;color:#555;word-break:break-all;">
                <a href="${acceptUrl}" style="color:#6366f1;text-decoration:none;">${acceptUrl}</a>
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:24px;">
              <p style="margin:0;font-size:11px;color:#444;line-height:1.6;">
                Este enlace expira en 7 días. Si no esperabas esta invitación, puedes ignorar este correo.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    await resend.emails.send({
        from:    "kont <noreply@kont.app>",
        to,
        subject: `Invitación a kont — ${tenantName}`,
        html,
    });
}
