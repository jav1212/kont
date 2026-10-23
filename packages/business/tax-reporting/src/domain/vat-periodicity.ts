import type { TaxReportingScope } from "./tax-reporting-fact";
import { TaxReportingFailure } from "./tax-reporting-failure";
import type { VatFiscalPeriodicity } from "./vat-fiscal-period";

/** One audited change of a company's VAT periodicity. */
export interface VatPeriodicityChange {
  readonly from: VatFiscalPeriodicity | null;
  readonly to: VatFiscalPeriodicity;
  readonly actorId: string;
  readonly reason: string | null;
  readonly occurredAt: string;
}

/** Current VAT periodicity of a company and the evidence that constrains changing it. */
export interface VatPeriodicitySetting {
  readonly periodicity: VatFiscalPeriodicity | null;
  readonly persistedPeriods: number;
  readonly changes: readonly VatPeriodicityChange[];
}

/** Explicit request to configure or change a company's VAT periodicity. */
export interface ConfigureVatPeriodicityCommand {
  readonly periodicity: VatFiscalPeriodicity;
  readonly expectedPeriodicity: VatFiscalPeriodicity | null;
  readonly reason: string | null;
  readonly actorId: string;
  readonly idempotencyKey: string;
}

/** Persistence boundary for the audited company VAT periodicity. */
export interface VatPeriodicityRepository {
  /**
   * Reads the configured periodicity and its recent audit trail.
   * @param scope - Tenant, organization, and company identity.
   * @param actorId - Authenticated actor used for permission and company checks.
   * @returns Current setting; periodicity is null when it has never been configured.
   * @throws {TaxReportingFailure} When the actor cannot read the company or persistence is unavailable.
   */
  get(scope: TaxReportingScope, actorId: string): Promise<VatPeriodicitySetting>;
  /**
   * Applies one compare-and-swap, idempotent periodicity change.
   * @param scope - Tenant, organization, and company identity.
   * @param command - Target and expected periodicity, reason, actor, and idempotency key.
   * @returns Saved periodicity and whether the command replayed an earlier request.
   * @throws {TaxReportingFailure} For stale expectations, reused keys, periods already persisted, or missing permission.
   */
  set(scope: TaxReportingScope, command: ConfigureVatPeriodicityCommand): Promise<{ readonly periodicity: VatFiscalPeriodicity; readonly replayed: boolean }>;
}

/**
 * Validates a periodicity change before it reaches persistence.
 * @param command - Requested change with the periodicity the operator last saw.
 * @returns The command with trimmed reason, actor, and idempotency key.
 * @throws {TaxReportingFailure} When the value is unchanged, evidence is missing, or a change lacks its reason.
 */
export function validateVatPeriodicityChange(command: ConfigureVatPeriodicityCommand): ConfigureVatPeriodicityCommand {
  const reason = command.reason?.trim() || null;
  const actorId = command.actorId.trim();
  const idempotencyKey = command.idempotencyKey.trim();
  if (!isPeriodicity(command.periodicity) || (command.expectedPeriodicity !== null && !isPeriodicity(command.expectedPeriodicity))
    || !actorId || !idempotencyKey || idempotencyKey.length > 128 || (reason?.length ?? 0) > 500) invalid("VAT periodicity change is invalid.");
  if (command.expectedPeriodicity === command.periodicity) invalid("VAT periodicity is already configured with that value.");
  // Replacing a configured value changes how every future period key is read, so it must be justified.
  if (command.expectedPeriodicity !== null && reason === null) invalid("Changing a configured VAT periodicity requires a reason.");
  return Object.freeze({ ...command, reason, actorId, idempotencyKey });
}

function isPeriodicity(value: string): value is VatFiscalPeriodicity { return value === "monthly" || value === "fortnightly"; }
function invalid(message: string): never { throw new TaxReportingFailure("TAX_REPORTING_INVALID", message); }
