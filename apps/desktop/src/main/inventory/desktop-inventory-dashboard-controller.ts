import {
  OperationContextCoordinator,
  type OperationContextStore,
} from "@kontave/operation-context/application";
import {
  localDate,
  type OperationalDefaults,
} from "@kontave/operation-context/domain";
import {
  companyId,
  organizationId,
  userId,
} from "@kontave/organizations/domain";
import type {
  ClientPortFeature,
  InventoryPort,
  OperationalDefaultsDto,
  OperationContextPort,
} from "@kontave/client-contracts";
import {
  ClientOperationFailure,
  findClientOperationFailure,
  unwrapClientOperationResult,
} from "@kontave/client-runtime";
import { publicFailureMessage } from "../client/client-operation";
import type {
  DesktopInventoryDashboardQuery,
  DesktopInventoryDashboardResult,
} from "../../renderer-bridge";

/** Adapts portable inventory dashboards to Desktop defaults and result envelopes. */
export class DesktopInventoryDashboardController {
  private readonly dashboardsInFlight = new Map<
    string,
    Promise<DesktopInventoryDashboardResult>
  >();

  /**
   * Creates a dashboard controller over portable remote features.
   * @param inventory - Inventory feature port.
   * @param operationContext - Operational-context feature port.
   * @param operationContextStore - Shared context cache used to avoid duplicate requests.
   */
  constructor(
    private readonly inventory: ClientPortFeature<InventoryPort>,
    private readonly operationContext: ClientPortFeature<OperationContextPort>,
    private readonly operationContextStore: OperationContextStore,
  ) {}

  /**
   * Loads and coalesces an inventory dashboard request.
   * @param actorId - Authenticated actor selected by the main process.
   * @param organization - Organization identifier.
   * @param company - Company identifier.
   * @param rawQuery - Boundary-validated Desktop dashboard query.
   * @returns A presentation-safe dashboard result.
   */
  getDashboard(
    actorId: unknown,
    organization: unknown,
    company: unknown,
    rawQuery: unknown,
  ): Promise<DesktopInventoryDashboardResult> {
    if (
      ![actorId, organization, company].every(
        (value) => typeof value === "string" && value.length > 0,
      )
    ) {
      return Promise.resolve(
        failure(
          new Error("El contexto operativo no es válido."),
          "OPERATION_CONTEXT_INVALID",
        ),
      );
    }
    const query = readQuery(rawQuery);
    if (query === null)
      return Promise.resolve(
        failure(
          new Error("El período no es válido."),
          "INVENTORY_DASHBOARD_INVALID",
        ),
      );
    const requestKey = `${actorId as string}:${organization as string}:${company as string}:${query.from ?? "default"}:${query.to ?? "default"}`;
    const current = this.dashboardsInFlight.get(requestKey);
    if (current) return current;
    const operation = this.loadDashboard(
      actorId as string,
      organization as string,
      company as string,
      query,
    ).finally(() => this.dashboardsInFlight.delete(requestKey));
    this.dashboardsInFlight.set(requestKey, operation);
    return operation;
  }

  private async loadDashboard(
    actorId: string,
    organization: string,
    company: string,
    query: DesktopInventoryDashboardQuery,
  ): Promise<DesktopInventoryDashboardResult> {
    const key = {
      userId: userId(actorId as string),
      organizationId: organizationId(organization as string),
      companyId: companyId(company as string),
    };
    try {
      const coordinator = new OperationContextCoordinator(
        this.operationContextStore,
        {
          historical: async () => {
            throw new Error(
              "Desktop delegates exchange-rate resolution to the native API.",
            );
          },
        },
        desktopClock,
      );
      await coordinator.initialize(key);
      const state = coordinator.getState();
      if (state.status !== "ready")
        throw state.status === "failed"
          ? state.failure
          : new Error("El contexto operativo no está disponible.");
      const to = query.to ?? state.value.effectiveDate;
      const from = query.from ?? `${to.slice(0, 8)}01`;
      const [dashboardResult, exchangeRatesResult] = await Promise.all([
        this.inventory.dashboard(organization, company, {
          from,
          to,
          granularity: "day",
          limit: 5,
        }),
        this.operationContext.exchangeRates(organization, company, to),
      ]);
      const dashboard = unwrapClientOperationResult(dashboardResult);
      const exchangeRates = unwrapClientOperationResult(exchangeRatesResult);
      return {
        ok: true,
        value: {
          operationContext: encodeOperationalDefaults(state.value),
          exchangeRates,
          dashboard,
        },
      };
    } catch (cause: unknown) {
      return failure(cause, "INVENTORY_DASHBOARD_UNAVAILABLE");
    }
  }
}

const desktopClock = {
  now: () => new Date().toISOString(),
  today: () => localDate(new Date().toISOString().slice(0, 10)),
};

function encodeOperationalDefaults(
  value: OperationalDefaults,
): OperationalDefaultsDto {
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

function readQuery(value: unknown): DesktopInventoryDashboardQuery | null {
  if (value === undefined) return {};
  if (typeof value !== "object" || value === null) return null;
  const query = value as { readonly from?: unknown; readonly to?: unknown };
  if (query.from === undefined && query.to === undefined) return {};
  if (typeof query.from !== "string" || typeof query.to !== "string")
    return null;
  try {
    const from = localDate(query.from);
    const to = localDate(query.to);
    if (from > to) return null;
    const days =
      (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000;
    return days <= 365 ? { from, to } : null;
  } catch {
    return null;
  }
}

function failure(
  cause: unknown,
  fallbackCode: string,
): DesktopInventoryDashboardResult {
  const remoteFailure = findRemoteFailure(cause);
  if (remoteFailure)
    return {
      ok: false,
      error: {
        code: remoteFailure.code,
        message: publicFailureMessage(remoteFailure.code),
        requestId: remoteFailure.requestId ?? crypto.randomUUID(),
      },
    };
  return {
    ok: false,
    error: {
      code: fallbackCode,
      message: publicFailureMessage(fallbackCode),
      requestId: crypto.randomUUID(),
    },
  };
}

function findRemoteFailure(cause: unknown): ClientOperationFailure | null {
  return findClientOperationFailure(cause);
}
