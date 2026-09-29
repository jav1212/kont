import {
  paymentOrderAmount,
  paymentOrderDate,
  PaymentOrderFailure,
  type DecimalAmount,
  type PaymentOrder,
} from "../domain";

/** Optional branch and device information captured alongside the operational audit fact. */
export interface PaymentOrderAuditContext {
  readonly branchId?: string | null;
  readonly deviceId?: string | null;
}
/** Identity and organization scope required for every payment-order operation. */
export interface PaymentOrderScope extends PaymentOrderAuditContext {
  readonly actorId: string;
  readonly organizationId: string;
  readonly companyId: string;
}
/** Input for recording a new payment-order draft. */
export interface CreatePaymentOrder extends PaymentOrderScope {
  readonly id: string;
  readonly beneficiary: string;
  readonly concept: string;
  readonly amount: DecimalAmount;
  readonly currency: string;
  readonly dueDate: string | null;
}
/** Identity and optimistic-lock version for a state-changing operation. */
export interface VersionedPaymentOrder extends PaymentOrderScope {
  readonly id: string;
  readonly expectedVersion: number;
}
/** Input for a partial draft update. Presence of dueDate permits an explicit null clear. */
export interface UpdatePaymentOrder extends VersionedPaymentOrder {
  readonly beneficiary?: string;
  readonly concept?: string;
  readonly amount?: DecimalAmount;
  readonly currency?: string;
  readonly dueDate?: string | null;
}
/** Read scope for an individual payment order. */
export interface GetPaymentOrder extends PaymentOrderScope {
  readonly id: string;
}
/** Persistence boundary owned by the payment-order application. */
export interface PaymentOrderRepository {
  /**
   * Persists an authorized new draft.
   * @param input - Authorized new-draft values.
   * @returns The authoritative persisted order.
   * @throws {PaymentOrderFailure} When authorization, validation, or persistence fails.
   */ create(
    input: CreatePaymentOrder,
  ): Promise<PaymentOrder>;
  /**
   * Applies an authorized versioned draft patch.
   * @param input - Authorized versioned draft patch.
   * @returns The authoritative persisted order.
   * @throws {PaymentOrderFailure} When authorization, validation, or persistence fails.
   */ update(
    input: UpdatePaymentOrder,
  ): Promise<PaymentOrder>;
  /**
   * Cancels an authorized draft at its expected version.
   * @param input - Authorized versioned cancellation.
   * @returns The cancelled order.
   * @throws {PaymentOrderFailure} When authorization, state, or persistence rejects the transition.
   */ cancel(
    input: VersionedPaymentOrder,
  ): Promise<PaymentOrder>;
  /**
   * Deletes an authorized draft at its expected version.
   * @param input - Authorized versioned draft deletion.
   * @returns Nothing when deletion succeeds.
   * @throws {PaymentOrderFailure} When authorization, state, or persistence rejects deletion.
   */ delete(
    input: VersionedPaymentOrder,
  ): Promise<void>;
  /**
   * Reads one authorized payment order.
   * @param input - Authorized order identity.
   * @returns The scoped order.
   * @throws {PaymentOrderFailure} When authorization, absence, or persistence fails.
   */ get(
    input: GetPaymentOrder,
  ): Promise<PaymentOrder>;
}
/** Records an administrative payment-order draft. */
export class CreatePaymentOrderCommand {
  /**
   * Creates the draft-recording use case.
   * @param repository - Durable payment-order port.
   * @returns A command that validates drafts before persistence.
   */ public constructor(
    private readonly repository: PaymentOrderRepository,
  ) {}
  /** @param input - Draft values and authorized scope. @returns The new draft. @throws {PaymentOrderFailure} When input is invalid. */ public async execute(
    input: CreatePaymentOrder,
  ): Promise<PaymentOrder> {
    validateCreate(input);
    return this.repository.create(input);
  }
}
/** Applies a versioned patch to a draft payment order. */
export class UpdatePaymentOrderCommand {
  /**
   * Creates the versioned draft-update use case.
   * @param repository - Durable payment-order port.
   * @returns A command that validates patches before persistence.
   */ public constructor(
    private readonly repository: PaymentOrderRepository,
  ) {}
  /** @param input - Draft patch and expected version. @returns The updated draft. @throws {PaymentOrderFailure} When input is invalid. */ public async execute(
    input: UpdatePaymentOrder,
  ): Promise<PaymentOrder> {
    validateVersioned(input);
    validatePatch(input);
    return this.repository.update(input);
  }
}
/** Cancels a draft payment order through an optimistic-lock transition. */
export class CancelPaymentOrderCommand {
  /**
   * Creates the draft-cancellation use case.
   * @param repository - Durable payment-order port.
   * @returns A command that validates cancellation scope and version.
   */ public constructor(
    private readonly repository: PaymentOrderRepository,
  ) {}
  /** @param input - Scope and expected version. @returns The cancelled order. @throws {PaymentOrderFailure} When input is invalid. */ public execute(
    input: VersionedPaymentOrder,
  ): Promise<PaymentOrder> {
    validateVersioned(input);
    return this.repository.cancel(input);
  }
}
/** Deletes a draft payment order through an optimistic-lock transition. */
export class DeletePaymentOrderCommand {
  /**
   * Creates the draft-deletion use case.
   * @param repository - Durable payment-order port.
   * @returns A command that validates deletion scope and version.
   */ public constructor(
    private readonly repository: PaymentOrderRepository,
  ) {}
  /** @param input - Scope and expected version. @returns Nothing when deletion succeeds. @throws {PaymentOrderFailure} When input is invalid. */ public execute(
    input: VersionedPaymentOrder,
  ): Promise<void> {
    validateVersioned(input);
    return this.repository.delete(input);
  }
}
/** Reads one payment order in an authorized organization and company scope. */
export class GetPaymentOrderQuery {
  /**
   * Creates the scoped payment-order query.
   * @param repository - Durable payment-order port.
   * @returns A query that validates scope before reading.
   */ public constructor(
    private readonly repository: PaymentOrderRepository,
  ) {}
  /** @param input - Scope and order identifier. @returns The current order. @throws {PaymentOrderFailure} When input is invalid. */ public execute(
    input: GetPaymentOrder,
  ): Promise<PaymentOrder> {
    validateScope(input);
    validateText(input.id, "Payment-order identifier");
    return this.repository.get(input);
  }
}
function validateCreate(input: CreatePaymentOrder): void {
  validateScope(input);
  validateText(input.id, "Payment-order identifier");
  validateText(input.beneficiary, "Beneficiary", 240);
  validateText(input.concept, "Concept", 1000);
  paymentOrderAmount(input.amount);
  validateCurrency(input.currency);
  paymentOrderDate(input.dueDate);
}
function validateVersioned(input: VersionedPaymentOrder): void {
  validateScope(input);
  validateText(input.id, "Payment-order identifier");
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1)
    throw new PaymentOrderFailure("INVALID", "Expected version is invalid.");
}
function validatePatch(input: UpdatePaymentOrder): void {
  if (input.beneficiary !== undefined)
    validateText(input.beneficiary, "Beneficiary", 240);
  if (input.concept !== undefined) validateText(input.concept, "Concept", 1000);
  if (input.amount !== undefined) paymentOrderAmount(input.amount);
  if (input.currency !== undefined) validateCurrency(input.currency);
  if (Object.hasOwn(input, "dueDate")) paymentOrderDate(input.dueDate);
}
function validateScope(input: PaymentOrderScope): void {
  validateText(input.actorId, "Actor identifier");
  validateText(input.organizationId, "Organization identifier");
  validateText(input.companyId, "Company identifier");
  validateAuditValue(input.branchId, "Branch identifier");
  validateAuditValue(input.deviceId, "Device identifier");
}
function validateText(
  value: unknown,
  label: string,
  maximum = 128,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > maximum
  )
    throw new PaymentOrderFailure("INVALID", `${label} is invalid.`);
}
function validateAuditValue(value: unknown, label: string): void {
  if (value !== undefined && value !== null) validateText(value, label, 128);
}
function validateCurrency(value: unknown): void {
  if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value))
    throw new PaymentOrderFailure(
      "INVALID",
      "Currency must be a three-letter uppercase code.",
    );
}
