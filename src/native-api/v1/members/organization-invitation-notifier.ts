import type { OrganizationInvitationNotifier } from "@kontave/organizations-application";
import { Resend } from "resend";
import { renderEmailLayout } from "@/src/shared/backend/utils/email-layout";

export function createOrganizationInvitationNotifier(origin: string): OrganizationInvitationNotifier {
  return {
    async sendInvitation(input) {
      const acceptUrl = resolveInvitationUrl(origin, input.destination);
      const html = renderEmailLayout({
        preheader: `${input.inviterDisplayName} te invitó a colaborar en ${input.organizationName}.`,
        heading: `Te invitaron a unirte a ${input.organizationName}`,
        bodyHtml: `<p><strong>${escapeHtml(input.inviterDisplayName)}</strong> te invitó como <strong>${escapeHtml(input.roleName)}</strong>.</p><p>Este enlace vence el ${escapeHtml(new Date(input.expiresAt).toLocaleString("es-VE"))}.</p>`,
        cta: { label: "Aceptar invitación", href: acceptUrl },
        metaRows: [{ label: "Organización", value: input.organizationName }, { label: "Rol", value: input.roleName }],
        badge: "INVITACIÓN",
      });
      const result = await new Resend(process.env.RESEND_API_KEY).emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "Kontave <no-reply@kontave.com>",
        to: input.email,
        subject: `Invitación a Kontave — ${input.organizationName}`,
        html,
      });
      if (result.error) throw new Error(`Invitation delivery failed: ${result.error.message}`);
    },
  };
}

function resolveInvitationUrl(origin: string, target: { readonly id: "organization.invitation.accept"; readonly parameters: { readonly token: string } }): string {
  const url = new URL("/accept-invite", origin);
  url.searchParams.set("token", target.parameters.token);
  return url.toString();
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
