import { OperationContextCoordinator, type OperationContextStore } from "@kontave/operation-context-application";
import { createOperationalDefaults, localDate, type OperationContextKey, type OperationalDefaults } from "@kontave/operation-context-domain";
import { currency, currencyCode, exchangeRate } from "@kontave/monetary-domain";
import { companyId, organizationId, userId } from "@kontave/organizations-domain";
import { NativeApiClient, NativeApiFailure } from "@kontave/native-api-client";
import type { NativeExchangeRateSetDto, NativeInventoryDashboardDto, NativeOperationalDefaultsDto } from "@kontave/native-api-contracts";
import type { DesktopAuthenticatedRequest } from "../auth/desktop-authenticated-request";
import type { DesktopInventoryDashboardQuery, DesktopInventoryDashboardResult } from "../../shared/desktop-api";

export class DesktopInventoryDashboardController {
  private readonly client: NativeApiClient;
  private readonly dashboardsInFlight = new Map<string, Promise<DesktopInventoryDashboardResult>>();

  constructor(baseUrl: string, authenticatedRequest: DesktopAuthenticatedRequest) {
    this.client = new NativeApiClient({
      baseUrl,
      client: "desktop",
      authenticatedFetch: (input, init) => authenticatedRequest.fetch(input, init),
    });
  }

  getDashboard(actorId: unknown, organization: unknown, company: unknown, rawQuery: unknown): Promise<DesktopInventoryDashboardResult> {
    if (![actorId, organization, company].every((value) => typeof value === "string" && value.length > 0)) {
      return Promise.resolve(failure(new Error("El contexto operativo no es válido."), "OPERATION_CONTEXT_INVALID"));
    }
    const query = readQuery(rawQuery);
    if (query === null) return Promise.resolve(failure(new Error("El período no es válido."), "INVENTORY_DASHBOARD_INVALID"));
    const requestKey = `${actorId as string}:${organization as string}:${company as string}:${query.from ?? "default"}:${query.to ?? "default"}`;
    const current = this.dashboardsInFlight.get(requestKey);
    if (current) return current;
    const operation = this.loadDashboard(actorId as string, organization as string, company as string, query)
      .finally(() => this.dashboardsInFlight.delete(requestKey));
    this.dashboardsInFlight.set(requestKey, operation);
    return operation;
  }

  private async loadDashboard(actorId: string, organization: string, company: string, query: DesktopInventoryDashboardQuery): Promise<DesktopInventoryDashboardResult> {
    const key = { userId: userId(actorId as string), organizationId: organizationId(organization as string), companyId: companyId(company as string) };
    try {
      const store = new NativeOperationContextStore(this.client);
      const coordinator = new OperationContextCoordinator(store, {
        historical: async () => { throw new Error("Desktop delegates exchange-rate resolution to the native API."); },
      }, desktopClock);
      await coordinator.initialize(key);
      const state = coordinator.getState();
      if (state.status !== "ready") throw state.status === "failed" ? state.failure : new Error("El contexto operativo no está disponible.");
      const to = query.to ?? state.value.effectiveDate;
      const from = query.from ?? `${to.slice(0, 8)}01`;
      const root = operationRoot(key);
      const [dashboard, exchangeRates] = await Promise.all([
        this.client.get<NativeInventoryDashboardDto>(`${root.replace("/operation-context", "/inventory/dashboard")}?from=${from}&to=${to}&granularity=day&limit=5`),
        this.client.get<NativeExchangeRateSetDto>(`${root}/exchange-rates?date=${encodeURIComponent(to)}`),
      ]);
      return { ok: true, value: { operationContext: encodeOperationalDefaults(state.value), exchangeRates, dashboard } };
    } catch (cause: unknown) {
      return failure(cause, "INVENTORY_DASHBOARD_UNAVAILABLE");
    }
  }
}

