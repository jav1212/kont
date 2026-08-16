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
  load(key: OperationContextKey): Promise<{ readonly data: unknown; readonly error: DatabaseError | null }>;
  save(value: OperationalDefaults, expectedVersion: number): Promise<{ readonly data: unknown; readonly error: DatabaseError | null }>;
  clear(key: OperationContextKey): Promise<{ readonly error: DatabaseError | null }>;
}

interface DatabaseError { readonly message: string; readonly code?: string }

export class SupabaseOperationContextStore implements OperationContextStore {
  constructor(private readonly source: OperationContextRowSource) {}
  async load(key: OperationContextKey): Promise<OperationalDefaults | null> {
    const result = await this.source.load(key);
    if (result.error) throw translate(result.error);
    return result.data === null ? null : decode(result.data, key);
  }
  async save(value: OperationalDefaults, expectedVersion: number): Promise<OperationalDefaults> {
    const result = await this.source.save(value, expectedVersion);
    if (result.error) throw translate(result.error);
    return decode(result.data, value.key);
  }
  async clear(key: OperationContextKey): Promise<void> {
    const result = await this.source.clear(key);
    if (result.error) throw translate(result.error);
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

export function createSupabaseOperationContextStore(configuration: { readonly url: string; readonly serviceRoleKey: string }): SupabaseOperationContextStore {
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
