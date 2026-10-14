import { z } from "zod";
import type {
  CompanyDocumentSeriesConfigurationRepository,
  ConfigureCompanyDocumentSeriesSelectionRuleCommand,
  CreateCompanyDocumentNumberingSeriesCommand,
  ListCompanyDocumentNumberingSeriesQuery,
} from "../../application";
import {
  CompanyFailure,
  companyDocumentSeriesScope,
  companyDocumentType,
  type CompanyDocumentNumberingSeries,
  type CompanyDocumentSeriesSelectionRule,
} from "../../domain";
import type { CompanySupabaseConfiguration, CompanySupabaseSource } from "./index";

const scope = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("company"), organizationId: z.string().uuid(), companyId: z.string().min(1) }),
  z.object({ kind: z.literal("branch"), organizationId: z.string().uuid(), companyId: z.string().min(1), branchId: z.string().uuid() }),
]);
const seriesRow = z.object({
  id: z.string().uuid(), scope, documentType: z.string(), code: z.string(), prefix: z.string().nullable(),
  nextNumber: z.number().int(), maximumNumber: z.number().int(), active: z.boolean(), version: z.number().int().positive(),
});
const selectionRuleRow = z.object({
  scope, documentType: z.string(), policy: z.enum(["company_default", "branch_default", "explicit_series_required"]),
  defaultSeriesId: z.string().uuid().nullable(), version: z.number().int().positive(),
});

/**
 * Server-only source factory intentionally supplied by the parent Supabase adapter.
 * @param configuration - Trusted service-role configuration.
 * @returns Injectable RPC source.
 */
export type CompanyDocumentSeriesSourceFactory = (configuration: CompanySupabaseConfiguration) => CompanySupabaseSource;

/**
 * Creates a persistence adapter for series configuration only. It deliberately omits number
 * allocation because allocating a number requires an atomic document-owned issuance transaction.
 * @param configuration - Trusted service-role Supabase credentials.
 * @param sourceFactory - Internal factory used by the package's Supabase composition root.
 * @returns Configuration-only document series repository.
 * @throws {CompanyFailure} When configuration persistence is unavailable.
 */
export function createSupabaseCompanyDocumentSeriesConfigurationRepository(
  configuration: CompanySupabaseConfiguration,
  sourceFactory: CompanyDocumentSeriesSourceFactory,
): CompanyDocumentSeriesConfigurationRepository {
  return new SupabaseCompanyDocumentSeriesConfigurationRepository(sourceFactory(configuration));
}

/** Supabase RPC adapter for company document-series configuration. */
export class SupabaseCompanyDocumentSeriesConfigurationRepository implements CompanyDocumentSeriesConfigurationRepository {
  /** @param source - Injectable trusted RPC source. @returns Adapter instance. */
  constructor(private readonly source: CompanySupabaseSource) {}

  /** {@inheritDoc CompanyDocumentSeriesConfigurationRepository.createSeries} */
  async createSeries(command: CreateCompanyDocumentNumberingSeriesCommand): Promise<CompanyDocumentNumberingSeries> {
    const result = await this.rpc("create_native_company_document_series", {
      p_actor_user_id: command.actorUserId, p_organization_id: command.organizationId, p_company_id: command.companyId,
      p_idempotency_key: command.idempotencyKey, p_scope_kind: command.scope.kind,
      p_branch_id: command.scope.kind === "branch" ? command.scope.branchId : null,
      p_document_type: command.documentType, p_code: command.code, p_prefix: command.prefix,
      p_next_number: command.nextNumber, p_maximum_number: command.maximumNumber,
    });
    return decodeSeries(result);
  }

