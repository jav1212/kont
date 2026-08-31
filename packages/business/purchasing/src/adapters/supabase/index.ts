import { currencyCode, exactDecimal } from "@kontave/monetary/domain";
import {
  PurchasingDashboardFailure,
  type PurchasingDashboardQuery,
  type PurchasingDashboardReader,
  type PurchasingDashboardSnapshot,
  type PurchasingFunctionalAmount,
  type PurchasingTransactionAmount,
} from "../../application/purchasing-dashboard";
import { purchasingDocumentId, supplierId } from "../../domain/identifiers";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const decimal = z.string().refine(
  (value) => {
    try {
      exactDecimal(value);
      return true;
    } catch {
      return false;
    }
  },
  { message: "Invalid exact decimal." },
);
const functional = z.object({ amount: decimal, currency: z.literal("VES") });
const supplier = z.object({
  id: z.string().nullable(),
  legalName: z.string().min(1),
  taxIdentifier: z.string().nullable(),
});
const transaction = z.object({ amount: decimal, currency: z.string() }).nullable();
const snapshotSchema = z.object({
  period: z.object({ from: date, to: date, granularity: z.literal("day") }),
  summary: z.object({
    confirmedPurchaseTotal: functional,
    vatCreditTotal: functional,
    vatWithheldTotal: functional,
    confirmedDocumentCount: z.number().int().nonnegative(),
    draftDocumentCount: z.number().int().nonnegative(),
  }),
  daily: z.array(
    z.object({
      date,
      confirmedPurchaseTotal: functional,
      vatCreditTotal: functional,
      confirmedDocumentCount: z.number().int().nonnegative(),
      draftDocumentCount: z.number().int().nonnegative(),
    }),
  ),
  topSuppliers: z
    .array(
      z.object({
        supplier,
        confirmedPurchaseTotal: functional,
        confirmedDocumentCount: z.number().int().nonnegative(),
      }),
    )
    .max(5),
  recentDocuments: z.array(
    z.object({
      id: z.string(),
      documentType: z.enum(["invoice", "credit_note", "debit_note"]),
      invoiceNumber: z.string(),
      controlNumber: z.string().nullable(),
      supplier,
      fiscalDate: date,
      status: z.enum(["draft", "confirmed"]),
      functionalAmounts: z.object({
        subtotal: functional,
        vat: functional,
        vatWithheld: functional,
        total: functional,
      }),
      transactionCurrency: z.string(),
      transactionAmounts: z.object({
        subtotal: transaction,
        vat: transaction,
        total: transaction,
      }),
    }),
  ),
  generatedAt: z.string().min(1),
});

type RawSnapshot = z.infer<typeof snapshotSchema>;

/** Connection details required by the purchasing dashboard adapter. */
export interface SupabasePurchasingDashboardConfiguration {
  readonly url: string;
  readonly serviceRoleKey: string;
}

/** Reads purchasing dashboard projections through the protected Supabase RPC. */
export class SupabasePurchasingDashboardReader implements PurchasingDashboardReader {
  /**
   * Creates a dashboard reader backed by a Supabase client.
   * @param client Client authorized to execute the shared dashboard RPC.
   */
  constructor(private readonly client: SupabaseClient) {}

  /** {@inheritDoc PurchasingDashboardReader.read} */
  async read(query: PurchasingDashboardQuery): Promise<PurchasingDashboardSnapshot> {
    const { data, error } = await this.client.rpc("get_shared_purchasing_dashboard_snapshot", {
      p_actor_user_id: query.actorUserId,
      p_organization_id: query.organizationId,
      p_company_id: query.companyId,
      p_from: query.from,
      p_to: query.to,
      p_granularity: query.granularity,
      p_recent_limit: query.recentLimit,
    });
    if (error) throw mapRpcFailure(error);

    const parsed = snapshotSchema.safeParse(data);
    if (!parsed.success) {
      throw unavailable("Purchasing dashboard returned invalid data.", parsed.error);
    }
    try {
      const snapshot = decode(parsed.data);
      if (snapshot.recentDocuments.length > query.recentLimit) {
        throw unavailable(
          "Purchasing dashboard exceeded the requested recent-document limit.",
          undefined,
        );
      }
      return snapshot;
    } catch (cause) {
      if (cause instanceof PurchasingDashboardFailure) throw cause;
      throw unavailable("Purchasing dashboard returned invalid data.", cause);
    }
  }
}

