import type { CompanyId } from "@kontave/companies/domain";
import {
  createCustomerReceivableFromConfirmedCreditInvoice,
  type ConfirmedCreditInvoice,
  type CustomerReceivable,
} from "../domain/customer-receivable";
import type { CustomerId } from "../domain/identifiers";
import { SalesFailure } from "../domain/sales-failure";

/** Company-scoped query for customer receivables and their immutable payment ledgers. */
export interface ListCustomerReceivablesQuery {
  readonly companyId: CompanyId;
  readonly customerId?: CustomerId;
}

/** Read boundary for customer receivables. Results must include each payment ledger. */
export interface CustomerReceivablesReader {
  /**
   * Lists receivables within the requested company and, when present, customer scope.
   * @param query - Authorized company scope and optional customer restriction.
   * @returns Receivables with their complete immutable payment ledgers.
   * @throws {SalesFailure} When the scope is invalid or the data source is unavailable.
   */
  list(query: ListCustomerReceivablesQuery): Promise<readonly CustomerReceivable[]>;
}

/** Atomic write boundary for a receivable opened by a confirmed credit invoice. */
export interface CustomerReceivableCreator {
  /**
   * Persists the new receivable as one durable operation, rejecting duplicate invoice references.
   * @param receivable - Domain-validated agreement to persist.
   * @returns The persisted receivable.
   * @throws {SalesFailure} When the reference conflicts or persistence is unavailable.
   */
  createAtomically(receivable: CustomerReceivable): Promise<CustomerReceivable>;
}

/** Lists company-scoped customer receivables including their payment history. */
export class ListCustomerReceivables {
  /**
   * Creates the receivable listing use case.
   * @param reader - Company-scoped read port.
   */
  constructor(private readonly reader: CustomerReceivablesReader) {}

  /**
   * Gets receivables for a company or one identified customer.
   * @param query - Authorized company scope and optional customer restriction.
   * @returns Receivables including immutable payments.
   * @throws {SalesFailure} When reading fails.
   */
  async execute(query: ListCustomerReceivablesQuery): Promise<readonly CustomerReceivable[]> {
    try {
      return await this.reader.list(Object.freeze({ ...query }));
    } catch (cause) {
      if (cause instanceof SalesFailure) throw cause;
      throw new SalesFailure("SALES_REPOSITORY_UNAVAILABLE", "Customer receivables are unavailable.", { cause });
    }
  }
}

/** Opens a customer receivable after a caller has confirmed a credit invoice. */
export class CreateCustomerReceivableFromConfirmedCreditInvoice {
  /**
   * Creates the credit-invoice receivable use case.
   * @param creator - Atomic persistence boundary for new agreements.
   */
  constructor(private readonly creator: CustomerReceivableCreator) {}

  /**
   * Validates the confirmed credit invoice and persists its new receivable.
   * @param invoice - Confirmed invoice payment agreement and rate snapshots.
   * @returns The persisted receivable.
   * @throws {SalesFailure} When the invoice agreement is invalid or persistence fails.
   */
  async execute(invoice: ConfirmedCreditInvoice): Promise<CustomerReceivable> {
    const receivable = createCustomerReceivableFromConfirmedCreditInvoice(invoice);
    try {
      return await this.creator.createAtomically(receivable);
    } catch (cause) {
      if (cause instanceof SalesFailure) throw cause;
      throw new SalesFailure("SALES_REPOSITORY_UNAVAILABLE", "Customer receivable creation is unavailable.", { cause });
    }
  }
}
