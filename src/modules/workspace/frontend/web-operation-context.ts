import {
  RemoteOperationContextPort,
  decodeOperationalDefaultsDto,
  type RemoteTransport,
} from "@kontave/client-remote";
import { OperationContextCoordinator } from "@kontave/operation-context/application";
import {
  OperationContextFailure,
  localDate,
} from "@kontave/operation-context/domain";
import { currency, exchangeRate } from "@kontave/monetary/domain";
import type { OrganizationWorkspace } from "../../organizations/contracts";
import type { Company } from "../../companies/frontend/hooks/use-companies";

/** Composes the portable operational coordinator over the cookie-authenticated Web boundary.
 * @param organization - Committed organization and its verified legacy tenant bridge.
 * @param company - Committed operational company.
 * @param signal - Invalidates all reads and writes when the workspace changes.
 * @param request - Browser fetch or a deterministic test transport.
 * @returns A fresh coordinator with remote DTO validation and optimistic persistence.
 */
export function createWebOperationContext(
  organization: OrganizationWorkspace,
  company: Company,
  signal: AbortSignal,
  request: typeof fetch = fetch,
): OperationContextCoordinator {
  const prefix = `/api/client/v1/organizations/${encodeURIComponent(organization.id)}/companies/${encodeURIComponent(company.id)}/operation-context`;
  const transport: RemoteTransport = {
    get: (path) => transport.request(path, { method: "GET" }),
    async request<T>(path: string, init: RequestInit): Promise<T> {
      if (path !== prefix && !path.startsWith(`${prefix}/`))
        throw new OperationContextFailure(
          "OPERATION_CONTEXT_ACCESS_DENIED",
          "El contexto operativo cambió.",
        );
      const headers = new Headers(init.headers);
      headers.set("X-Tenant-Id", organization.legacyTenantId);
      const response = await request(path.replace("/api/client/v1/", "/api/"), {
        ...init,
        headers,
        signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
        cache: "no-store",
      });
      const payload = (await response.json()) as { data?: T; code?: string };
      if (!response.ok || !payload.data) {
        const code =
          response.status === 409
            ? "OPERATION_CONTEXT_VERSION_CONFLICT"
            : response.status === 403
              ? "OPERATION_CONTEXT_ACCESS_DENIED"
              : "OPERATION_CONTEXT_REPOSITORY_UNAVAILABLE";
        throw new OperationContextFailure(
          code,
          response.status === 409
            ? "El contexto cambió. Recarga antes de intentarlo nuevamente."
            : "No se pudo obtener el contexto operativo.",
        );
      }
      return payload.data;
    },
  };
  const remote = new RemoteOperationContextPort(transport);
  return new OperationContextCoordinator(
    {
      load: async (key) =>
        decodeOperationalDefaultsDto(
          await remote.get(organization.id, company.id),
          key,
        ),
      async save(value, expectedVersion) {
        const selectedRate =
          value.exchangeRate.status === "resolved"
            ? value.exchangeRate.value
            : null;
        const dto = await remote.update(organization.id, company.id, {
          expectedVersion,
          effectiveDate: value.effectiveDate,
          presentationCurrency: value.presentationCurrency,
          ...(selectedRate?.source.kind === "manual"
            ? {
                manualExchangeRate: {
                  baseCurrency: selectedRate.rate.baseCurrency.code,
                  value: selectedRate.rate.value.toString(),
                  reason: selectedRate.source.reason,
                },
              }
            : {}),
        });
        return decodeOperationalDefaultsDto(dto, value.key);
      },
      clear: async () => {
        /* Remote defaults survive session shutdown. */
      },
    },
    {
      async historical(quoteCurrency, date) {
        const result = await remote.exchangeRates(
          organization.id,
          company.id,
          date,
        );
        return {
          ...result,
          freshness: { kind: "fresh" as const, retrievedAt: result.observedAt },
          rates: result.rates
            .filter((rate) => rate.quoteCurrency === quoteCurrency.code)
            .map((rate) => ({
              rate: exchangeRate({
                baseCurrency: currency(rate.baseCurrency, 2),
                quoteCurrency: currency(rate.quoteCurrency, 2),
                value: rate.value,
              }),
              effectiveDate: rate.effectiveDate,
              capturedAt: rate.capturedAt,
              source: rate.source,
            })),
        };
      },
    },
    {
      now: () => new Date().toISOString(),
      today: () =>
        localDate(
          new Intl.DateTimeFormat("en-CA", {
            timeZone: "America/Caracas",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date()),
        ),
    },
  );
}
