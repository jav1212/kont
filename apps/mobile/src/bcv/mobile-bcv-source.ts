import Constants from "expo-constants";

export interface MobileBcvRate {
  readonly code: string;
  readonly country: string;
  readonly buy: number;
  readonly sell: number;
  readonly date: string;
  readonly percentageChange: number | null;
}

export interface MobileBcvSnapshot {
  readonly date: string;
  readonly rates: readonly MobileBcvRate[];
}

export class MobileBcvFailure extends Error {
  constructor(readonly code: "BCV_UNAVAILABLE" | "BCV_INVALID_RESPONSE", message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "MobileBcvFailure";
  }
}

export class MobileBcvSource {
  constructor(private readonly request: (input: URL | string, init?: RequestInit) => Promise<Response>) {}

  async current(): Promise<MobileBcvSnapshot> {
    const baseUrl = typeof Constants.expoConfig?.extra?.apiBaseUrl === "string" ? Constants.expoConfig.extra.apiBaseUrl : "https://kontave.com";
    try {
      const response = await this.request(new URL("/api/bcv/rates", baseUrl), { headers: { accept: "application/json" } });
      const payload: unknown = await response.json();
      if (!response.ok) throw new MobileBcvFailure("BCV_UNAVAILABLE", readError(payload));
      if (!isSnapshot(payload)) throw new MobileBcvFailure("BCV_INVALID_RESPONSE", "Kontave devolvió tasas BCV no válidas.");
      return { date: payload.date, rates: Object.freeze(payload.rates.map((rate) => Object.freeze({ ...rate }))) };
    } catch (cause: unknown) {
      if (cause instanceof MobileBcvFailure) throw cause;
      throw new MobileBcvFailure("BCV_UNAVAILABLE", "No se pudo conectar con el servicio BCV.", { cause });
    }
  }
}

function isSnapshot(value: unknown): value is { readonly date: string; readonly rates: readonly MobileBcvRate[] } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.date === "string" && Array.isArray(record.rates) && record.rates.every(isRate);
}

function isRate(value: unknown): value is MobileBcvRate {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const rate = value as Record<string, unknown>;
  return typeof rate.code === "string" && /^[A-Z]{3}$/.test(rate.code)
    && typeof rate.country === "string" && typeof rate.sell === "number" && Number.isFinite(rate.sell) && rate.sell > 0
    && typeof rate.buy === "number" && typeof rate.date === "string"
    && (rate.percentageChange === null || typeof rate.percentageChange === "number");
}

function readError(value: unknown): string {
  if (value && typeof value === "object" && !Array.isArray(value) && typeof (value as Record<string, unknown>).error === "string") return (value as { error: string }).error;
  return "No se pudieron consultar las tasas BCV.";
}
