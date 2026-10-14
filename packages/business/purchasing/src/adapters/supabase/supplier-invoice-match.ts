import { companyId } from "@kontave/companies/domain";
import { organizationId, userId } from "@kontave/organizations/domain";
import { fiscalDocumentId, fiscalDocumentLineId, type FiscalDocument } from "@kontave/fiscal/domain";
import { SupabaseFiscalDocumentRepository } from "@kontave/fiscal/supabase";
import { SupabaseTaxationConfigurationRepository } from "@kontave/taxation/supabase";
import { currency, moneyFromMinor, type CurrencyDefinition } from "@kontave/monetary/domain";
import type { TaxReportingFact, TaxReportingScope } from "@kontave/tax-reporting/domain";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type {
  SupplierInvoiceMatchCommitPort,
  SupplierIdentityReader,
  SupplierInvoiceMatchRepository,
  SupplierInvoiceMatchWriter,
  FiscalDocumentReader,
} from "../../application";
import {
  goodsReceiptLineId,
  purchaseInstant,
  purchaseOrderLineId,
  purchaseQuantity,
  supplierInvoiceMatchId,
  SupplierInvoiceMatch,
  Supplier,
  supplierId,
  type SupplierInvoiceAllocation,
} from "../../domain";
import { PurchasingFailure } from "../../domain";
import { UnitOfMeasure } from "@kontave/products/domain";
import { ConfirmSupplierInvoiceMatch as ConfirmSupplierInvoiceMatchUseCase, SaveSupplierInvoiceMatchDraft as SaveSupplierInvoiceMatchDraftUseCase } from "../../application";

const currencySchema = z.object({ code: z.string().regex(/^[A-Z]{3}$/), minorUnit: z.number().int().min(0).max(100) });
const moneySchema = z.object({ minorAmount: z.union([z.string().regex(/^-?\d+$/), z.number().int().safe()]), currency: currencySchema });
const allocationSchema = z.object({
  fiscalLineId: z.string().min(1),
  orderLineId: z.string().min(1).nullable(),
  receiptLineId: z.string().min(1).nullable(),
  invoicedQuantity: z.object({ amount: z.string(), unit: z.nativeEnum(UnitOfMeasure) }),
  netAmount: moneySchema,
});
const matchSchema = z.object({
  id: z.string().min(1), companyId: z.string().min(1), supplierId: z.string().min(1), fiscalDocumentId: z.string().min(1),
  documentCurrency: currencySchema, allocations: z.array(allocationSchema).min(1), allocatedNetAmount: moneySchema,
  status: z.enum(["draft", "confirmed"]), confirmedAt: z.string().nullable(), version: z.number().int().nonnegative(),
});

/** Supabase adapter for scoped invoice-match drafts and atomic fiscal confirmation. */
export class SupabaseSupplierInvoiceMatchRepository implements SupplierInvoiceMatchRepository, SupplierInvoiceMatchWriter, SupplierInvoiceMatchCommitPort {
  /** Creates the adapter using a server-authorized Supabase client. @param client Supabase service client. @returns The configured adapter. @throws {PurchasingFailure} When the client is absent. */
  constructor(private readonly client: SupabaseClient) {
    if (!client) throw new PurchasingFailure("PURCHASE_INVOICE_MATCH_INVALID", "Invoice-match persistence requires a database client.");
  }

  /** {@inheritDoc SupplierInvoiceMatchRepository.find} */
  async find(scope: TaxReportingScope, id: SupplierInvoiceMatch["id"], actorId: string): Promise<SupplierInvoiceMatch | null> {
    if (!UUID.test(actorId)) throw new PurchasingFailure("PURCHASE_INVOICE_MATCH_INVALID", "Invoice-match lookup requires a valid authenticated actor id.");
    const { data, error } = await this.client.rpc("shared_supplier_invoice_match_find", {
      p_tenant_id: scope.tenantId,
      p_organization_id: scope.organizationId,
      p_company_id: scope.companyId,
      p_match_id: id,
      p_actor_id: actorId,
    });
    if (error) throw mapFailure(error.message);
    if (data === null) return null;
    return decodeMatch(readRecord(data).match_snapshot);
  }

  /** {@inheritDoc SupplierInvoiceMatchWriter.saveDraft} */
  async saveDraft(scope: TaxReportingScope, match: SupplierInvoiceMatch, actorId: string): Promise<SupplierInvoiceMatch> {
    if (!UUID.test(actorId)) throw new PurchasingFailure("PURCHASE_INVOICE_MATCH_INVALID", "Invoice-match draft requires a valid authenticated actor id.");
    const { data, error } = await this.client.rpc("shared_supplier_invoice_match_save_draft", {
      p_tenant_id: scope.tenantId,
      p_organization_id: scope.organizationId,
      p_company_id: scope.companyId,
      p_match_snapshot: JSON.parse(encode(match)),
      p_actor_id: actorId,
    });
    if (error) throw mapFailure(error.message);
    return decodeMatch(readRecord(data).match_snapshot);
  }

