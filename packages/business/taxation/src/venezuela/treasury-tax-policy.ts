import { compareDecimal, exactDecimal, sameCurrency, type ExactDecimal } from "@kontave/monetary/domain";
import { calculateBankDebitTax, bankDebitTaxPolicy, type BankDebitTaxCalculation, type BankDebitTaxExclusion, type BankDebitTaxExclusionAuthorizer, type BankDebitTaxOperation, type BankDebitTaxPolicy } from "../domain/bank-debit-tax";
import { TaxationFailure } from "../domain/taxation-failure";
import { includesDate, taxationDate } from "../domain/temporal";

/** Taxpayer circumstance supplied explicitly for a Venezuelan treasury operation. */
export type VenezuelanIgtfSubject =
  | "article_4_1_special_passive_subject"
  | "article_4_2_special_passive_subject"
  | "article_4_3_linked_to_special_passive_subject"
  | "article_4_4_paying_on_behalf_of_special_passive_subject"
  | "article_4_5_foreign_currency_or_non_sovereign_crypto"
  | "article_4_6_foreign_currency_payment_to_special_passive_subject"
  | "not_classified";

/** Characterizes the payment fact without inferring it from the currency alone. */
export type VenezuelanTreasuryPaymentKind = "bank_account_debit" | "nonbank_debt_extinguishment" | "other";

/** Currency fact relevant to IGTF classification. */
export type VenezuelanPaymentCurrencyKind = "legal_tender" | "foreign_currency" | "sovereign_cryptoasset" | "other_cryptoasset" | "unknown";

/** Channel fact relevant to the statutory subject definitions. */
export type VenezuelanFinancialChannel = "national_without_foreign_correspondent" | "national_with_foreign_correspondent" | "outside_national_system" | "not_applicable" | "unknown";

/** Immutable source reference for a configured Venezuelan treasury-tax policy. */
export interface VenezuelanTreasuryTaxLegalEvidence {
  readonly sourceReference: string;
  readonly publishedOn: string;
  readonly provisions: readonly string[];
}

/** Conditions under which a configured policy may be considered. */
export interface VenezuelanTreasuryTaxApplicability {
  readonly subjects: readonly Exclude<VenezuelanIgtfSubject, "not_classified">[];
  readonly paymentKinds: readonly VenezuelanTreasuryPaymentKind[];
  readonly paymentCurrencyKinds: readonly VenezuelanPaymentCurrencyKind[];
  readonly financialChannels: readonly VenezuelanFinancialChannel[];
}

/** A generic bank-debit policy with explicit Venezuelan legal classification and evidence. */
export interface VenezuelanTreasuryTaxPolicy {
  readonly bankDebitTaxPolicy: BankDebitTaxPolicy;
  readonly applicability: VenezuelanTreasuryTaxApplicability;
  readonly legalEvidence: VenezuelanTreasuryTaxLegalEvidence;
}

/** Debit fact plus the semantic data needed to select a Venezuelan tax policy. */
export interface VenezuelanTreasuryTaxOperation {
  readonly bankDebit: BankDebitTaxOperation;
  readonly subject: VenezuelanIgtfSubject;
  readonly paymentKind: VenezuelanTreasuryPaymentKind;
  readonly paymentCurrencyKind: VenezuelanPaymentCurrencyKind;
  readonly financialChannel: VenezuelanFinancialChannel;
}

/** Input for a Venezuelan IGTF calculation using the generic portable engine. */
export interface CalculateVenezuelanTreasuryTaxInput {
  readonly policies: readonly VenezuelanTreasuryTaxPolicy[];
  readonly operation: VenezuelanTreasuryTaxOperation;
  readonly exclusion: BankDebitTaxExclusion | null;
  readonly exclusionAuthorizer?: BankDebitTaxExclusionAuthorizer;
}

