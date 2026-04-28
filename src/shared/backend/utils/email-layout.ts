// =============================================================================
// Shared email layout — Konta brand
// HTML compatible with email clients (table-based, inline CSS, no <style>).
// Visual tokens aligned with `konta-design`: blue-tinted slate neutrals,
// warm orange #FF4A18 accent, monospace stack.
// =============================================================================

const BRAND = {
    pageBg:        "#F8FAFC",   // slate-50
    cardBg:        "#FFFFFF",
    border:        "#E2E8F0",   // slate-200
    borderStrong:  "#CBD5E1",   // slate-300
    text:          "#0F172A",   // slate-900
    textSecondary: "#475569",   // slate-600
    textTertiary:  "#94A3B8",   // slate-400
    accent:        "#FF4A18",   // konta orange
    metaRowBg:     "#F1F5F9",   // slate-100
} as const;

const FONT_MONO = `ui-monospace, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace`;

interface EmailLayoutOptions {
    preheader:    string;
    heading:      string;
    bodyHtml:     string;
    cta?:         { label: string; href: string };
    metaRows?:    Array<{ label: string; value: string }>;
    footerNote?:  string;
    badge?:       string;   // small uppercase label above heading
    extraHtml?:   string;   // arbitrary HTML inserted inside the card after bodyHtml
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

const LOGO_ICON_URL = process.env.EMAIL_LOGO_URL ?? "https://kontave.com/icon-192.png";

function renderLogo(): string {
    return `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
            <td style="vertical-align:middle;padding-right:10px;">
                <img src="${LOGO_ICON_URL}" alt="Konta" width="36" height="36"
                     style="display:block;width:36px;height:36px;border-radius:8px;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;" />
            </td>
            <td style="vertical-align:middle;">
                <span style="font-family:${FONT_MONO};font-size:18px;font-weight:900;color:${BRAND.text};letter-spacing:-0.03em;line-height:1;">kontave<span style="color:${BRAND.accent};">.</span></span>
            </td>
        </tr>
    </table>`;
}

function renderCta(cta: { label: string; href: string }): string {
    return `<table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
        <tr>
            <td style="background:${BRAND.accent};border-radius:9999px;">
                <a href="${escapeHtml(cta.href)}"
                   style="display:inline-block;padding:14px 26px;font-family:${FONT_MONO};font-size:13px;font-weight:600;color:#FFFFFF;text-decoration:none;letter-spacing:0.02em;">
                    ${escapeHtml(cta.label)}
                </a>
            </td>
        </tr>
    </table>`;
}

function renderMetaRows(rows: Array<{ label: string; value: string }>): string {
    const items = rows.map((r) => `
        <tr>
            <td style="padding:8px 12px;border-bottom:1px solid ${BRAND.border};font-family:${FONT_MONO};font-size:11px;color:${BRAND.textTertiary};text-transform:uppercase;letter-spacing:0.08em;width:38%;">
                ${escapeHtml(r.label)}
            </td>
            <td style="padding:8px 12px;border-bottom:1px solid ${BRAND.border};font-family:${FONT_MONO};font-size:12px;color:${BRAND.text};word-break:break-word;">
                ${escapeHtml(r.value)}
            </td>
        </tr>`).join("");
    return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;border:1px solid ${BRAND.border};border-radius:8px;overflow:hidden;background:${BRAND.metaRowBg};">
        <tbody>${items}</tbody>
    </table>`;
}

export function renderEmailLayout(opts: EmailLayoutOptions): string {
    const ctaHtml      = opts.cta       ? renderCta(opts.cta)            : "";
    const metaHtml     = opts.metaRows  ? renderMetaRows(opts.metaRows)  : "";
    const extraHtml    = opts.extraHtml ?? "";
    const footerNote   = opts.footerNote
        ? `<p style="margin:0;font-family:${FONT_MONO};font-size:11px;color:${BRAND.textTertiary};line-height:1.6;">${escapeHtml(opts.footerNote)}</p>`
        : "";
    const badgeHtml    = opts.badge
        ? `<p style="margin:0 0 12px;display:inline-block;background:${BRAND.accent};border-radius:4px;padding:4px 10px;font-family:${FONT_MONO};font-size:10px;font-weight:700;color:#FFFFFF;letter-spacing:0.12em;text-transform:uppercase;">${escapeHtml(opts.badge)}</p>`
        : "";

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${escapeHtml(opts.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.pageBg};font-family:${FONT_MONO};color:${BRAND.text};">
  <span style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:${BRAND.pageBg};">${escapeHtml(opts.preheader)}</span>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.pageBg};padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

          <tr>
            <td style="padding-bottom:24px;">
              ${renderLogo()}
            </td>
          </tr>

          <tr>
            <td style="background:${BRAND.cardBg};border:1px solid ${BRAND.border};border-radius:12px;padding:32px;">
              ${badgeHtml}
              <h1 style="margin:0 0 16px;font-family:${FONT_MONO};font-size:20px;font-weight:700;color:${BRAND.text};line-height:1.3;">
                ${escapeHtml(opts.heading)}
              </h1>
              <div style="font-family:${FONT_MONO};font-size:13px;color:${BRAND.textSecondary};line-height:1.7;">
                ${opts.bodyHtml}
              </div>
              ${ctaHtml ? `<div style="margin-top:24px;">${ctaHtml}</div>` : ""}
              ${extraHtml}
              ${metaHtml}
            </td>
          </tr>

          <tr>
            <td style="padding:24px 4px 0;">
              ${footerNote}
            </td>
          </tr>

          <tr>
            <td style="padding:16px 4px 0;">
              <p style="margin:0;font-family:${FONT_MONO};font-size:10px;color:${BRAND.textTertiary};line-height:1.6;letter-spacing:0.04em;">
                Konta · plataforma contable para Venezuela · no-reply@kontave.com
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

export const EMAIL_BRAND = BRAND;
export const EMAIL_FONT_MONO = FONT_MONO;
