import type { MoneyDto } from "../billing";

export interface PaymentDto {
  readonly id: string;
  readonly organizationId: string;
  readonly invoiceId: string;
  readonly provider: string;
  readonly providerReference: string;
  readonly amount: MoneyDto;
  readonly status: string;
  readonly confirmedAt: string | null;
  readonly createdAt: string;
}
export interface BillingCreditApplicationDto {
  readonly id: string;
  readonly organizationId: string;
  readonly invoiceId: string;
  readonly entryId: string;
  readonly amount: MoneyDto;
  readonly appliedAt: string;
}