/** Result containing the generic calculation and the legal evidence of the selected policy. */
export interface VenezuelanTreasuryTaxCalculation {
  readonly calculation: BankDebitTaxCalculation;
  readonly legalEvidence: VenezuelanTreasuryTaxLegalEvidence;
  readonly subject: Exclude<VenezuelanIgtfSubject, "not_classified">;
}

/**
 * Validates a source-backed Venezuelan treasury-tax policy without assigning a default rate or subject.
 * @param input - Generic policy, applicability matrix, and primary-source evidence.
 * @returns An immutable normalized policy.
 * @throws {TaxationFailure} When legal evidence or applicability has no explicit supported value.
 */
export function venezuelanTreasuryTaxPolicy(input: VenezuelanTreasuryTaxPolicy): VenezuelanTreasuryTaxPolicy {
  const applicability = normalizeApplicability(input.applicability);
  const legalEvidence = normalizeLegalEvidence(input.legalEvidence);
  return Object.freeze({ bankDebitTaxPolicy: bankDebitTaxPolicy(input.bankDebitTaxPolicy), applicability, legalEvidence });
}

/**
 * Selects a source-backed policy and delegates exact calculation to the portable bank-debit-tax engine.
 * @param input - Configured Venezuelan policies, a fully classified operation, and optional authorized exception.
 * @returns Exact tax calculation and the selected policy's legal evidence.
 * @throws {TaxationFailure} When semantic classification is incomplete, no policy applies, or generic validation fails.
 */
export function calculateVenezuelanTreasuryTax(input: CalculateVenezuelanTreasuryTaxInput): VenezuelanTreasuryTaxCalculation {
  const operation = normalizeOperation(input.operation);
  if (operation.subject === "not_classified" || operation.paymentCurrencyKind === "unknown" || operation.financialChannel === "unknown") {
    throw new TaxationFailure("TAXATION_CLASSIFICATION_MISSING", "Venezuelan IGTF subject classification is required.");
  }
  const matches = input.policies.map(venezuelanTreasuryTaxPolicy).filter((policy) => {
    const rule = policy.bankDebitTaxPolicy;
    const debit = operation.bankDebit;
    return applies(policy.applicability, operation)
      && rule.scope.organizationId === debit.scope.organizationId
      && rule.scope.companyId === debit.scope.companyId
      && sameCurrency(rule.base.currency, debit.debitAmount.currency)
      && includesDate(rule.effectiveFrom, rule.effectiveTo, taxationDate(debit.operationDate));
  });
  if (matches.length === 0) throw new TaxationFailure("TAXATION_RULE_MISSING", "No Venezuelan treasury tax policy applies to this classified operation.");
  if (matches.length > 1) throw new TaxationFailure("TAXATION_RULE_AMBIGUOUS", "More than one Venezuelan treasury tax policy applies to this classified operation.");
  const policy = matches[0];
  if (policy === undefined) throw new TaxationFailure("TAXATION_RULE_MISSING", "No Venezuelan treasury tax policy applies to this classified operation.");
  const calculation = calculateBankDebitTax({ policies: [policy.bankDebitTaxPolicy], operation: operation.bankDebit, exclusion: input.exclusion, ...(input.exclusionAuthorizer === undefined ? {} : { exclusionAuthorizer: input.exclusionAuthorizer }) });
  return Object.freeze({ calculation, legalEvidence: policy.legalEvidence, subject: operation.subject });
}

/**
 * Builds an evidence-only fixture for the 2024 zero-rate decree; callers supply scope, currency, and approval.
 * @param input - Generic policy fields selected by the authorized configuration boundary.
 * @returns A policy candidate limited to article 4 numerals 1 through 4 and the decree's effective date.
 * @throws {TaxationFailure} When supplied policy data is invalid.
 */
