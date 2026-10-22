import {
  AccountingIntegrationFailure,
  type AccountingIntegrationConfigurationRule,
  type AccountingIntegrationRuleConfiguration,
  type AccountingIntegrationSource,
} from "../../domain";
import {
  type AccountingIntegrationRuleConfigurationRepository,
  type AccountingIntegrationRuleConfigurationScope,
  type ReplaceAccountingIntegrationRuleConfigurationInput,
} from "../../application";

/** Minimal service-role RPC transport used by accounting rule configuration adapters. */
export interface AccountingIntegrationRuleConfigurationSupabaseSource {
  /**
   * Calls one of the authorized accounting configuration RPCs.
   * @param name - RPC function name owned by the accounting integration schema.
   * @param values - Named RPC arguments.
   * @returns RPC data or its reported database error.
   */
  rpc(name: string, values: Record<string, unknown>): PromiseLike<{ data: unknown; error: { readonly message?: string; readonly code?: string } | null }>;
}

/** Supabase RPC adapter for full editable accounting rule configuration. */
export class SupabaseAccountingIntegrationRuleConfigurationRepository implements AccountingIntegrationRuleConfigurationRepository {
  /**
   * @param source - Service-only RPC transport; the native functions enforce permissions and company scope.
   * @returns A repository for versioned accounting configuration.
   */
  public constructor(private readonly source: AccountingIntegrationRuleConfigurationSupabaseSource) {}

  /** {@inheritDoc AccountingIntegrationRuleConfigurationRepository.read} */
  public async read<TSource extends AccountingIntegrationSource>(
    scope: AccountingIntegrationRuleConfigurationScope<TSource>,
  ): Promise<AccountingIntegrationRuleConfiguration<TSource>> {
    const result = await this.call("get_native_accounting_rule_configuration", {
      p_actor_id: scope.actorId,
      p_organization_id: scope.organizationId,
      p_company_id: scope.companyId,
      p_source: scope.source,
    });
    return decode(result, scope.source);
  }

  /** {@inheritDoc AccountingIntegrationRuleConfigurationRepository.replace} */
  public async replace<TSource extends AccountingIntegrationSource>(
    input: ReplaceAccountingIntegrationRuleConfigurationInput<TSource>,
  ): Promise<AccountingIntegrationRuleConfiguration<TSource>> {
    const result = await this.call("replace_native_accounting_rule_configuration", {
      p_actor_id: input.actorId,
      p_organization_id: input.organizationId,
      p_company_id: input.companyId,
      p_source: input.source,
      p_expected_version: input.expectedVersion,
      p_rules: input.rules.map((rule) => ({
        id: rule.id,
        amountField: rule.amountField,
        debitAccountId: rule.debitAccountId,
        creditAccountId: rule.creditAccountId,
        description: rule.description,
        isActive: rule.isActive,
      })),
    });
    return decode(result, input.source);
  }

  private async call(name: string, values: Record<string, unknown>): Promise<unknown> {
    let result: { data: unknown; error: { readonly message?: string; readonly code?: string } | null };
    try {
      result = await this.source.rpc(name, values);
    } catch (cause) {
      throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_REPOSITORY_UNAVAILABLE", "Accounting rule configuration source is unavailable.", { cause });
    }
    if (result.error) throw mapRpcFailure(result.error);
    return result.data;
  }
}

function decode<TSource extends AccountingIntegrationSource>(value: unknown, expectedSource: TSource): AccountingIntegrationRuleConfiguration<TSource> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_RULESET_INVALID", "Accounting configuration RPC returned malformed evidence.");
  }
  const row = value as Record<string, unknown>;
  if (row.source !== expectedSource || typeof row.version !== "string" || !Array.isArray(row.rules)) {
    throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_RULESET_INVALID", "Accounting configuration RPC returned malformed evidence.");
  }
  return { source: expectedSource, version: row.version, rules: row.rules.map(decodeRule) };
}

function decodeRule(value: unknown): AccountingIntegrationConfigurationRule {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_RULE_INVALID", "Accounting configuration RPC returned a malformed mapping.");
  }
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" || typeof row.amountField !== "string" ||
    typeof row.debitAccountId !== "string" || typeof row.creditAccountId !== "string" ||
    typeof row.description !== "string" || typeof row.isActive !== "boolean"
  ) {
    throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_RULE_INVALID", "Accounting configuration RPC returned a malformed mapping.");
  }
  return {
    id: row.id,
    amountField: row.amountField as AccountingIntegrationConfigurationRule["amountField"],
    debitAccountId: row.debitAccountId,
    creditAccountId: row.creditAccountId,
    description: row.description,
    isActive: row.isActive,
  };
}

function mapRpcFailure(error: { readonly message?: string; readonly code?: string }): AccountingIntegrationFailure {
  const text = `${error.code ?? ""} ${error.message ?? ""}`;
  if (/ACCESS_DENIED|permission denied/i.test(text)) return new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_ACCESS_DENIED", "Accounting configuration access was denied.", { cause: error });
  if (/STALE|RULESET_CHANGED|VERSION_MISMATCH/i.test(text)) return new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_RULESET_CHANGED", "Accounting configuration changed during the operation.", { cause: error });
  if (/INVALID|UNSUPPORTED_SOURCE/i.test(text)) return new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_RULESET_INVALID", "Accounting configuration scope or mappings were rejected.", { cause: error });
  return new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_REPOSITORY_UNAVAILABLE", "Accounting rule configuration source is unavailable.", { cause: error });
}