/**
 * Creates the production purchasing dashboard reader.
 * @param configuration Supabase endpoint and service-role credential.
 * @returns A reader that validates and decodes every RPC response.
 */
export function createSupabasePurchasingDashboardReader(
  configuration: SupabasePurchasingDashboardConfiguration,
): PurchasingDashboardReader {
  return new SupabasePurchasingDashboardReader(
    createClient(configuration.url, configuration.serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }),
  );
}

function decode(raw: RawSnapshot): PurchasingDashboardSnapshot {
  const amount = (value: z.infer<typeof functional>): PurchasingFunctionalAmount => ({
    amount: exactDecimal(value.amount),
    currency: "VES",
  });
  const original = (
    value: z.infer<typeof transaction>,
  ): PurchasingTransactionAmount | null =>
    value === null
      ? null
      : { amount: exactDecimal(value.amount), currency: currencyCode(value.currency) };
  const party = (value: z.infer<typeof supplier>) => ({
    id: value.id === null ? null : supplierId(value.id),
    legalName: value.legalName,
    taxIdentifier: value.taxIdentifier,
  });

  return {
    period: raw.period,
    summary: {
      ...raw.summary,
      confirmedPurchaseTotal: amount(raw.summary.confirmedPurchaseTotal),
      vatCreditTotal: amount(raw.summary.vatCreditTotal),
      vatWithheldTotal: amount(raw.summary.vatWithheldTotal),
    },
    daily: raw.daily.map((day) => ({
      ...day,
      confirmedPurchaseTotal: amount(day.confirmedPurchaseTotal),
      vatCreditTotal: amount(day.vatCreditTotal),
    })),
    topSuppliers: raw.topSuppliers.map((item) => ({
      ...item,
      supplier: party(item.supplier),
      confirmedPurchaseTotal: amount(item.confirmedPurchaseTotal),
    })),
    recentDocuments: raw.recentDocuments.map((document) => ({
      ...document,
      id: purchasingDocumentId(document.id),
      supplier: party(document.supplier),
      functionalAmounts: {
        subtotal: amount(document.functionalAmounts.subtotal),
        vat: amount(document.functionalAmounts.vat),
        vatWithheld: amount(document.functionalAmounts.vatWithheld),
        total: amount(document.functionalAmounts.total),
      },
      transactionCurrency: currencyCode(document.transactionCurrency),
      transactionAmounts: {
        subtotal: original(document.transactionAmounts.subtotal),
        vat: original(document.transactionAmounts.vat),
        total: original(document.transactionAmounts.total),
      },
    })),
    generatedAt: raw.generatedAt,
  };
}

function mapRpcFailure(error: { readonly message: string }): PurchasingDashboardFailure {
  if (error.message.includes("PURCHASING_DASHBOARD_ACCESS_DENIED")) {
    return new PurchasingDashboardFailure(
      "PURCHASING_DASHBOARD_ACCESS_DENIED",
      "Purchasing dashboard access was denied.",
    );
  }
  if (error.message.includes("PURCHASING_DASHBOARD_INVALID")) {
    return new PurchasingDashboardFailure(
      "PURCHASING_DASHBOARD_INVALID",
      "Purchasing dashboard query is invalid.",
    );
  }
  return unavailable("Purchasing dashboard is unavailable.", error);
}

function unavailable(message: string, cause: unknown): PurchasingDashboardFailure {
  return new PurchasingDashboardFailure("PURCHASING_DASHBOARD_UNAVAILABLE", message, { cause });
}