export function venezuelanDecree4972PolicyFixture(input: Omit<BankDebitTaxPolicy, "effectiveFrom" | "ratePercent"> & { readonly ratePercent: ExactDecimal }): VenezuelanTreasuryTaxPolicy {
  if (compareDecimal(exactDecimal(input.ratePercent), exactDecimal("0")) !== 0) {
    throw new TaxationFailure("TAXATION_RULE_INVALID", "Decree 4972 evidence only supports a zero rate.");
  }
  return venezuelanTreasuryTaxPolicy({
    bankDebitTaxPolicy: { ...input, effectiveFrom: taxationDate("2024-07-15") },
    applicability: { subjects: ["article_4_1_special_passive_subject", "article_4_2_special_passive_subject", "article_4_3_linked_to_special_passive_subject", "article_4_4_paying_on_behalf_of_special_passive_subject"], paymentKinds: ["bank_account_debit", "nonbank_debt_extinguishment"], paymentCurrencyKinds: ["legal_tender", "foreign_currency", "sovereign_cryptoasset", "other_cryptoasset"], financialChannels: ["national_without_foreign_correspondent", "national_with_foreign_correspondent", "outside_national_system", "not_applicable"] },
    legalEvidence: { sourceReference: "Gaceta Oficial N.º 6.821 Extraordinario, Decreto N.º 4.972", publishedOn: "2024-07-12", provisions: ["Artículo 1", "Artículo 2"] },
  });
}

/**
 * Builds the article 24 three-percent reference for one explicitly classified foreign-currency channel.
 * This is a source fixture; an authorized configuration must delimit any later policy change.
 * @param input - Scope, base currency, approval, validity end and configured three-percent rate.
 * @param subject - Article 4 numeral 5 (banking) or 6 (payment to a special taxpayer outside banking).
 * @returns An explicit historical legal-policy candidate with no automatic activation or exclusions.
 * @throws {TaxationFailure} When the configured rate or policy differs from the supported evidence.
 */
export function venezuelanArticle24ForeignCurrencyPolicyFixture(
  input: Omit<BankDebitTaxPolicy, "effectiveFrom">,
  subject: "article_4_5_foreign_currency_or_non_sovereign_crypto" | "article_4_6_foreign_currency_payment_to_special_passive_subject",
): VenezuelanTreasuryTaxPolicy {
  if (compareDecimal(exactDecimal(input.ratePercent), exactDecimal("3")) !== 0) {
    throw new TaxationFailure("TAXATION_RULE_INVALID", "Article 24 reference requires its configured three-percent rate.");
  }
  const banking = subject === "article_4_5_foreign_currency_or_non_sovereign_crypto";
  return venezuelanTreasuryTaxPolicy({
    bankDebitTaxPolicy: { ...input, effectiveFrom: taxationDate("2022-03-27") },
    applicability: {
      subjects: [subject], paymentKinds: [banking ? "bank_account_debit" : "nonbank_debt_extinguishment"],
      paymentCurrencyKinds: ["foreign_currency", "other_cryptoasset"],
      financialChannels: [banking ? "national_without_foreign_correspondent" : "not_applicable"],
    },
    legalEvidence: { sourceReference: "Gaceta Oficial N.º 6.687 Extraordinario", publishedOn: "2022-02-25", provisions: ["Artículo 4", "Artículo 24", "Artículo 25"] },
  });
}

function normalizeOperation(input: VenezuelanTreasuryTaxOperation): VenezuelanTreasuryTaxOperation {
  if (!subjects.includes(input.subject) || !paymentKinds.includes(input.paymentKind) || !currencyKinds.includes(input.paymentCurrencyKind) || !channels.includes(input.financialChannel)) {
    throw new TaxationFailure("TAXATION_DECISION_INVALID", "Venezuelan treasury tax operation classification is invalid.");
  }
  const foreignCurrency = input.paymentCurrencyKind === "foreign_currency" || input.paymentCurrencyKind === "other_cryptoasset";
  if ((input.subject === "article_4_5_foreign_currency_or_non_sovereign_crypto" && (!foreignCurrency || input.paymentKind !== "bank_account_debit" || input.financialChannel !== "national_without_foreign_correspondent"))
    || (input.subject === "article_4_6_foreign_currency_payment_to_special_passive_subject" && (!foreignCurrency || input.paymentKind !== "nonbank_debt_extinguishment" || input.financialChannel !== "not_applicable"))
    || (input.subject === "article_4_1_special_passive_subject" && input.paymentKind !== "bank_account_debit")
    || (input.subject === "article_4_2_special_passive_subject" && input.paymentKind !== "nonbank_debt_extinguishment")) {
    throw new TaxationFailure("TAXATION_DECISION_INVALID", "IGTF subject classification conflicts with the payment facts.");
  }
  return Object.freeze({ ...input });
}

