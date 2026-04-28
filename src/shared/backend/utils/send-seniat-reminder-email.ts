// =============================================================================
// Shared — sendSeniatReminderEmail
// Recordatorio tributario SENIAT vía Resend, usando el layout shared Konta
// (slate-light + accent #FF4A18, monospace).
// =============================================================================

import { Resend } from "resend";
import type { CalendarEntry } from "@/src/modules/tools/seniat-calendar/data/types";
import { renderEmailLayout, EMAIL_BRAND, EMAIL_FONT_MONO } from "./email-layout";

export interface SendSeniatReminderOptions {
    to:           string;
    rif:          string;
    taxpayerType: "ordinario" | "especial";
    daysBefore:   number;
    obligations:  CalendarEntry[];
}

function formatDate(iso: string): string {
    const MONTHS = [
        "ene", "feb", "mar", "abr", "may", "jun",
        "jul", "ago", "sep", "oct", "nov", "dic",
    ];
    const [, m, d] = iso.split("-").map(Number);
    return `${d} ${MONTHS[m - 1]}`;
}

function buildObligationsTable(obligations: CalendarEntry[]): string {
    const rows = obligations.map((ob) => `
        <tr>
            <td style="padding:10px 12px;border-bottom:1px solid ${EMAIL_BRAND.border};font-family:${EMAIL_FONT_MONO};font-size:12px;color:${EMAIL_BRAND.text};">
                ${ob.shortTitle}
            </td>
            <td style="padding:10px 12px;border-bottom:1px solid ${EMAIL_BRAND.border};font-family:${EMAIL_FONT_MONO};font-size:12px;color:${EMAIL_BRAND.textSecondary};">
                ${ob.category.replace(/_/g, " ")}
            </td>
            <td style="padding:10px 12px;border-bottom:1px solid ${EMAIL_BRAND.border};font-family:${EMAIL_FONT_MONO};font-size:12px;color:${EMAIL_BRAND.accent};white-space:nowrap;font-weight:600;">
                ${formatDate(ob.dueDate)} 2026
            </td>
        </tr>`).join("");

    return `<table width="100%" cellpadding="0" cellspacing="0"
                  style="border:1px solid ${EMAIL_BRAND.border};border-radius:8px;overflow:hidden;margin:8px 0 24px;">
        <thead>
            <tr style="background:${EMAIL_BRAND.metaRowBg};">
                <th style="padding:8px 12px;font-family:${EMAIL_FONT_MONO};font-size:10px;color:${EMAIL_BRAND.textTertiary};text-transform:uppercase;letter-spacing:0.1em;text-align:left;font-weight:600;">
                    Obligación
                </th>
                <th style="padding:8px 12px;font-family:${EMAIL_FONT_MONO};font-size:10px;color:${EMAIL_BRAND.textTertiary};text-transform:uppercase;letter-spacing:0.1em;text-align:left;font-weight:600;">
                    Categoría
                </th>
                <th style="padding:8px 12px;font-family:${EMAIL_FONT_MONO};font-size:10px;color:${EMAIL_BRAND.textTertiary};text-transform:uppercase;letter-spacing:0.1em;text-align:left;font-weight:600;">
                    Vencimiento
                </th>
            </tr>
        </thead>
        <tbody>${rows}</tbody>
    </table>`;
}

export async function sendSeniatReminderEmail(opts: SendSeniatReminderOptions): Promise<void> {
    const resend = new Resend(process.env.RESEND_API_KEY);

    const { rif, taxpayerType, daysBefore, obligations } = opts;
    const count     = obligations.length;
    const firstOb   = obligations[0];
    const typeLabel = taxpayerType === "especial" ? "Sujeto Pasivo Especial" : "Contribuyente Ordinario";
    const calUrl    = `https://kontave.com/herramientas/calendario-seniat?rif=${encodeURIComponent(rif)}&tipo=${taxpayerType}`;
    const manageUrl = `https://kontave.com/herramientas/calendario-seniat?manage=1`;
    const daysLabel = daysBefore === 1 ? "1 día" : `${daysBefore} días`;

    const html = renderEmailLayout({
        preheader: `${count === 1 ? "1 obligación" : `${count} obligaciones`} SENIAT por vencer en ${daysLabel} (RIF ${rif}).`,
        heading:   `${count === 1 ? "1 obligación" : `${count} obligaciones`} por vencer`,
        bodyHtml:  `
            <p style="margin:0 0 4px;">
                RIF <strong style="color:${EMAIL_BRAND.text};">${rif}</strong> · ${typeLabel}
            </p>
            ${buildObligationsTable(obligations)}
        `,
        cta:   { label: "Ver calendario completo", href: calUrl },
        badge: `RECORDATORIO SENIAT · VENCE EN ${daysLabel.toUpperCase()}`,
        footerNote: `Recibes este correo porque activaste recordatorios en Konta para el RIF ${rif}.`,
        extraHtml: `<p style="margin:8px 0 0;font-family:${EMAIL_FONT_MONO};font-size:11px;color:${EMAIL_BRAND.textTertiary};">
            <a href="${manageUrl}" style="color:${EMAIL_BRAND.textSecondary};text-decoration:underline;">Administrar recordatorios</a>
            &nbsp;·&nbsp;
            <a href="${manageUrl}" style="color:${EMAIL_BRAND.textSecondary};text-decoration:underline;">Cancelar suscripción</a>
        </p>`,
    });

    const subject = `SENIAT · Vence en ${daysLabel}: ${firstOb.shortTitle}${count > 1 ? ` y ${count - 1} más` : ""}`;

    await resend.emails.send({
        from:    process.env.RESEND_FROM_EMAIL ?? "konta <no-reply@kontave.com>",
        to:      opts.to,
        subject,
        html,
    });
}
