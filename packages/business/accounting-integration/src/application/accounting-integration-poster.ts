import {
  AccountingIntegrationFailure,
  validateAccountingIntegrationPlan,
  validateAccountingIntegrationReversalPlan,
  type AccountingIntegrationPlan,
  type AccountingIntegrationReversalPlan,
} from "../domain";

/** Durable acknowledgement from an atomic accounting integration operation. */
export interface AccountingIntegrationPostingReceipt {
  readonly operationKey: string;
  readonly journalEntryId: string;
  readonly replayed: boolean;
}

/** Trusted scope supplied by the server-side composition root after authenticating the actor. */
export interface AccountingIntegrationPostingContext {
  readonly actorId: string;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly companyId: string;
}

/**
 * Atomic persistence port for posting and reversing accounting integration plans.
 * Implementations must authorize the trusted context actor in its tenant, organization, and company;
 * validate an open accounting period; and commit the journal plus integration-log receipt together.
 * The operation key identifies exactly one source confirmation and is stable across rule-set changes.
 * Therefore the adapter must enforce source-event uniqueness on `(tenantId, organizationId, companyId,
 * source, sourceId, sourceVersion)` independently from the operation key. An exact immutable
 * fingerprint replay returns the original receipt; any changed rules or plan for that source event
 * fails with `ACCOUNTING_INTEGRATION_IDEMPOTENCY_CONFLICT`. A reversal must append a distinct
 * opposite journal and reference the original operation; it must never delete or mutate a posted
 * original journal.
 */
export interface AccountingIntegrationPoster {
  /**
   * Atomically posts a balanced plan or returns the original receipt for an exact replay.
   * @param context - Trusted authenticated actor and scope from the server composition root.
   * @param plan - Validated immutable journal plan whose scope must exactly match `context`.
   * @returns Durable journal identity and replay indicator.
   * @throws {AccountingIntegrationFailure} When access, the period, idempotency, or persistence fails.
   */
  post(context: AccountingIntegrationPostingContext, plan: AccountingIntegrationPlan): Promise<AccountingIntegrationPostingReceipt>;
  /**
   * Atomically appends a reversal journal for an already posted original operation.
   * @param context - Trusted authenticated actor and scope from the server composition root.
   * @param plan - Validated reversal intent whose scope must exactly match `context`.
   * @returns Durable reversal journal identity and replay indicator.
   * @throws {AccountingIntegrationFailure} When the original operation, access, period, idempotency, or persistence fails.
   */
  reverse(context: AccountingIntegrationPostingContext, plan: AccountingIntegrationReversalPlan): Promise<AccountingIntegrationPostingReceipt>;
}

/** Application boundary that persists a previously planned source integration. */
export class PostAccountingIntegration {
  /**
   * @param poster - Atomic, idempotent accounting posting port.
   * @returns A posting use case bound to its persistence port.
   */
  public constructor(private readonly poster: Pick<AccountingIntegrationPoster, "post">) {}

  /**
   * @param context - Trusted authenticated actor and scope from the server composition root.
   * @param plan - Balanced, immutable integration plan.
   * @returns A validated durable posting receipt.
   * @throws {AccountingIntegrationFailure} When the port rejects the operation or returns malformed evidence.
   */
  public async execute(context: AccountingIntegrationPostingContext, plan: AccountingIntegrationPlan): Promise<AccountingIntegrationPostingReceipt> {
    const validated = validateAccountingIntegrationPlan(plan);
    validateContext(context, validated);
    return assertReceipt(validated.operationKey, await callPoster(() => this.poster.post(context, validated)));
  }
}

/** Application boundary that persists a separate reversal for an earlier integration. */
export class ReverseAccountingIntegration {
  /**
   * @param poster - Atomic, idempotent accounting reversal port.
   * @returns A reversal use case bound to its persistence port.
   */
  public constructor(private readonly poster: Pick<AccountingIntegrationPoster, "reverse">) {}

  /**
   * @param context - Trusted authenticated actor and scope from the server composition root.
   * @param plan - Reversal plan referencing an earlier immutable operation.
   * @returns A validated durable reversal receipt.
   * @throws {AccountingIntegrationFailure} When the port rejects the operation or returns malformed evidence.
   */
  public async execute(context: AccountingIntegrationPostingContext, plan: AccountingIntegrationReversalPlan): Promise<AccountingIntegrationPostingReceipt> {
    const validated = validateAccountingIntegrationReversalPlan(plan);
    validateContext(context, validated);
    return assertReceipt(validated.operationKey, await callPoster(() => this.poster.reverse(context, validated)));
  }
}

function validateContext(
  context: AccountingIntegrationPostingContext,
  plan: Pick<AccountingIntegrationPlan, "tenantId" | "organizationId" | "companyId">,
): void {
  if (
    typeof context.actorId !== "string" || !context.actorId.trim() ||
    context.tenantId !== plan.tenantId ||
    context.organizationId !== plan.organizationId ||
    context.companyId !== plan.companyId
  ) {
    throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_ACCESS_DENIED", "Trusted posting scope does not match the accounting integration plan.");
  }
}

async function callPoster<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof AccountingIntegrationFailure) throw error;
    throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_REPOSITORY_UNAVAILABLE", "Accounting integration persistence is unavailable.", { cause: error });
  }
}

function assertReceipt(operationKey: string, receipt: AccountingIntegrationPostingReceipt): AccountingIntegrationPostingReceipt {
  if (
    !receipt ||
    receipt.operationKey !== operationKey ||
    typeof receipt.journalEntryId !== "string" ||
    !receipt.journalEntryId.trim() ||
    typeof receipt.replayed !== "boolean"
  ) {
    throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_REPOSITORY_UNAVAILABLE", "Accounting integration persistence returned invalid evidence.");
  }
  return Object.freeze({ ...receipt, journalEntryId: receipt.journalEntryId.trim() });
}
