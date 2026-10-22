import type { CompanyFailureCode } from "./index";

/** Expected domain failures raised by company operations. */
export class CompanyFailure extends Error {
  /**
   * @param code - Stable machine-readable failure code.
   * @param message - Safe explanation for the caller.
   * @param options - Optional causal error for diagnostics.
   */
  constructor(
    readonly code: CompanyFailureCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CompanyFailure";
  }
}
