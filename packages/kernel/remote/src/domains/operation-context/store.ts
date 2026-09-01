import type {
  OperationalDefaultsDto,
  OperationContextPort,
  UpdateOperationalDefaultsDto,
} from "@kontave/client-contracts";
import type { OperationContextStore } from "@kontave/operation-context/application";
import {
  createOperationalDefaults,
  localDate,
  type OperationContextKey,
  type OperationalDefaults,
} from "@kontave/operation-context/domain";
import { currency, currencyCode, exchangeRate } from "@kontave/monetary/domain";

/**
 * Minimal remote operation-context surface accepted by the portable store.
 * It is intentionally limited to raw ports so this transport adapter does not
 * depend outward on a runtime or a platform presentation boundary.
 */
export interface RemoteOperationContextStorePort {
  /** @param organizationId - Owning organization. @param companyId - Operational company. @returns Serialized operational defaults. */
  get(organizationId: string, companyId: string): Promise<OperationalDefaultsDto>;
  /** @param organizationId - Owning organization. @param companyId - Operational company. @param command - Versioned serialized update. @returns Serialized operational defaults. */
  update(organizationId: string, companyId: string, command: UpdateOperationalDefaultsDto): Promise<OperationalDefaultsDto>;
}

/**
 * Adapts the portable remote operation-context contract to the domain store.
 * The remote API remains authoritative; `clear` intentionally retains its
 * per-company defaults because that API has no destructive operation.
 */
export class RemoteOperationContextStore implements OperationContextStore {
  /**
   * Creates a remote-backed operation-context store.
   * @param remote - Raw remote operation-context port.
   */
  constructor(private readonly remote: RemoteOperationContextStorePort) {}

  /** {@inheritDoc OperationContextStore.load} */
  async load(key: OperationContextKey): Promise<OperationalDefaults | null> {
    const dto = await this.remote.get(key.organizationId, key.companyId);
    return decodeOperationalDefaultsDto(dto, key);
  }

  /** {@inheritDoc OperationContextStore.save} */
  async save(value: OperationalDefaults, expectedVersion: number): Promise<OperationalDefaults> {
    const dto = await this.remote.update(value.key.organizationId, value.key.companyId, {
      expectedVersion,
      effectiveDate: value.effectiveDate,
      presentationCurrency: value.presentationCurrency,
    });
    return decodeOperationalDefaultsDto(dto, value.key);
  }

  /** {@inheritDoc OperationContextStore.clear} */
  async clear(_key: OperationContextKey): Promise<void> {
    // Remote defaults are durable company preferences and the public API does
    // not expose deletion. Retaining them preserves current server semantics.
  }
}

/**
 * Creates the remote-backed operation-context store used by platform clients.
 * @param remote - Raw remote operation-context port.
 * @returns Store that maps serialized DTOs to validated domain values.
 */
export function createRemoteOperationContextStore(remote: OperationContextPort): RemoteOperationContextStore {
  return new RemoteOperationContextStore(remote);
}

/**
 * Decodes a serialized operation-context DTO into a validated domain snapshot.
 * @param dto - Server-provided serializable defaults.
 * @param key - Authenticated user, organization, and company scope to attach.
 * @returns Immutable domain defaults with exact exchange-rate decimal values.
 * @throws When the remote DTO violates operation-context or monetary invariants.
 */
export function decodeOperationalDefaultsDto(dto: OperationalDefaultsDto, key: OperationContextKey): OperationalDefaults {
  const exchangeRateSelection = dto.exchangeRate.status === "unavailable"
    ? { status: "unavailable" as const, effectiveDate: localDate(dto.exchangeRate.effectiveDate) }
    : {
        status: "resolved" as const,
        value: {
          rate: exchangeRate({
            baseCurrency: currency(dto.exchangeRate.value.baseCurrency, 2),
            quoteCurrency: currency(dto.exchangeRate.value.quoteCurrency, 2),
            value: dto.exchangeRate.value.value,
          }),
          effectiveDate: localDate(dto.exchangeRate.value.effectiveDate),
          capturedAt: dto.exchangeRate.value.capturedAt,
          source: dto.exchangeRate.value.source,
        },
      };
  return createOperationalDefaults({
    key,
    effectiveDate: localDate(dto.effectiveDate),
    presentationCurrency: currencyCode(dto.presentationCurrency),
    exchangeRate: exchangeRateSelection,
    version: dto.version,
    updatedAt: dto.updatedAt,
  });
}
