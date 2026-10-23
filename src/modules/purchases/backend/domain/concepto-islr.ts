// The Decreto 1.808 ISLR withholding catalog and calculator live in
// @kontave/taxation so purchases and payables share one implementation.
export {
  ISLR_CONCEPTS,
  TAXPAYER_TYPE_LABELS,
  computeIslrRetention,
  getIslrConcept,
  listIslrConceptsForPurchases,
  type IslrComputeInput,
  type IslrComputeResult,
  type IslrConcept,
  type IslrTaxpayerType,
} from "@kontave/taxation/venezuela";