  /** {@inheritDoc SupplierInvoiceMatchCommitPort.commitInvoiceMatch} */
  async commitInvoiceMatch(match: SupplierInvoiceMatch, fact: TaxReportingFact, actorId: string, idempotencyKey: string): Promise<void> {
    if (match.status !== "confirmed" || fact.direction !== "purchase" || fact.scope.companyId !== match.companyId || !UUID.test(actorId) || !idempotencyKey.trim() || idempotencyKey.length > 128) {
      throw new PurchasingFailure("PURCHASE_INVOICE_MATCH_INVALID", "Atomic invoice confirmation request is malformed or has a mismatched fiscal scope.");
    }
    const { data, error } = await this.client.rpc("shared_supplier_invoice_match_confirm_with_tax_fact", {
      p_tenant_id: fact.scope.tenantId,
      p_organization_id: fact.scope.organizationId,
      p_company_id: fact.scope.companyId,
      p_match_snapshot: JSON.parse(encode(match)),
      p_fact_snapshot: JSON.parse(encode(fact)),
      p_actor_id: actorId,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw mapFailure(error.message);
    const result = readRecord(data);
    const persistedMatch = decodeMatch(result.match_snapshot);
    const persistedFact = readRecord(result.fact_snapshot);
    if (persistedMatch.id !== match.id || persistedMatch.status !== "confirmed" || persistedMatch.version !== match.version
      || persistedFact.id !== fact.id || typeof result.replayed !== "boolean") {
      throw new PurchasingFailure("PURCHASE_INVOICE_MATCH_INVALID", "Atomic confirmation returned snapshots inconsistent with its command.");
    }
  }
}

/** Adapter for authenticated purchasing lookup of a supplier identity. */
export class SupabaseSupplierIdentityReader implements SupplierIdentityReader {
  /** Creates a scoped supplier reader. @param client Server-authorized Supabase client. @returns The configured reader. @throws {PurchasingFailure} When the client is absent. */
  constructor(private readonly client: SupabaseClient) {
    if (!client) throw new PurchasingFailure("PURCHASE_INVOICE_MATCH_INVALID", "Supplier identity lookup requires a database client.");
  }

  /** {@inheritDoc SupplierIdentityReader.findForInvoiceMatch} */
  async findForInvoiceMatch(scope: TaxReportingScope, id: Supplier["id"], actorId: string): Promise<Supplier | null> {
    if (!UUID.test(actorId)) throw new PurchasingFailure("PURCHASE_INVOICE_MATCH_INVALID", "Supplier lookup requires a valid authenticated actor id.");
    const { data, error } = await this.client.rpc("shared_supplier_find_for_invoice_match", {
      p_tenant_id: scope.tenantId, p_organization_id: scope.organizationId, p_company_id: scope.companyId,
      p_supplier_id: id, p_actor_id: actorId,
    });
    if (error) throw mapFailure(error.message);
    if (data === null) return null;
    const row = readRecord(data);
    if (typeof row.id !== "string" || typeof row.company_id !== "string" || typeof row.name !== "string"
      || typeof row.rif !== "string" || typeof row.active !== "boolean") {
      throw new PurchasingFailure("PURCHASE_INVOICE_MATCH_INVALID", "Supplier identity lookup returned malformed data.");
    }
    return new Supplier({
      id: supplierId(row.id), companyId: companyId(row.company_id), legalName: row.name,
      tradeName: null, taxIdentifier: row.rif, status: row.active ? "active" : "inactive", version: 0,
    });
  }
}

/** Scoped reader that reuses fiscal's validated Supabase persistence codec. */
export class SupabasePurchasingFiscalDocumentReader implements FiscalDocumentReader {
  private readonly fiscal: SupabaseFiscalDocumentRepository;

  /** Creates a purchasing fiscal-document reader. @param client Server-authorized Supabase client. @returns The configured reader. @throws {PurchasingFailure} When the client is absent. */
  constructor(client: SupabaseClient) {
    if (!client) throw new PurchasingFailure("PURCHASE_INVOICE_MATCH_INVALID", "Fiscal-document lookup requires a database client.");
    this.fiscal = new SupabaseFiscalDocumentRepository(client);
  }

  /** {@inheritDoc FiscalDocumentReader.find} */
  find(scope: TaxReportingScope, id: FiscalDocument["id"]): Promise<FiscalDocument | null> {
    return this.fiscal.find({ tenantId: scope.tenantId, organizationId: scope.organizationId, companyId: companyId(scope.companyId) }, id);
  }
}

/**
 * Creates the Supabase-backed draft and confirmation actions.
 * @param client Server-authorized Supabase client shared by purchasing and fiscal adapters.
 * @returns Scoped repositories, readers, and application commands.
 * @throws {PurchasingFailure} When a dependency is unavailable.
 */
export function createSupabaseSupplierInvoiceMatchActions(client: SupabaseClient): {
  readonly matches: SupabaseSupplierInvoiceMatchRepository;
  readonly fiscal: SupabasePurchasingFiscalDocumentReader;
  readonly suppliers: SupabaseSupplierIdentityReader;
  readonly saveDraft: SaveSupplierInvoiceMatchDraftUseCase;
  readonly confirm: ConfirmSupplierInvoiceMatchUseCase;
} {
  const matches = new SupabaseSupplierInvoiceMatchRepository(client);
  const fiscal = new SupabasePurchasingFiscalDocumentReader(client);
  const suppliers = new SupabaseSupplierIdentityReader(client);
  const taxation = new SupabaseTaxationConfigurationRepository(client);
  const fiscalProfiles = {
    getEffectiveProfile(scope: TaxReportingScope, id: ReturnType<typeof supplierId>, effectiveDate: string, actorId: string) {
      return taxation.getCounterpartyFiscalProfile({ actorUserId: userId(actorId), organizationId: organizationId(scope.organizationId), companyId: companyId(scope.companyId) }, id, effectiveDate);
    },
  };
  return Object.freeze({
    matches,
    fiscal,
    suppliers,
    saveDraft: new SaveSupplierInvoiceMatchDraftUseCase(matches, fiscal, suppliers),
    confirm: new ConfirmSupplierInvoiceMatchUseCase(matches, fiscal, suppliers, fiscalProfiles, matches),
  });
}

function decodeMatch(value: unknown): SupplierInvoiceMatch {
  const parsed = matchSchema.safeParse(value);
  if (!parsed.success) throw new PurchasingFailure("PURCHASE_INVOICE_MATCH_INVALID", "Stored invoice match snapshot is malformed.", { cause: parsed.error });
  const state = parsed.data;
  const decodeMoney = (amount: z.infer<typeof moneySchema>): SupplierInvoiceAllocation["netAmount"] =>
    moneyFromMinor(BigInt(amount.minorAmount), currency(amount.currency.code, amount.currency.minorUnit));
  const documentCurrency: CurrencyDefinition = currency(state.documentCurrency.code, state.documentCurrency.minorUnit);
  const allocations: SupplierInvoiceAllocation[] = state.allocations.map((allocation) => ({
    fiscalLineId: fiscalDocumentLineId(allocation.fiscalLineId),
    orderLineId: allocation.orderLineId === null ? null : purchaseOrderLineId(allocation.orderLineId),
    receiptLineId: allocation.receiptLineId === null ? null : goodsReceiptLineId(allocation.receiptLineId),
    invoicedQuantity: purchaseQuantity(allocation.invoicedQuantity.amount, allocation.invoicedQuantity.unit),
    netAmount: decodeMoney(allocation.netAmount),
  }));
  return new SupplierInvoiceMatch({
    id: supplierInvoiceMatchId(state.id),
    companyId: companyId(state.companyId),
    supplierId: supplierId(state.supplierId),
    fiscalDocumentId: fiscalDocumentId(state.fiscalDocumentId),
    documentCurrency,
    allocations,
    allocatedNetAmount: decodeMoney(state.allocatedNetAmount),
    status: state.status,
    confirmedAt: state.confirmedAt === null ? null : purchaseInstant(state.confirmedAt),
    version: state.version,
  });
}

function encode(value: unknown): string {
  return JSON.stringify(value, (_key, nested: unknown) => typeof nested === "bigint" ? nested.toString() : nested);
}

function readRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new PurchasingFailure("PURCHASE_INVOICE_MATCH_INVALID", "Invoice-match persistence returned an invalid response.");
  return value as Record<string, unknown>;
}

function mapFailure(message: string): PurchasingFailure {
  const code = /\b(PURCHASE_[A-Z_]+|PURCHASING_[A-Z_]+)\b/.exec(message)?.[1];
  const known = new Set(["PURCHASE_NOT_FOUND", "PURCHASE_INVOICE_MATCH_INVALID", "PURCHASE_INVOICE_MATCH_CONFLICT", "PURCHASE_INVOICE_MATCH_IDEMPOTENCY_CONFLICT"]);
  return new PurchasingFailure(known.has(code ?? "") ? code as PurchasingFailure["code"] : "PURCHASE_INVOICE_MATCH_INVALID", message);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
