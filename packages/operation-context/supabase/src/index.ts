import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { currency, exchangeRate } from "@kontave/monetary-domain";
import type { OperationContextStore } from "@kontave/operation-context-application";
import {
  OperationContextFailure,
  createOperationalDefaults,
  localDate,
  type OperationContextKey,
  type OperationalDefaults,
} from "@kontave/operation-context-domain";
import { z } from "zod";

const rateSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("unavailable"), effectiveDate: z.string() }),
  z.object({
    status: z.literal("resolved"),
    value: z.object({
      baseCurrency: z.object({ code: z.string(), minorUnit: z.number().int().nonnegative() }),
      quoteCurrency: z.object({ code: z.string(), minorUnit: z.number().int().nonnegative() }),
      rate: z.string(), effectiveDate: z.string(), capturedAt: z.string(),
      source: z.union([
        z.object({ kind: z.literal("official"), authority: z.string(), reference: z.string().nullable() }),
        z.object({ kind: z.literal("manual"), reason: z.string() }),
      ]),
    }),
  }),
]);

const rowSchema = z.object({
  user_id: z.string(), organization_id: z.string(), company_id: z.string(),
  effective_date: z.string(), presentation_currency: z.string(), selected_rate: rateSchema,
  version: z.number().int().nonnegative(), updated_at: z.string(),
});

export interface OperationContextRowSource {
  /**
   * Loads one raw persistence row.
   *
   * @param key - Scoped operation-context key.
   * @returns Raw data and any database-reported error.
   */
  load(key: OperationContextKey): Promise<{ readonly data: unknown; readonly error: DatabaseError | null }>;
  /**
   * Saves one raw persistence row with optimistic concurrency.
   *
   * @param value - Validated operational defaults.
   * @param expectedVersion - Version that must currently be stored.
   * @returns Raw authoritative data and any database-reported error.
   */
  save(value: OperationalDefaults, expectedVersion: number): Promise<{ readonly data: unknown; readonly error: DatabaseError | null }>;
  /**
   * Removes one raw persistence row.
   *
   * @param key - Scoped operation-context key.
   * @returns Any database-reported error.
   */
  clear(key: OperationContextKey): Promise<{ readonly error: DatabaseError | null }>;
}

/** Minimal database error surface required by the adapter. */
export interface DatabaseError {
  readonly message: string;
  readonly code?: string;
}

/** Supabase-backed implementation of the operation-context persistence port. */
export class SupabaseOperationContextStore implements OperationContextStore {
  /**
   * Creates a store over an injectable row source.
   *
   * @param source - Raw persistence operations used by the adapter.
   */
  constructor(private readonly source: OperationContextRowSource) {}

  /**
   * Loads and validates the snapshot scoped to a key.
   *
   * @param key - Expected user, organization and company scope.
   * @returns The decoded snapshot, or `null` when none exists.
   * @throws {OperationContextFailure} When persistence, decoding or ownership validation fails.
   */
  async load(key: OperationContextKey): Promise<OperationalDefaults | null> {
    try {
      const result = await this.source.load(key);
      if (result.error) throw translate(result.error);
      return result.data === null ? null : decode(result.data, key);
    } catch (cause: unknown) {
      throw repositoryFailure(cause);
    }
  }

  /**
   * Saves and validates an authoritative snapshot using optimistic concurrency.
   *
   * @param value - Validated snapshot to persist.
   * @param expectedVersion - Version that must currently be stored.
   * @returns The decoded authoritative snapshot.
   * @throws {OperationContextFailure} When persistence, concurrency, decoding or ownership validation fails.
   */
  async save(value: OperationalDefaults, expectedVersion: number): Promise<OperationalDefaults> {
    try {
      const result = await this.source.save(value, expectedVersion);
      if (result.error) throw translate(result.error);
      return decode(result.data, value.key);
    } catch (cause: unknown) {
      throw repositoryFailure(cause);
    }
  }

  /**
   * Removes the snapshot scoped to a key.
   *
   * @param key - User, organization and company scope to clear.
   * @returns Nothing after the database confirms the operation.
   * @throws {OperationContextFailure} When persistence is unavailable or access is denied.
   */
  async clear(key: OperationContextKey): Promise<void> {
    try {
      const result = await this.source.clear(key);
      if (result.error) throw translate(result.error);
    } catch (cause: unknown) {
      throw repositoryFailure(cause);
    }
  }
}

