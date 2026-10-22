import { compareDecimal, currency, divideDecimal, exactDecimal, moneyFromMinor, moneyToDecimal, multiplyDecimal, quantizeMoney, sameCurrency, type CurrencyDefinition, type ExactDecimal, type Money, type RoundingMode } from "@kontave/monetary/domain";
import type { CompanyId } from "@kontave/companies/domain";
import type { OrganizationId } from "@kontave/organizations/domain";
import { includesDate, taxationDate, type TaxationDate } from "./temporal";
import { TaxationFailure } from "./taxation-failure";

/** Organization and company boundary for a bank-debit-tax policy or operation. */
export interface BankDebitTaxScope {
  readonly organizationId: OrganizationId;
  readonly companyId: CompanyId;
}

/** Defines the source amount used by a bank-debit-tax policy. */
export interface BankDebitTaxBase {
  readonly kind: "full_debit_amount";
  readonly currency: CurrencyDefinition;
}

/** Auditable approval evidence supplied by the policy administration boundary. */
export interface BankDebitTaxApprovalEvidence {
  readonly approvalReference: string;
  readonly approvedBy: string;
  readonly approvedAt: string;
  readonly evidenceReference: string;
}

/** Versioned, company-scoped configuration for one bank-debit tax calculation. */
export interface BankDebitTaxPolicy {
  readonly id: string;
  readonly scope: BankDebitTaxScope;
  readonly version: string;
  readonly effectiveFrom: TaxationDate;
  readonly effectiveTo: TaxationDate | null;
  /** Exact percentage, such as `"0.75"`; this package never supplies a rate. */
  readonly ratePercent: ExactDecimal;
  readonly base: BankDebitTaxBase;
  readonly roundingMode: RoundingMode;
  readonly legalBasis: string;
  readonly approval: BankDebitTaxApprovalEvidence;
}

/** A company-approved exclusion for one immutable bank debit operation. */
export interface BankDebitTaxExclusion {
  readonly operationId: string;
  readonly scope: BankDebitTaxScope;
  readonly policyId: string;
  readonly policyVersion: string;
  readonly reason: string;
  readonly evidenceReference: string;
  readonly approval: BankDebitTaxApprovalEvidence;
}

/** Immutable debit fact evaluated by the calculation. */
export interface BankDebitTaxOperation {
  readonly id: string;
  readonly scope: BankDebitTaxScope;
  readonly operationDate: TaxationDate;
  readonly debitAmount: Money;
}

/** Serializable exact monetary amount kept with a calculation snapshot. */
export interface BankDebitTaxSerializedMoney {
  readonly amount: ExactDecimal;
  readonly currencyCode: string;
  readonly minorUnit: number;
}

/** Reproducible evidence of the policy and decision used for a bank debit. */
export interface BankDebitTaxCalculationSnapshot {
  readonly operationId: string;
  readonly operationDate: TaxationDate;
  readonly scope: BankDebitTaxScope;
  readonly policyId: string;
  readonly policyVersion: string;
  readonly policyEffectiveFrom: TaxationDate;
  readonly policyEffectiveTo: TaxationDate | null;
  readonly ratePercent: ExactDecimal;
  readonly base: BankDebitTaxBase;
  readonly roundingMode: RoundingMode;
  readonly legalBasis: string;
  readonly policyApproval: BankDebitTaxApprovalEvidence;
  readonly taxableBase: BankDebitTaxSerializedMoney;
  readonly taxAmount: BankDebitTaxSerializedMoney;
  readonly exclusion: { readonly reason: string; readonly evidenceReference: string; readonly approval: BankDebitTaxApprovalEvidence } | null;
}

/** Result of a bank debit tax calculation and its persisted calculation evidence. */
export interface BankDebitTaxCalculation {
  readonly taxableBase: Money;
  readonly taxAmount: Money;
  readonly excluded: boolean;
  readonly snapshot: BankDebitTaxCalculationSnapshot;
}

/** Authorization boundary that confirms an exclusion remains valid for this calculation. */
export interface BankDebitTaxExclusionAuthorizer {
  /**
   * Confirms that the supplied exclusion is permitted for the selected policy and debit.
   * @param input - Immutable exclusion, policy, and operation context.
   * @returns Whether the exclusion may suppress the tax calculation.
   */
  authorize(input: { readonly exclusion: BankDebitTaxExclusion; readonly policy: BankDebitTaxPolicy; readonly operation: BankDebitTaxOperation }): boolean;
}

