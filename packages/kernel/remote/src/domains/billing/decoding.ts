import type {
  BillingOverviewDto,
  BillingAccountDto,
  SubscriptionDto,
  EntitlementsDto,
  UsageDto,
  LimitDto,
  BillingPlanDto,
  MoneyDto,
  ManualPaymentRequestDto,
} from "@kontave/client-contracts";
import type { Decoder } from "../../decoding";
import {
  textField,
  numberField,
  booleanField,
  shape,
  list,
  nullOr,
  literal,
  responseDto,
  type ResponseField,
} from "../../response-shape";

const billingAccountDtoShape: ResponseField<BillingAccountDto> =
  shape<BillingAccountDto>({
    id: textField,
    organizationId: textField,
    legalName: textField,
    taxId: nullOr(textField),
    billingEmail: nullOr(textField),
    countryCode: textField,
    currency: literal("USD", "VES"),
  });

const subscriptionDtoShape: ResponseField<SubscriptionDto> =
  shape<SubscriptionDto>({
    id: textField,
    productCode: textField,
    planId: nullOr(textField),
    planName: nullOr(textField),
    status: textField,
    billingCycle: nullOr(textField),
    currentPeriodStart: nullOr(textField),
    currentPeriodEnd: nullOr(textField),
  });

const entitlementsDtoShape: ResponseField<EntitlementsDto> =
  shape<EntitlementsDto>({
    maxCompanies: nullOr(numberField),
    maxMembers: nullOr(numberField),
    maxDevices: nullOr(numberField),
    enabledModules: list(textField),
  });

const limitDtoShape: ResponseField<LimitDto> = shape<LimitDto>({
  used: numberField,
  maximum: nullOr(numberField),
  remaining: nullOr(numberField),
});

const usageDtoShape: ResponseField<UsageDto> = shape<UsageDto>({
  companies: limitDtoShape,
  members: limitDtoShape,
  devices: limitDtoShape,
});

const billingOverviewDtoShape: ResponseField<BillingOverviewDto> =
  shape<BillingOverviewDto>({
    account: billingAccountDtoShape,
    subscriptions: list(subscriptionDtoShape),
    entitlements: entitlementsDtoShape,
    usage: usageDtoShape,
  });

const moneyDtoShape: ResponseField<MoneyDto> = shape<MoneyDto>({
  minorAmount: textField,
  currency: literal("USD", "VES"),
});

const billingPlanDtoShape: ResponseField<BillingPlanDto> =
  shape<BillingPlanDto>({
    id: textField,
    name: textField,
    maxCompanies: nullOr(numberField),
    maxEmployeesPerCompany: nullOr(numberField),
    monthlyPrice: moneyDtoShape,
    quarterlyPrice: moneyDtoShape,
    annualPrice: moneyDtoShape,
    productCode: nullOr(textField),
    contactOnly: booleanField,
    includedModules: list(textField),
    commercialCode: nullOr(textField),
  });

const manualPaymentRequestDtoShape: ResponseField<ManualPaymentRequestDto> =
  shape<ManualPaymentRequestDto>({
    id: textField,
    planId: textField,
    billingCycle: literal("monthly", "quarterly", "annual"),
    amount: moneyDtoShape,
    discount: moneyDtoShape,
    paymentMethod: literal("transfer", "cash", "credit"),
    hasReceipt: booleanField,
    status: literal("pending", "approved", "rejected"),
    notes: nullOr(textField),
    submittedAt: textField,
    reviewedAt: nullOr(textField),
  });

/**
 * Validates the complete BillingOverviewDto response shape.
 * @param value - Untrusted response data.
 * @returns The validated DTO or null for malformed data, preserving exact strings and additive fields.
 */
export const billingOverview: Decoder<BillingOverviewDto> = responseDto(
  billingOverviewDtoShape,
);

/**
 * Validates the complete BillingPlanDto response shape.
 * @param value - Untrusted response data.
 * @returns The validated DTO or null for malformed data, preserving exact strings and additive fields.
 */
export const billingPlan: Decoder<BillingPlanDto> = (value) => {
  // Older servers do not advertise bundle contents; absence grants no capability.
  const compatible = value !== null && typeof value === "object" && !Array.isArray(value)
    ? { includedModules: [], commercialCode: null, ...value } : value;
  return responseDto(billingPlanDtoShape)(compatible);
};

/**
 * Validates the complete ManualPaymentRequestDto response shape.
 * @param value - Untrusted response data.
 * @returns The validated DTO or null for malformed data, preserving exact strings and additive fields.
 */
export const paymentRequest: Decoder<ManualPaymentRequestDto> = responseDto(
  manualPaymentRequestDtoShape,
);
