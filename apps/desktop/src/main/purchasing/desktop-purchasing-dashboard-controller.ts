import { localDate } from "@kontave/operation-context/domain";
import type {
  ClientPortFeature,
  OperationContextPort,
  PurchasingPort,
} from "@kontave/client-contracts";
import type {
  DesktopPurchasingDashboardQuery,
  DesktopPurchasingDashboardResult,
} from "../../renderer-bridge";
import {
  ClientOperationFailure,
  findClientOperationFailure,
  requireClientValue,
} from "../client/client-operation";

export class DesktopPurchasingDashboardController {
  private readonly inFlight = new Map<
    string,
    Promise<DesktopPurchasingDashboardResult>
  >();

  constructor(
    private readonly purchasing: ClientPortFeature<PurchasingPort>,
    private readonly operationContext: ClientPortFeature<OperationContextPort>,
  ) {}

  getDashboard(
    actor: unknown,
    organization: unknown,
    company: unknown,
    raw: unknown,
  ): Promise<DesktopPurchasingDashboardResult> {
    if (
      ![actor, organization, company].every(
        (value) => typeof value === "string" && value.trim().length > 0,
      )
    )
      return Promise.resolve(
        failure(
          new Error("El contexto operativo no es válido."),
          "OPERATION_CONTEXT_INVALID",
        ),
      );
    const query = readQuery(raw);
    if (query === null)
      return Promise.resolve(
        failure(
          new Error("El período no es válido."),
          "PURCHASING_DASHBOARD_INVALID",
        ),
      );
    const key = `${actor as string}:${organization as string}:${company as string}:${query.from ?? "default"}:${query.to ?? "default"}:${query.recentLimit ?? 5}`;
    const current = this.inFlight.get(key);
    if (current) return current;
    const operation = this.load(
      organization as string,
      company as string,
      query,
    ).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, operation);
    return operation;
  }

  private async load(
    organization: string,
    company: string,
    query: DesktopPurchasingDashboardQuery,
  ): Promise<DesktopPurchasingDashboardResult> {
    try {
      const context = requireClientValue(
        await this.operationContext.get(organization, company),
      );
      const period = resolvePurchasingDashboardPeriod(
        context.effectiveDate,
        query,
      );
      const limit = query.recentLimit ?? 5;
      const rateDate =
        period.to > context.effectiveDate ? context.effectiveDate : period.to;
      const [dashboardResult, exchangeRatesResult] = await Promise.all([
        this.purchasing.dashboard(organization, company, {
          ...period,
          granularity: "day",
          limit,
        }),
        this.operationContext.exchangeRates(organization, company, rateDate),
      ]);
      const dashboard = requireClientValue(dashboardResult);
      const exchangeRates = requireClientValue(exchangeRatesResult);
      return {
        ok: true,
        value: { operationContext: context, exchangeRates, dashboard },
      };
    } catch (cause) {
      return failure(cause, "PURCHASING_DASHBOARD_UNAVAILABLE");
    }
  }
}

export function resolvePurchasingDashboardPeriod(
  effectiveDate: string,
  query: DesktopPurchasingDashboardQuery,
): { readonly from: string; readonly to: string } {
  if (query.from !== undefined && query.to !== undefined)
    return { from: query.from, to: query.to };
  const month = localDate(effectiveDate).slice(0, 7);
  return { from: `${month}-01`, to: monthEnd(month) };
}

function readQuery(value: unknown): DesktopPurchasingDashboardQuery | null {
  if (value === undefined) return {};
  if (typeof value !== "object" || value === null) return null;
  const raw = value as {
    readonly from?: unknown;
    readonly to?: unknown;
    readonly recentLimit?: unknown;
  };
  if ((raw.from === undefined) !== (raw.to === undefined)) return null;
  if (
    raw.recentLimit !== undefined &&
    (!Number.isSafeInteger(raw.recentLimit) ||
      Number(raw.recentLimit) < 1 ||
      Number(raw.recentLimit) > 100)
  )
    return null;
  if (raw.from === undefined)
    return raw.recentLimit === undefined
      ? {}
      : { recentLimit: Number(raw.recentLimit) };
  if (typeof raw.from !== "string" || typeof raw.to !== "string") return null;
  try {
    const from = localDate(raw.from);
    const to = localDate(raw.to);
    const days =
      (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000;
    if (from > to || days > 365) return null;
    return {
      from,
      to,
      ...(raw.recentLimit === undefined
        ? {}
        : { recentLimit: Number(raw.recentLimit) }),
    };
  } catch {
    return null;
  }
}

function monthEnd(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
}
function failure(
  cause: unknown,
  fallback: string,
): DesktopPurchasingDashboardResult {
  const native = findFailure(cause);
  return native
    ? {
        ok: false,
        error: {
          code: native.code,
          message: native.message,
          requestId: native.requestId ?? null,
        },
      }
    : {
        ok: false,
        error: {
          code: fallback,
          message:
            cause instanceof Error
              ? cause.message
              : "No se pudo cargar el tablero de compras.",
          requestId: null,
        },
      };
}
function findFailure(cause: unknown): ClientOperationFailure | null {
  return findClientOperationFailure(cause);
}