  /** {@inheritDoc CompanyDocumentSeriesConfigurationRepository.listSeries} */
  async listSeries(query: ListCompanyDocumentNumberingSeriesQuery): Promise<readonly CompanyDocumentNumberingSeries[]> {
    const result = await this.rpc("list_native_company_document_series", {
      p_actor_user_id: query.actorUserId, p_organization_id: query.organizationId, p_company_id: query.companyId,
      p_scope_kind: query.scope.kind, p_branch_id: query.scope.kind === "branch" ? query.scope.branchId : null,
      p_document_type: query.documentType ?? null,
    });
    if (!Array.isArray(result)) throw unavailable(new TypeError("Document series list response is invalid."));
    return Object.freeze(result.map(decodeSeries));
  }

  /** {@inheritDoc CompanyDocumentSeriesConfigurationRepository.configureSelectionRule} */
  async configureSelectionRule(command: ConfigureCompanyDocumentSeriesSelectionRuleCommand): Promise<CompanyDocumentSeriesSelectionRule> {
    const result = await this.rpc("configure_native_company_document_series_selection_rule", {
      p_actor_user_id: command.actorUserId, p_organization_id: command.organizationId, p_company_id: command.companyId,
      p_idempotency_key: command.idempotencyKey, p_scope_kind: command.scope.kind,
      p_branch_id: command.scope.kind === "branch" ? command.scope.branchId : null,
      p_document_type: command.documentType, p_expected_version: command.expectedVersion,
      p_policy: command.policy, p_default_series_id: command.defaultSeriesId,
    });
    return decodeSelectionRule(result);
  }

  private async rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
    try {
      const response = await this.source.rpc(name, args);
      if (response.error) throw rpcFailure(response.error);
      return response.data;
    } catch (cause) {
      if (cause instanceof CompanyFailure) throw cause;
      throw unavailable(cause);
    }
  }
}

function decodeSeries(value: unknown): CompanyDocumentNumberingSeries {
  const parsed = seriesRow.safeParse(value);
  if (!parsed.success) throw unavailable(parsed.error);
  try {
    return Object.freeze({
      id: parsed.data.id, scope: companyDocumentSeriesScope(parsed.data.scope), documentType: companyDocumentType(parsed.data.documentType),
      code: parsed.data.code, prefix: parsed.data.prefix, nextNumber: parsed.data.nextNumber,
      maximumNumber: parsed.data.maximumNumber, active: parsed.data.active, version: parsed.data.version,
    });
  } catch (cause) {
    throw unavailable(cause);
  }
}

function decodeSelectionRule(value: unknown): CompanyDocumentSeriesSelectionRule {
  const parsed = selectionRuleRow.safeParse(value);
  if (!parsed.success) throw unavailable(parsed.error);
  try {
    return Object.freeze({
      scope: companyDocumentSeriesScope(parsed.data.scope), documentType: companyDocumentType(parsed.data.documentType),
      policy: parsed.data.policy, defaultSeriesId: parsed.data.defaultSeriesId, version: parsed.data.version,
    });
  } catch (cause) {
    throw unavailable(cause);
  }
}

function rpcFailure(error: { readonly message: string }): CompanyFailure {
  const codes = [
    "COMPANY_DOCUMENT_SERIES_SELECTION_INVALID", "COMPANY_DOCUMENT_SERIES_VERSION_CONFLICT",
    "COMPANY_DOCUMENT_SERIES_IDEMPOTENCY_CONFLICT", "COMPANY_DOCUMENT_SERIES_NOT_FOUND",
    "COMPANY_DOCUMENT_SERIES_INVALID", "COMPANY_ACCESS_DENIED", "COMPANY_NOT_FOUND",
  ] as const;
  const code = codes.find((candidate) => error.message.includes(candidate));
  return new CompanyFailure(code ?? "COMPANY_REPOSITORY_UNAVAILABLE", code ? error.message : "Document series persistence is unavailable.", { cause: error });
}

function unavailable(cause: unknown): CompanyFailure {
  return new CompanyFailure("COMPANY_REPOSITORY_UNAVAILABLE", "Document series persistence is unavailable.", { cause });
}
