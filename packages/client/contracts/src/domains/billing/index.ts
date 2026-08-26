export interface MoneyDto {
  readonly minorAmount: string;
  readonly currency: "USD" | "VES";
}
export interface BillingAccountDto {
  readonly id: string;
  readonly organizationId: string;
  readonly legalName: string;
  readonly taxId: string | null;
  readonly billingEmail: string | null;
  readonly countryCode: string;
  readonly currency: "USD" | "VES";
}
export interface SubscriptionDto {
  readonly id: string;
  readonly productCode: string;
  readonly planId: string | null;
  readonly planName: string | null;
  readonly status: string;
  readonly billingCycle: string | null;
  readonly currentPeriodStart: string | null;
  readonly currentPeriodEnd: string | null;
}
export interface EntitlementsDto {
  readonly maxCompanies: number | null;
  readonly maxMembers: number | null;
  readonly maxDevices: number | null;
  readonly enabledModules: readonly string[];
}
export interface LimitDto {
  readonly used: number;
  readonly maximum: number | null;
  readonly remaining: number | null;
}
export interface UsageDto {
  readonly companies: LimitDto;
  readonly members: LimitDto;
  readonly devices: LimitDto;
}
export interface InvoiceDto {
  readonly id: string;
  readonly number: string;
  readonly status: string;
  readonly subtotal: MoneyDto;
  readonly tax: MoneyDto;
  readonly total: MoneyDto;
  readonly issuedAt: string | null;
  readonly dueAt: string | null;
  readonly paidAt: string | null;
}
export interface PaymentMethodDto {
  readonly id: string;
  readonly kind: string;
  readonly provider: string;
  readonly displayLabel: string;
  readonly isDefault: boolean;
}
export interface BillingPlanDto {
  readonly id: string;
  readonly name: string;
  readonly maxCompanies: number | null;
  readonly maxEmployeesPerCompany: number | null;
  readonly monthlyPrice: MoneyDto;
  readonly quarterlyPrice: MoneyDto;
  readonly annualPrice: MoneyDto;
  readonly productCode: string | null;
  readonly contactOnly: boolean;
}
export interface ManualPaymentRequestDto {
  readonly id: string;
  readonly planId: string;
  readonly billingCycle: "monthly" | "quarterly" | "annual";
  readonly amount: MoneyDto;
  readonly discount: MoneyDto;
  readonly paymentMethod: "transfer" | "cash" | "credit";
  readonly hasReceipt: boolean;
  readonly status: "pending" | "approved" | "rejected";
  readonly notes: string | null;
  readonly submittedAt: string;
  readonly reviewedAt: string | null;
}
export interface SubmitManualPaymentRequestDto {
  readonly planId: string;
  readonly billingCycle: "monthly" | "quarterly" | "annual";
  readonly paymentMethod: "transfer" | "cash";
  readonly receiptStorageKey?: string | null;
}
export interface CreatePaymentReceiptUploadDto {
  readonly fileName: string;
  readonly contentType: string;
}
export interface PaymentReceiptUploadDto {
  readonly uploadUrl: string;
  readonly storageKey: string;
}
export interface BillingOverviewDto {
  readonly account: BillingAccountDto;
  readonly subscriptions: readonly SubscriptionDto[];
  readonly entitlements: EntitlementsDto;
  readonly usage: UsageDto;
}

/** Application-facing port for organization billing reads. */
export interface BillingPort {
  /** @param organizationId - Billing owner. @returns Billing overview. */
  overview(organizationId: string): Promise<BillingOverviewDto>;
  /** @param organizationId - Billing owner. @returns Available plans. */
  plans(organizationId: string): Promise<readonly BillingPlanDto[]>;
  /** @param organizationId - Billing owner. @returns Manual payment requests. */
  paymentRequests(
    organizationId: string,
  ): Promise<readonly ManualPaymentRequestDto[]>;
}
