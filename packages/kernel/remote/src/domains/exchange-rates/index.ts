import type {
  OfficialExchangeRateSetDto,
  OfficialExchangeRatesPort,
  OperationContextPort,
} from "@kontave/client-contracts";
import type { RemoteTransport } from "../../transport";
import { RemoteOperationContextPort } from "../operation-context";

/** Stable failure emitted while resolving official client exchange rates. */
export class RemoteExchangeRatesFailure extends Error {
  /**
   * Creates an exchange-rate failure.
   * @param code - Stable resolution failure code.
   * @param message - Safe user-facing message.
   * @param options - Error cause options.
   */
  constructor(
    readonly code: "RATE_UNAVAILABLE" | "RATE_INVALID_RESPONSE",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "RemoteExchangeRatesFailure";
  }
}

/** Portable official-rate adapter backed by the native operation context. */
export class RemoteOfficialExchangeRatesPort
  implements OfficialExchangeRatesPort
{
  private readonly operationContext: OperationContextPort;

  /**
   * Creates the adapter.
   * @param transport - Authenticated Client API transport.
   */
  constructor(transport: RemoteTransport) {
    this.operationContext = new RemoteOperationContextPort(transport);
  }

  /** {@inheritDoc OfficialExchangeRatesPort.current} */
  async current(
    organizationId: string,
    companyId: string,
    date = todayCaracas(),
  ): Promise<OfficialExchangeRateSetDto> {
    try {
      const set = await this.operationContext.exchangeRates(
        organizationId,
        companyId,
        date,
      );
      const rates = set.rates
        .filter(
          (snapshot) =>
            snapshot.quoteCurrency === "VES" &&
            snapshot.source.kind === "official",
        )
        .map((snapshot) => {
          const value = Number(snapshot.value);
          if (!Number.isFinite(value) || value <= 0)
            throw new RemoteExchangeRatesFailure(
              "RATE_INVALID_RESPONSE",
              "Kontave devolvió una tasa oficial no válida.",
            );
          return Object.freeze({
            code: snapshot.baseCurrency,
            value,
            effectiveDate: snapshot.effectiveDate,
            percentageChange: null,
          });
        });
      if (rates.length === 0)
        throw new RemoteExchangeRatesFailure(
          "RATE_UNAVAILABLE",
          "No hay tasas oficiales disponibles para esta empresa.",
        );
      return Object.freeze({
        effectiveDate: set.effectiveDate,
        rates: Object.freeze(rates),
      });
    } catch (cause: unknown) {
      if (cause instanceof RemoteExchangeRatesFailure) throw cause;
      throw new RemoteExchangeRatesFailure(
        "RATE_UNAVAILABLE",
        "No se pudo resolver la tasa oficial para la empresa activa.",
        { cause },
      );
    }
  }
}

function todayCaracas(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Caracas",
  });
}
