import { SalesFailure } from "../domain";

/** Authenticated actor and organization/company boundary for persistent commercial commands. */
export interface SecuredSalesScope {
  readonly actorUserId: string;
  readonly organizationId: string;
  readonly companyId: string;
}

/** Observational source metadata; it must never be used as authorization evidence. */
export interface SalesOperationOrigin {
  /** Legacy observational branch text; it is not proof of registered branch access. */
  readonly branchId?: string | null;
  readonly deviceId?: string | null;
}

/** Registered branch ownership assigned atomically when a new invoice is confirmed. */
export interface SalesBranchAttribution {
  readonly companyBranchId?: string | null;
}

/** Registered sales terminal attribution retained by the Web confirmation path. */
export interface SalesRegisterAttribution {
  /** Existing register identity supplied only by the trusted barcode terminal context. */
  readonly salesRegisterId?: string | null;
}

/** Confirmation choices; credit exposure is loaded in the database, never accepted here. */
export interface SecureSalesConfirmation
  extends SecuredSalesScope, SalesOperationOrigin, SalesBranchAttribution, SalesRegisterAttribution {
  readonly invoiceId: string;
  readonly allowNegativeStock: boolean;
  readonly priceListId?: string | null;
}

/** A committed confirmation, whose detailed persistence result remains adapter-owned. */
export interface SecureSalesConfirmationResult {
  readonly invoiceId: string;
  readonly companyId: string;
  readonly status: "confirmed";
}

/** Immutable reversal request; the original payment is never edited or deleted. */
export interface ReverseCustomerPaymentRequest
  extends SecuredSalesScope, SalesOperationOrigin {
  readonly receivableId: string;
  readonly paymentId: string;
  readonly idempotencyKey: string;
  readonly reason: string;
}

/** Durable evidence of a payment reversal. */
export interface CustomerPaymentReversalResult {
  readonly id: string;
  readonly paymentId: string;
  readonly receivableId: string;
  readonly companyId: string;
  readonly reason: string;
  readonly actorId: string;
  readonly occurredAt: string;
  readonly replayed: boolean;
}

/** Historical VES-denominated credit ceiling; absence preserves unconfigured legacy behavior. */
export interface CustomerCreditLimit {
  readonly companyId: string;
  readonly customerId: string;
  readonly limitVes: string;
  readonly version: number;
}

/** Transactional commercial boundary: authorization and mutations must commit under the same locks. */
export interface SecuredSalesRepository {
  /**
   * Checks active company access, confirmation, negative stock, price-list and overdraft grants under locks.
   * @param input - Authenticated scope and confirmation request.
   * @returns The committed confirmation.
   * @throws {SalesFailure} For denied permissions, invalid state, or persistence failure.
   */
  confirm(
    input: SecureSalesConfirmation,
  ): Promise<SecureSalesConfirmationResult>;
  /**
   * Appends reversal evidence exactly once and restores the corresponding debt balance atomically.
   * @param input - Authenticated scope, payment, stable intent key and reason.
   * @returns Durable reversal evidence and replay indication.
   * @throws {SalesFailure} For denied permissions, conflicting keys, or persistence failure.
   */
  reversePayment(
    input: ReverseCustomerPaymentRequest,
  ): Promise<CustomerPaymentReversalResult>;
  /**
   * Reads a configured customer credit ceiling after checking the caller's company access.
   * @param input - Authenticated scope and customer identity.
   * @returns The configured limit or null when no limit has been configured.
   * @throws {SalesFailure} For denied access or unavailable persistence.
   */
  getCreditLimit(
    input: SecuredSalesScope & { readonly customerId: string },
  ): Promise<CustomerCreditLimit | null>;
  /**
   * Replaces the ceiling with compare-and-swap semantics, serialized with invoice confirmation.
   * @param input - Scope, customer, exact VES limit and expected version (zero for creation).
   * @returns The saved limit with its new version.
   * @throws {SalesFailure} For access, validation, concurrency or persistence failures.
   */
  setCreditLimit(
    input: SecuredSalesScope & {
      readonly customerId: string;
      readonly limitVes: string;
      readonly expectedVersion: number;
    },
  ): Promise<CustomerCreditLimit>;
}