class NativeOperationContextStore implements OperationContextStore {
  constructor(private readonly client: NativeApiClient) {}
  async load(key: OperationContextKey): Promise<OperationalDefaults | null> {
    return decodeOperationalDefaults(await this.client.get<NativeOperationalDefaultsDto>(operationRoot(key)), key);
  }
  async save(value: OperationalDefaults, expectedVersion: number): Promise<OperationalDefaults> {
    const dto = await this.client.request<NativeOperationalDefaultsDto>(operationRoot(value.key), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion, effectiveDate: value.effectiveDate, presentationCurrency: value.presentationCurrency }),
    });
    return decodeOperationalDefaults(dto, value.key);
  }
  async clear(): Promise<void> { /* The persisted context is intentionally retained per company. */ }
}

const desktopClock = {
  now: () => new Date().toISOString(),
  today: () => localDate(new Date().toISOString().slice(0, 10)),
};

function operationRoot(key: OperationContextKey): string {
  return `/api/native/v1/organizations/${encodeURIComponent(key.organizationId)}/companies/${encodeURIComponent(key.companyId)}/operation-context`;
}

function decodeOperationalDefaults(dto: NativeOperationalDefaultsDto, key: OperationContextKey): OperationalDefaults {
  const selection = dto.exchangeRate.status === "unavailable"
    ? { status: "unavailable" as const, effectiveDate: localDate(dto.exchangeRate.effectiveDate) }
    : { status: "resolved" as const, value: {
      rate: exchangeRate({
        baseCurrency: currency(dto.exchangeRate.value.baseCurrency, 2),
        quoteCurrency: currency(dto.exchangeRate.value.quoteCurrency, 2),
        value: dto.exchangeRate.value.value,
      }),
      effectiveDate: dto.exchangeRate.value.effectiveDate,
      capturedAt: dto.exchangeRate.value.capturedAt,
      source: dto.exchangeRate.value.source,
    } };
  return createOperationalDefaults({ key, effectiveDate: localDate(dto.effectiveDate), presentationCurrency: currencyCode(dto.presentationCurrency), exchangeRate: selection, version: dto.version, updatedAt: dto.updatedAt });
}

function encodeOperationalDefaults(value: OperationalDefaults): NativeOperationalDefaultsDto {
  return {
    effectiveDate: value.effectiveDate,
    presentationCurrency: value.presentationCurrency,
    exchangeRate: value.exchangeRate.status === "unavailable"
      ? value.exchangeRate
      : { status: "resolved", value: {
        baseCurrency: value.exchangeRate.value.rate.baseCurrency.code,
        quoteCurrency: value.exchangeRate.value.rate.quoteCurrency.code,
        value: value.exchangeRate.value.rate.value,
        effectiveDate: value.exchangeRate.value.effectiveDate,
        capturedAt: value.exchangeRate.value.capturedAt,
        source: value.exchangeRate.value.source,
      } },
    version: value.version,
    updatedAt: value.updatedAt,
  };
}

function readQuery(value: unknown): DesktopInventoryDashboardQuery | null {
  if (value === undefined) return {};
  if (typeof value !== "object" || value === null) return null;
  const query = value as { readonly from?: unknown; readonly to?: unknown };
  if (query.from === undefined && query.to === undefined) return {};
  if (typeof query.from !== "string" || typeof query.to !== "string") return null;
  try {
    const from = localDate(query.from);
    const to = localDate(query.to);
    if (from > to) return null;
    const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
    return days <= 365 ? { from, to } : null;
  } catch { return null; }
}

function failure(cause: unknown, fallbackCode: string): DesktopInventoryDashboardResult {
  const nativeFailure = findNativeApiFailure(cause);
  if (nativeFailure) return { ok: false, error: { code: nativeFailure.code, message: nativeFailure.message, requestId: nativeFailure.requestId ?? crypto.randomUUID() } };
  return { ok: false, error: { code: fallbackCode, message: cause instanceof Error ? cause.message : "No se pudo cargar el tablero de inventario.", requestId: crypto.randomUUID() } };
}

function findNativeApiFailure(cause: unknown): NativeApiFailure | null {
  let current = cause;
  const visited = new Set<unknown>();
  while (current instanceof Error && !visited.has(current)) {
    if (current instanceof NativeApiFailure) return current;
    visited.add(current);
    current = current.cause;
  }
  return null;
}
