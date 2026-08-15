import type { DesktopBillingPlanState } from "../../shared/desktop-api.js";

interface SubscriptionSummary {
  readonly planName: string | null;
  readonly status: string;
}

export class DesktopBillingPlanSource {
  constructor(
    private readonly baseUrl: string,
    private readonly getAccessToken: () => Promise<string | null>,
  ) {}

  async getForOrganization(organizationId: string): Promise<DesktopBillingPlanState> {
    const accessToken = await this.getAccessToken();
    if (!accessToken) return { status: "unavailable" };

    const response = await fetch(new URL(
      `/api/native/v1/organizations/${encodeURIComponent(organizationId)}/billing/overview`,
      this.baseUrl,
    ), {
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-kontave-client": "desktop",
      },
    });
    const payload: unknown = await response.json();
    if (!response.ok) throw new Error(readApiError(payload));

    return { status: "ready", organizationId, planName: selectPlanName(readSubscriptions(payload)) };
  }
}

function readSubscriptions(payload: unknown): readonly SubscriptionSummary[] {
  const envelope = readRecord(payload, "La respuesta de facturación no es válida.");
  const data = readRecord(envelope.data, "La respuesta de facturación no contiene datos válidos.");
  if (!Array.isArray(data.subscriptions)) throw new Error("La respuesta de facturación no contiene suscripciones válidas.");
  return data.subscriptions.map((value) => {
    const subscription = readRecord(value, "La suscripción recibida no es válida.");
    return {
      planName: subscription.planName === null ? null : readText(subscription.planName),
      status: readText(subscription.status),
    };
  });
}

function selectPlanName(subscriptions: readonly SubscriptionSummary[]): string | null {
  return subscriptions.find((item) => item.status === "active" && item.planName)?.planName
    ?? subscriptions.find((item) => item.status === "trial" && item.planName)?.planName
    ?? subscriptions.find((item) => item.planName)?.planName
    ?? null;
}

function readApiError(payload: unknown): string {
  const envelope = readRecord(payload, "No se pudo obtener el plan.");
  const error = envelope.error && typeof envelope.error === "object" ? envelope.error as Record<string, unknown> : null;
  return error && typeof error.message === "string" ? error.message : "No se pudo obtener el plan.";
}

function readRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function readText(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("La respuesta contiene texto inválido.");
  return value.trim();
}
