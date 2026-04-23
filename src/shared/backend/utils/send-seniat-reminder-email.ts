// =============================================================================
// Shared — sendSeniatReminderEmail
// Envía un email de recordatorio tributario SENIAT vía Resend.
// Estilo visual coherente con send-invite-email.ts: tabla oscura, mono Courier,
// primary orange #D93A10, bordes sutiles, rounded card.
// =============================================================================

import { Resend } from "resend";
import type { CalendarEntry } from "@/src/modules/tools/seniat-calendar/data/types";

export interface SendSeniatReminderOptions {
    to:           string;
    rif:          string;
    taxpayerType: "ordinario" | "especial";
    daysBefore:   number;
    obligations:  CalendarEntry[];
}

// ── HTML builder ──────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
    const MONTHS = [
        "ene", "feb", "mar", "abr", "may", "jun",
        "jul", "ago", "sep", "oct", "nov", "dic",
    ];
    const [, m, d] = iso.split("-").map(Number);
    return `${d} ${MONTHS[m - 1]}`;
}

function buildReminderHtml(opts: SendSeniatReminderOptions): string {
    const { rif, taxpayerType, daysBefore, obligations } = opts;
    const count       = obligations.length;
    const typeLabel   = taxpayerType === "especial" ? "Sujeto Pasivo Especial" : "Contribuyente Ordinario";
    const calUrl      = `https://kontave.com/herramientas/calendario-seniat?rif=${encodeURIComponent(rif)}&tipo=${taxpayerType}`;
    const manageUrl   = `https://kontave.com/herramientas/calendario-seniat?manage=1`;
    const daysLabel   = daysBefore === 1 ? "1 día" : `${daysBefore} días`;

    const obligationRows = obligations.map((ob) => `
              <tr>
                <td style="padding:10px 12px;border-bottom:1px solid #252526;font-size:12px;color:#ccc;font-family:'Courier New',monospace;">
                  ${ob.shortTitle}
                </td>
                <td style="padding:10px 12px;border-bottom:1px solid #252526;font-size:12px;color:#888;font-family:'Courier New',monospace;">
                  ${ob.category.replace(/_/g, " ")}
                </td>
                <td style="padding:10px 12px;border-bottom:1px solid #252526;font-size:12px;color:#D93A10;font-family:'Courier New',monospace;white-space:nowrap;">
                  ${formatDate(ob.dueDate)} 2026
                </td>
              </tr>`).join("");

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Recordatorio SENIAT · konta</title>
</head>
<body style="margin:0;padding:0;background:#0f0f10;font-family:'Courier New',monospace;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f10;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

          <!-- Logo -->
          <tr>
            <td style="padding-bottom:28px;">
              <span style="font-family:'Courier New',monospace;font-size:18px;font-weight:700;color:#e8e8e8;letter-spacing:-0.5px;">konta</span>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#1a1a1c;border:1px solid #2a2a2c;border-radius:12px;padding:32px;">

              <!-- Badge -->
              <p style="margin:0 0 16px;display:inline-block;background:#D93A10;border-radius:4px;padding:4px 10px;font-size:10px;font-weight:700;color:#fff;letter-spacing:1.5px;text-transform:uppercase;">
                RECORDATORIO SENIAT · VENCE EN ${daysLabel.toUpperCase()}
              </p>

              <!-- Title -->
              <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#e8e8e8;line-height:1.3;font-family:'Courier New',monospace;">
                ${count === 1 ? "1 obligación" : `${count} obligaciones`} por vencer
              </h1>

              <!-- Subtitle -->
              <p style="margin:0 0 24px;font-size:13px;color:#888;line-height:1.6;">
                RIF <strong style="color:#ccc;">${rif}</strong> · ${typeLabel}
              </p>

              <!-- Obligations table -->
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="border:1px solid #2a2a2c;border-radius:8px;overflow:hidden;margin-bottom:28px;">
                <thead>
                  <tr style="background:#111113;">
                    <th style="padding:8px 12px;font-size:10px;color:#555;text-transform:uppercase;letter-spacing:1px;text-align:left;font-family:'Courier New',monospace;font-weight:400;">
                      Obligación
                    </th>
                    <th style="padding:8px 12px;font-size:10px;color:#555;text-transform:uppercase;letter-spacing:1px;text-align:left;font-family:'Courier New',monospace;font-weight:400;">
                      Categoría
                    </th>
                    <th style="padding:8px 12px;font-size:10px;color:#555;text-transform:uppercase;letter-spacing:1px;text-align:left;font-family:'Courier New',monospace;font-weight:400;">
                      Vencimiento
                    </th>
                  </tr>
                </thead>
                <tbody>
                  ${obligationRows}
                </tbody>
              </table>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#D93A10;border-radius:8px;">
                    <a href="${calUrl}"
                       style="display:inline-block;padding:12px 28px;font-family:'Courier New',monospace;font-size:13px;font-weight:700;color:#fff;text-decoration:none;letter-spacing:0.3px;">
                      Ver calendario completo →
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:24px;">
              <p style="margin:0;font-size:11px;color:#444;line-height:1.8;">
                Recibes este correo porque activaste recordatorios en konta para el RIF ${rif}.<br />
                <a href="${manageUrl}" style="color:#666;text-decoration:underline;">Administrar recordatorios</a>
                &nbsp;·&nbsp;
                <a href="${manageUrl}" style="color:#666;text-decoration:underline;">Cancelar suscripción</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Public function ────────────────────────────────────────────────────────────

export async function sendSeniatReminderEmail(opts: SendSeniatReminderOptions): Promise<void> {
    const resend = new Resend(process.env.RESEND_API_KEY);

    const count    = opts.obligations.length;
    const firstOb  = opts.obligations[0];
    const subject  = `SENIAT · Vence en ${opts.daysBefore === 1 ? "1 día" : `${opts.daysBefore} días`}: ${firstOb.shortTitle}${count > 1 ? ` y ${count - 1} más` : ""}`;

    await resend.emails.send({
        from:    process.env.RESEND_FROM_EMAIL ?? "konta <no-reply@kontave.com>",
        to:      opts.to,
        subject,
        html:    buildReminderHtml(opts),
    });
}