/** Executes the persistent commercial security workflows consumed by native or server composition. */
export class SecuredSales {
  /**
   * Connects validation to a persistence adapter that rechecks authorization inside each transaction.
   * @param repository - Authorized, transactionally serialized commercial repository.
   * @returns A commercial security application service.
   */
  constructor(private readonly repository: SecuredSalesRepository) {}

  /**
   * Confirms a draft using authoritative persisted credit and permission data.
   * @param input - Caller identity and requested exceptional operations.
   * @returns The committed confirmation.
   * @throws {SalesFailure} For invalid input, denial, or an unsuccessful transaction.
   */
  confirm(
    input: SecureSalesConfirmation,
  ): Promise<SecureSalesConfirmationResult> {
    validateScope(input);
    identifier(input.invoiceId);
    validateOrigin(input);
    validateBranchAttribution(input);
    validateRegisterAttribution(input);
    if (typeof input.allowNegativeStock !== "boolean") throw invalid();
    if (input.priceListId != null) identifier(input.priceListId);
    return this.repository.confirm(input);
  }

  /**
   * Reverses a payment while retaining the original receipt and its recorded currency conversion.
   * @param input - Scoped payment identity, reason and stable idempotency key.
   * @returns The newly committed or replayed reversal.
   * @throws {SalesFailure} For invalid input, denial, or conflicting intent.
   */
  reversePayment(
    input: ReverseCustomerPaymentRequest,
  ): Promise<CustomerPaymentReversalResult> {
    validateScope(input);
    identifier(input.receivableId);
    identifier(input.paymentId);
    validateOrigin(input);
    if (
      input.idempotencyKey.trim().length < 8 ||
      input.idempotencyKey.length > 128 ||
      !input.reason.trim() ||
      input.reason.trim().length > 500
    )
      throw invalid();
    return this.repository.reversePayment({
      ...input,
      reason: input.reason.trim(),
    });
  }

  /**
   * Reads the company's configured credit ceiling for a customer.
   * @param input - Caller scope and customer identity.
   * @returns Current persisted ceiling or null when unconfigured.
   * @throws {SalesFailure} For invalid scope, denied access or persistence failure.
   */
  getCreditLimit(
    input: SecuredSalesScope & { readonly customerId: string },
  ): Promise<CustomerCreditLimit | null> {
    validateScope(input);
    identifier(input.customerId);
    return this.repository.getCreditLimit(input);
  }

  /**
   * Configures an exact VES credit ceiling; zero permits no additional credit.
   * @param input - Scope, customer, decimal limit and expected configuration version.
   * @returns The saved configuration.
   * @throws {SalesFailure} For invalid decimals, version conflicts or denied access.
   */
  setCreditLimit(
    input: SecuredSalesScope & {
      readonly customerId: string;
      readonly limitVes: string;
      readonly expectedVersion: number;
    },
  ): Promise<CustomerCreditLimit> {
    validateScope(input);
    identifier(input.customerId);
    if (
      !/^(0|[1-9]\d{0,19})(\.\d{1,8})?$/.test(input.limitVes) ||
      !Number.isSafeInteger(input.expectedVersion) ||
      input.expectedVersion < 0
    )
      throw invalid();
    return this.repository.setCreditLimit(input);
  }
}

function validateScope(input: SecuredSalesScope): void {
  identifier(input.actorUserId);
  identifier(input.organizationId);
  identifier(input.companyId);
}
function identifier(value: string): void {
  if (typeof value !== "string" || !value.trim() || value.length > 128)
    throw invalid();
}
function validateOrigin(input: SalesOperationOrigin): void {
  if (input.branchId != null) identifier(input.branchId);
  if (input.deviceId != null) identifier(input.deviceId);
}

function validateBranchAttribution(input: SalesBranchAttribution): void {
  if (input.companyBranchId != null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.companyBranchId)) throw invalid();
}
function validateRegisterAttribution(input: SalesRegisterAttribution): void {
  if (input.salesRegisterId != null) identifier(input.salesRegisterId);
}
function invalid(): SalesFailure {
  return new SalesFailure(
    "SALES_CREDIT_INVALID",
    "Commercial security command is invalid.",
  );
}