/** Inputs required to deterministically calculate bank-debit tax for one operation. */
export interface CalculateBankDebitTaxInput {
  readonly policies: readonly BankDebitTaxPolicy[];
  readonly operation: BankDebitTaxOperation;
  readonly exclusion: BankDebitTaxExclusion | null;
  /** Required whenever an exclusion is requested; absent authority rejects the exclusion. */
  readonly exclusionAuthorizer?: BankDebitTaxExclusionAuthorizer;
}

/**
 * Validates and freezes a versioned bank-debit-tax policy without assigning any legal rate.
 * @param input - Policy supplied by the authorized configuration boundary.
 * @returns A normalized immutable policy.
 * @throws {TaxationFailure} When policy scope, interval, rate, base, or approval evidence is invalid.
 */
export function bankDebitTaxPolicy(input: BankDebitTaxPolicy): BankDebitTaxPolicy {
  const id = identifier(input.id, "policy id");
  const version = identifier(input.version, "policy version");
  const scope = bankDebitTaxScope(input.scope);
  const effectiveFrom = taxationDate(input.effectiveFrom);
  const effectiveTo = input.effectiveTo === null ? null : taxationDate(input.effectiveTo);
  if (effectiveTo !== null && effectiveTo < effectiveFrom) invalid("Policy effective interval is invalid.");
  const ratePercent = exactDecimal(input.ratePercent);
  if (compareDecimal(ratePercent, exactDecimal("0")) < 0) invalid("Policy tax rate cannot be negative.");
  const base = bankDebitTaxBase(input.base);
  return Object.freeze({ ...input, id, version, scope, effectiveFrom, effectiveTo, ratePercent, base, roundingMode: roundingMode(input.roundingMode), legalBasis: identifier(input.legalBasis, "legal basis"), approval: approvalEvidence(input.approval) });
}

/**
 * Validates and freezes scope supplied by a trusted organization and company boundary.
 * @param input - Organization and company identifiers already branded by their owning domains.
 * @returns An immutable scope.
 * @throws {TaxationFailure} When either scope identifier is blank.
 */
export function bankDebitTaxScope(input: BankDebitTaxScope): BankDebitTaxScope {
  if (!input.organizationId.trim() || !input.companyId.trim()) invalid("Bank debit tax scope is invalid.");
  return Object.freeze({ organizationId: input.organizationId, companyId: input.companyId });
}

/**
 * Validates the source base used by a bank-debit-tax policy.
 * @param input - Debit amount base and the required currency definition.
 * @returns An immutable normalized base.
 * @throws {TaxationFailure} When the base kind or currency is invalid.
 */
export function bankDebitTaxBase(input: BankDebitTaxBase): BankDebitTaxBase {
  if (input.kind !== "full_debit_amount") invalid("Bank debit tax base is invalid.");
  return Object.freeze({ kind: input.kind, currency: validatedCurrency(input.currency) });
}

/**
 * Validates the explicit approved exception for one immutable bank-debit operation.
 * @param input - Exclusion reason, evidence, approval, scope, and policy identity.
 * @returns An immutable exclusion.
 * @throws {TaxationFailure} When required exception evidence is absent or malformed.
 */
export function bankDebitTaxExclusion(input: BankDebitTaxExclusion): BankDebitTaxExclusion {
  return Object.freeze({ ...input, operationId: identifier(input.operationId, "operation id"), scope: bankDebitTaxScope(input.scope), policyId: identifier(input.policyId, "policy id"), policyVersion: identifier(input.policyVersion, "policy version"), reason: identifier(input.reason, "exclusion reason"), evidenceReference: identifier(input.evidenceReference, "exclusion evidence"), approval: approvalEvidence(input.approval) });
}

/**
 * Calculates a bank-debit tax from exactly one effective, company-scoped policy.
 * @param input - Policy candidates, immutable debit operation, and optional authorized exclusion.
 * @returns Exact tax money plus a serializable, reproducible decision snapshot.
 * @throws {TaxationFailure} When policy selection, scope, currency, or exclusion authority is invalid or absent.
 */
export function calculateBankDebitTax(input: CalculateBankDebitTaxInput): BankDebitTaxCalculation {
  const operation = bankDebitTaxOperation(input.operation);
  const policy = resolvePolicy(input.policies, operation);
  const exclusion = resolveExclusion(input.exclusion, input.exclusionAuthorizer, policy, operation);
  const taxableBase = moneyFromMinor(operation.debitAmount.minorAmount, operation.debitAmount.currency);
  const taxAmount = exclusion === null
    ? quantizeMoney(multiplyDecimal(moneyToDecimal(taxableBase), divideDecimal(policy.ratePercent, exactDecimal("100"))), taxableBase.currency, policy.roundingMode)
    : moneyFromMinor(0n, taxableBase.currency);
  return Object.freeze({ taxableBase, taxAmount, excluded: exclusion !== null, snapshot: Object.freeze({ operationId: operation.id, operationDate: operation.operationDate, scope: operation.scope, policyId: policy.id, policyVersion: policy.version, policyEffectiveFrom: policy.effectiveFrom, policyEffectiveTo: policy.effectiveTo, ratePercent: policy.ratePercent, base: policy.base, roundingMode: policy.roundingMode, legalBasis: policy.legalBasis, policyApproval: policy.approval, taxableBase: serializedMoney(taxableBase), taxAmount: serializedMoney(taxAmount), exclusion: exclusion === null ? null : Object.freeze({ reason: exclusion.reason, evidenceReference: exclusion.evidenceReference, approval: exclusion.approval }) }) });
}