function normalizeApplicability(input: VenezuelanTreasuryTaxApplicability): VenezuelanTreasuryTaxApplicability {
  if (input.subjects.length === 0 || input.paymentKinds.length === 0 || input.paymentCurrencyKinds.length === 0 || input.financialChannels.length === 0 || input.subjects.some((value) => !subjects.includes(value)) || input.paymentKinds.some((value) => !paymentKinds.includes(value)) || input.paymentCurrencyKinds.some((value) => !currencyKinds.includes(value)) || input.financialChannels.some((value) => !channels.includes(value))) {
    throw new TaxationFailure("TAXATION_RULE_INVALID", "Venezuelan treasury tax applicability is invalid.");
  }
  return Object.freeze({ subjects: Object.freeze([...input.subjects]), paymentKinds: Object.freeze([...input.paymentKinds]), paymentCurrencyKinds: Object.freeze([...input.paymentCurrencyKinds]), financialChannels: Object.freeze([...input.financialChannels]) });
}

function normalizeLegalEvidence(input: VenezuelanTreasuryTaxLegalEvidence): VenezuelanTreasuryTaxLegalEvidence {
  const sourceReference = required(input.sourceReference, "legal source reference");
  const publishedOn = input.publishedOn.trim();
  taxationDate(publishedOn);
  if (input.provisions.length === 0) throw new TaxationFailure("TAXATION_RULE_INVALID", "Venezuelan treasury tax legal evidence is invalid.");
  return Object.freeze({ sourceReference, publishedOn, provisions: Object.freeze(input.provisions.map((value) => required(value, "legal provision"))) });
}

function applies(applicability: VenezuelanTreasuryTaxApplicability, operation: VenezuelanTreasuryTaxOperation): boolean { return applicability.subjects.includes(operation.subject as Exclude<VenezuelanIgtfSubject, "not_classified">) && applicability.paymentKinds.includes(operation.paymentKind) && applicability.paymentCurrencyKinds.includes(operation.paymentCurrencyKind) && applicability.financialChannels.includes(operation.financialChannel); }
function required(value: string, name: string): string { const normalized = value.trim(); if (!normalized || normalized.length > 500) throw new TaxationFailure("TAXATION_RULE_INVALID", `Venezuelan treasury tax ${name} is invalid.`); return normalized; }
const subjects: readonly VenezuelanIgtfSubject[] = ["article_4_1_special_passive_subject", "article_4_2_special_passive_subject", "article_4_3_linked_to_special_passive_subject", "article_4_4_paying_on_behalf_of_special_passive_subject", "article_4_5_foreign_currency_or_non_sovereign_crypto", "article_4_6_foreign_currency_payment_to_special_passive_subject", "not_classified"];
const paymentKinds: readonly VenezuelanTreasuryPaymentKind[] = ["bank_account_debit", "nonbank_debt_extinguishment", "other"];
const currencyKinds: readonly VenezuelanPaymentCurrencyKind[] = ["legal_tender", "foreign_currency", "sovereign_cryptoasset", "other_cryptoasset", "unknown"];
const channels: readonly VenezuelanFinancialChannel[] = ["national_without_foreign_correspondent", "national_with_foreign_correspondent", "outside_national_system", "not_applicable", "unknown"];
