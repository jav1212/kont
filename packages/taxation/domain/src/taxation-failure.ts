export type TaxationFailureCode =
  | "TAXATION_IDENTIFIER_INVALID"
  | "TAXATION_DATE_INVALID"
  | "TAXATION_PROFILE_INVALID"
  | "TAXATION_ASSIGNMENT_OVERLAP"
  | "TAXATION_CLASSIFICATION_MISSING"
  | "TAXATION_RULE_INVALID"
  | "TAXATION_RULE_MISSING"
  | "TAXATION_RULE_AMBIGUOUS"
  | "TAXATION_DECISION_INVALID"
  | "TAXATION_CURRENCY_MISMATCH";

export class TaxationFailure extends Error {
  constructor(readonly code: TaxationFailureCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TaxationFailure";
  }
}
