import {
  OperationContextCoordinator,
  type OperationContextStore,
} from "@kontave/operation-context/application";
import {
  createOperationalDefaults,
  localDate,
  type OperationContextKey,
  type OperationalDefaults,
} from "@kontave/operation-context/domain";
import { currency, currencyCode, exchangeRate } from "@kontave/monetary/domain";
import {
  companyId,
  organizationId,
  userId,
} from "@kontave/organizations/domain";
import type {
  ClientPortFeature,
  OperationalDefaultsDto,
  OperationContextPort,
  SalesPort,
} from "@kontave/client-contracts";
import type { DesktopSalesDashboardResult } from "../../renderer-bridge";
import {
  findClientOperationFailure,
  requireClientValue,
} from "../client/client-operation";

type ValidSalesDashboardQuery = {
  readonly from?: string;
  readonly to?: string;
  readonly granularity: "day";
  readonly recentLimit: number;
};

/** Coordinates Desktop sales presentation with portable remote adapters. */
export class DesktopSalesDashboardController {
  private readonly inFlight = new Map<
    string,
    Promise<DesktopSalesDashboardResult>
  >();

  /**
   * Creates the controller over portable client features.
   * @param operationContext - Portable operational-context feature.
   * @param sales - Portable sales feature.
   */
  constructor(
    private readonly operationContext: ClientPortFeature<OperationContextPort>,
    private readonly sales: ClientPortFeature<SalesPort>,
  ) {}

  /**
   * Loads and coalesces a sales dashboard request.
   * @param actor - Authenticated user identifier.
   * @param organization - Owning organization identifier.
   * @param company - Operational company identifier.
   * @param raw - Untrusted date-range query.
   * @returns Desktop-safe sales result.
   */
  getDashboard(
    actor: unknown,
    organization: unknown,
    company: unknown,
    raw: unknown,
  ): Promise<DesktopSalesDashboardResult> {
    if (
      ![actor, organization, company].every(
        (value) => typeof value === "string" && value.length > 0,
      )
    )
      return Promise.resolve(
        failure(
          new Error("El contexto operativo no es válido."),
          "OPERATION_CONTEXT_INVALID",
        ),
      );
    const query = readQuery(raw);
    if (!query)
      return Promise.resolve(
        failure(
          new Error("El período no es válido."),
          "SALES_DASHBOARD_INVALID",
        ),
      );
    const requestKey = `${actor}:${organization}:${company}:${query.from ?? "default"}:${query.to ?? "default"}:${query.granularity}:${query.recentLimit}`;
    const current = this.inFlight.get(requestKey);
    if (current) return current;
    const operation = this.load(
      actor as string,
      organization as string,
      company as string,
      query,
    ).finally(() => this.inFlight.delete(requestKey));
    this.inFlight.set(requestKey, operation);
    return operation;
  }

  private async load(
    actor: string,
    organization: string,
    company: string,
    query: ValidSalesDashboardQuery,
  ): Promise<DesktopSalesDashboardResult> {
    const key = {
      userId: userId(actor),
      organizationId: organizationId(organization),
      companyId: companyId(company),
    };
    try {
      const coordinator = new OperationContextCoordinator(
        new ContextStore(this.operationContext),
        {
          historical: async () => {
            throw new Error(
              "Desktop delegates exchange-rate resolution to the native API.",
            );
          },
        },
        clock,
      );
      await coordinator.initialize(key);
      const state = coordinator.getState();
      if (state.status !== "ready")
        throw state.status === "failed"
          ? state.failure
          : new Error("El contexto operativo no está disponible.");
      const to = query.to ?? state.value.effectiveDate;
      const from = query.from ?? `${to.slice(0, 8)}01`;
      const [dashboardResult, ratesResult] = await Promise.all([
        this.sales.dashboard(organization, company, {
          from,
          to,
          granularity: query.granularity,
          limit: query.recentLimit,
        }),
        this.operationContext.exchangeRates(organization, company, to),
      ]);
      const dashboard = requireClientValue(dashboardResult);
      const rates = requireClientValue(ratesResult);
      return {
        ok: true,
        value: {
          operationContext: encode(state.value),
          exchangeRates: rates,
          dashboard,
        },
      };
    } catch (cause: unknown) {
      return failure(cause, "SALES_DASHBOARD_UNAVAILABLE");
    }
  }
}

