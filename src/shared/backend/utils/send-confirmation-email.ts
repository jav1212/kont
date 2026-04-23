import { Resend } from "resend";

interface SendConfirmationEmailOptions {
    to:          string;
    actionLink:  string;
}

export async function sendConfirmationEmail({
    to,
    actionLink,
}: SendConfirmationEmailOptions): Promise<void> {
    const resend = new Resend(process.env.RESEND_API_KEY);

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Confirma tu correo en kont</title>
</head>
<body style="margin:0;padding:0;background:#0f0f10;font-family:'Courier New',monospace;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f10;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">

          <tr>
            <td style="padding-bottom:32px;">
              <span style="font-family:'Courier New',monospace;font-size:18px;font-weight:700;color:#e8e8e8;letter-spacing:-0.5px;">kont</span>
            </td>
          </tr>

          <tr>
            <td style="background:#1a1a1c;border:1px solid #2a2a2c;border-radius:12px;padding:32px;">

              <p style="margin:0 0 8px;font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px;">Confirmación</p>
              <h1 style="margin:0 0 16px;font-size:18px;font-weight:700;color:#e8e8e8;line-height:1.3;">
                Confirma tu correo para entrar a kont
              </h1>

              <p style="margin:0 0 24px;font-size:13px;color:#999;line-height:1.6;">
                Haz clic en el botón para confirmar tu cuenta y entrar automáticamente. Este enlace es personal y de un solo uso.
              </p>

              <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="background:#6366f1;border-radius:8px;">
                    <a href="${actionLink}"
                       style="display:inline-block;padding:12px 28px;font-family:'Courier New',monospace;font-size:13px;font-weight:700;color:#fff;text-decoration:none;letter-spacing:0.3px;">
                      Confirmar y entrar →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:11px;color:#555;line-height:1.5;">
                O copia este enlace en tu navegador:
              </p>
              <p style="margin:0;font-size:11px;color:#555;word-break:break-all;">
                <a href="${actionLink}" style="color:#6366f1;text-decoration:none;">${actionLink}</a>
              </p>

            </td>
          </tr>

          <tr>
            <td style="padding-top:24px;">
              <p style="margin:0;font-size:11px;color:#444;line-height:1.6;">
                Si no pediste este correo, puedes ignorarlo. El enlace expira automáticamente.
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
        from:    process.env.RESEND_FROM_EMAIL ?? "konta <no-reply@kontave.com>",
        to,
        subject: "Confirma tu correo en kont",
        html,
    });
}