function bankDebitTaxOperation(input: BankDebitTaxOperation): BankDebitTaxOperation {
  const id = identifier(input.id, "operation id");
  const scope = bankDebitTaxScope(input.scope);
  const operationDate = taxationDate(input.operationDate);
  const debitAmount = moneyFromMinor(input.debitAmount.minorAmount, validatedCurrency(input.debitAmount.currency));
  if (debitAmount.minorAmount <= 0n) invalid("Bank debit amount must be positive.");
  return Object.freeze({ id, scope, operationDate, debitAmount });
}

function resolvePolicy(candidates: readonly BankDebitTaxPolicy[], operation: BankDebitTaxOperation): BankDebitTaxPolicy {
  const matches = candidates.map(bankDebitTaxPolicy).filter((policy) => sameScope(policy.scope, operation.scope) && includesDate(policy.effectiveFrom, policy.effectiveTo, operation.operationDate) && sameCurrency(policy.base.currency, operation.debitAmount.currency));
  if (matches.length === 0) throw new TaxationFailure("TAXATION_RULE_MISSING", "No effective bank debit tax policy was found.");
  if (matches.length > 1) throw new TaxationFailure("TAXATION_RULE_AMBIGUOUS", "More than one bank debit tax policy applies to this operation.");
  const policy = matches[0];
  if (policy === undefined) throw new TaxationFailure("TAXATION_RULE_MISSING", "No effective bank debit tax policy was found.");
  return policy;
}

function resolveExclusion(exclusion: BankDebitTaxExclusion | null, authorizer: BankDebitTaxExclusionAuthorizer | undefined, policy: BankDebitTaxPolicy, operation: BankDebitTaxOperation): BankDebitTaxExclusion | null {
  if (exclusion === null) return null;
  const normalized = bankDebitTaxExclusion(exclusion);
  if (normalized.operationId !== operation.id || !sameScope(normalized.scope, operation.scope) || normalized.policyId !== policy.id || normalized.policyVersion !== policy.version) invalid("Bank debit tax exclusion does not match the operation policy.");
  if (authorizer === undefined || !authorizer.authorize({ exclusion: normalized, policy, operation })) throw new TaxationFailure("TAXATION_ACCESS_DENIED", "Bank debit tax exclusion is not authorized.");
  return normalized;
}

function approvalEvidence(input: BankDebitTaxApprovalEvidence): BankDebitTaxApprovalEvidence {
  return Object.freeze({ approvalReference: identifier(input.approvalReference, "approval reference"), approvedBy: identifier(input.approvedBy, "approver"), approvedAt: isoInstant(input.approvedAt), evidenceReference: identifier(input.evidenceReference, "approval evidence") });
}

function serializedMoney(value: Money): BankDebitTaxSerializedMoney { return Object.freeze({ amount: moneyToDecimal(value), currencyCode: value.currency.code, minorUnit: value.currency.minorUnit }); }
function validatedCurrency(value: CurrencyDefinition): CurrencyDefinition { return currency(value.code, value.minorUnit); }
function sameScope(left: BankDebitTaxScope, right: BankDebitTaxScope): boolean { return left.organizationId === right.organizationId && left.companyId === right.companyId; }
function roundingMode(value: RoundingMode): RoundingMode { if (["up", "down", "ceiling", "floor", "half_up", "half_down", "half_even", "half_ceiling", "half_floor"].includes(value)) return value; invalid("Bank debit tax rounding mode is invalid."); }
function isoInstant(value: string): string { const normalized = value.trim(); if (!normalized || Number.isNaN(Date.parse(normalized))) invalid("Approval timestamp is invalid."); return normalized; }
function identifier(value: string, name: string): string { const normalized = value.trim(); if (!normalized || normalized.length > 500) invalid(`Bank debit tax ${name} is invalid.`); return normalized; }
function invalid(message: string): never { throw new TaxationFailure("TAXATION_RULE_INVALID", message); }