class ContextStore implements OperationContextStore {
  constructor(
    private readonly remote: ClientPortFeature<OperationContextPort>,
  ) {}

  async load(key: OperationContextKey): Promise<OperationalDefaults> {
    const dto = requireClientValue(
      await this.remote.get(key.organizationId, key.companyId),
    );
    const selection =
      dto.exchangeRate.status === "unavailable"
        ? {
            status: "unavailable" as const,
            effectiveDate: localDate(dto.exchangeRate.effectiveDate),
          }
        : {
            status: "resolved" as const,
            value: {
              rate: exchangeRate({
                baseCurrency: currency(dto.exchangeRate.value.baseCurrency, 2),
                quoteCurrency: currency(
                  dto.exchangeRate.value.quoteCurrency,
                  2,
                ),
                value: dto.exchangeRate.value.value,
              }),
              effectiveDate: dto.exchangeRate.value.effectiveDate,
              capturedAt: dto.exchangeRate.value.capturedAt,
              source: dto.exchangeRate.value.source,
            },
          };
    return createOperationalDefaults({
      key,
      effectiveDate: localDate(dto.effectiveDate),
      presentationCurrency: currencyCode(dto.presentationCurrency),
      exchangeRate: selection,
      version: dto.version,
      updatedAt: dto.updatedAt,
    });
  }

  async save(): Promise<OperationalDefaults> {
    throw new Error("Sales dashboard does not update the operation context.");
  }

  async clear(): Promise<void> {}
}

const clock = {
  now: () => new Date().toISOString(),
  today: () => localDate(new Date().toISOString().slice(0, 10)),
};

function encode(value: OperationalDefaults): OperationalDefaultsDto {
  return {
    effectiveDate: value.effectiveDate,
    presentationCurrency: value.presentationCurrency,
    exchangeRate:
      value.exchangeRate.status === "unavailable"
        ? value.exchangeRate
        : {
            status: "resolved",
            value: {
              baseCurrency: value.exchangeRate.value.rate.baseCurrency.code,
              quoteCurrency: value.exchangeRate.value.rate.quoteCurrency.code,
              value: value.exchangeRate.value.rate.value,
              effectiveDate: value.exchangeRate.value.effectiveDate,
              capturedAt: value.exchangeRate.value.capturedAt,
              source: value.exchangeRate.value.source,
            },
          },
    version: value.version,
    updatedAt: value.updatedAt,
  };
}

function readQuery(value: unknown): ValidSalesDashboardQuery | null {
  if (value === undefined) return { granularity: "day", recentLimit: 5 };
  if (typeof value !== "object" || value === null) return null;
  const query = value as {
    from?: unknown;
    to?: unknown;
    granularity?: unknown;
    recentLimit?: unknown;
  };
  const granularity = query.granularity ?? "day";
  const recentLimit = query.recentLimit ?? 5;
  if (
    granularity !== "day" ||
    !Number.isSafeInteger(recentLimit) ||
    Number(recentLimit) < 1 ||
    Number(recentLimit) > 100
  )
    return null;
  if (query.from === undefined && query.to === undefined)
    return { granularity, recentLimit: Number(recentLimit) };
  if (typeof query.from !== "string" || typeof query.to !== "string")
    return null;
  try {
    const from = localDate(query.from);
    const to = localDate(query.to);
    return from <= to &&
      (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
        86_400_000 <=
        365
      ? { from, to, granularity, recentLimit: Number(recentLimit) }
      : null;
  } catch {
    return null;
  }
}

function failure(
  cause: unknown,
  fallback: string,
): DesktopSalesDashboardResult {
  const clientFailure = findClientOperationFailure(cause);
  if (clientFailure)
    return {
      ok: false,
      error: {
        code: clientFailure.code,
        message: clientFailure.message,
        requestId: clientFailure.requestId,
      },
    };
  return {
    ok: false,
    error: {
      code: fallback,
      message:
        cause instanceof Error
          ? cause.message
          : "No se pudo cargar el tablero de ventas.",
      requestId: null,
    },
  };
}