class SupabaseOperationContextRowSource implements OperationContextRowSource {
  constructor(private readonly client: SupabaseClient) {}
  async load(key: OperationContextKey) {
    return this.client.rpc("get_shared_operation_context", {
      p_actor_user_id: key.userId, p_organization_id: key.organizationId, p_company_id: key.companyId,
    }).maybeSingle();
  }
  async save(value: OperationalDefaults, expectedVersion: number) {
    return this.client.rpc("update_shared_operation_context", {
      p_actor_user_id: value.key.userId,
      p_organization_id: value.key.organizationId,
      p_company_id: value.key.companyId,
      p_effective_date: value.effectiveDate,
      p_presentation_currency: value.presentationCurrency,
      p_selected_rate: encodeRate(value),
      p_expected_version: expectedVersion,
    }).single();
  }
  async clear(key: OperationContextKey) {
    return this.client.rpc("clear_shared_operation_context", {
      p_actor_user_id: key.userId, p_organization_id: key.organizationId, p_company_id: key.companyId,
    });
  }
}

/** Server-only credentials required to create the Supabase adapter. */
export interface SupabaseOperationContextConfiguration {
  readonly url: string;
  readonly serviceRoleKey: string;
}

/**
 * Creates a server-side operation-context store with session persistence disabled.
 *
 * @param configuration - Supabase URL and service-role credential.
 * @returns A configured operation-context persistence adapter.
 * @throws When the Supabase client rejects invalid construction parameters.
 */
export function createSupabaseOperationContextStore(configuration: SupabaseOperationContextConfiguration): SupabaseOperationContextStore {
  const client = createClient(configuration.url, configuration.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return new SupabaseOperationContextStore(new SupabaseOperationContextRowSource(client));
}

function encodeRate(value: OperationalDefaults): unknown {
  if (value.exchangeRate.status === "unavailable") return value.exchangeRate;
  const snapshot = value.exchangeRate.value;
  return {
    status: "resolved",
    value: {
      baseCurrency: snapshot.rate.baseCurrency,
      quoteCurrency: snapshot.rate.quoteCurrency,
      rate: snapshot.rate.value,
      effectiveDate: snapshot.effectiveDate,
      capturedAt: snapshot.capturedAt,
      source: snapshot.source,
    },
  };
}

function decode(value: unknown, expectedKey: OperationContextKey): OperationalDefaults {
  const parsed = rowSchema.safeParse(value);
  if (!parsed.success) throw new OperationContextFailure("OPERATION_CONTEXT_INVALID", "Stored operation context is invalid.", { cause: parsed.error });
  const row = parsed.data;
  if (row.user_id !== expectedKey.userId || row.organization_id !== expectedKey.organizationId || row.company_id !== expectedKey.companyId) {
    throw new OperationContextFailure("OPERATION_CONTEXT_ACCESS_DENIED", "Stored operation context belongs to another workspace.");
  }
  const selected = row.selected_rate.status === "unavailable"
    ? { status: "unavailable" as const, effectiveDate: localDate(row.selected_rate.effectiveDate) }
    : { status: "resolved" as const, value: {
      rate: exchangeRate({
        baseCurrency: currency(row.selected_rate.value.baseCurrency.code, row.selected_rate.value.baseCurrency.minorUnit),
        quoteCurrency: currency(row.selected_rate.value.quoteCurrency.code, row.selected_rate.value.quoteCurrency.minorUnit),
        value: row.selected_rate.value.rate,
      }),
      effectiveDate: row.selected_rate.value.effectiveDate,
      capturedAt: row.selected_rate.value.capturedAt,
      source: row.selected_rate.value.source,
    } };
  return createOperationalDefaults({
    key: expectedKey, effectiveDate: localDate(row.effective_date), presentationCurrency: row.presentation_currency as OperationalDefaults["presentationCurrency"],
    exchangeRate: selected, version: row.version, updatedAt: row.updated_at,
  });
}

function translate(error: DatabaseError): OperationContextFailure {
  const message = error.message.toUpperCase();
  if (message.includes("OPERATION_CONTEXT_VERSION_CONFLICT")) return new OperationContextFailure("OPERATION_CONTEXT_VERSION_CONFLICT", "Operation context changed in another client.");
  if (message.includes("OPERATION_CONTEXT_ACCESS_DENIED")) return new OperationContextFailure("OPERATION_CONTEXT_ACCESS_DENIED", "The user cannot access this operation context.");
  if (message.includes("OPERATION_CONTEXT_INVALID")) return new OperationContextFailure("OPERATION_CONTEXT_INVALID", "Operation context data is invalid.");
  return new OperationContextFailure("OPERATION_CONTEXT_REPOSITORY_UNAVAILABLE", "Operation context persistence is unavailable.", { cause: error });
}

function repositoryFailure(cause: unknown): OperationContextFailure {
  if (cause instanceof OperationContextFailure) return cause;
  return new OperationContextFailure("OPERATION_CONTEXT_REPOSITORY_UNAVAILABLE", "Operation context persistence is unavailable.", { cause });
}
