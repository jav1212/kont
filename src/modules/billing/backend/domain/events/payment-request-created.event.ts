// PaymentRequestCreatedPayload — emitted after a payment request (comprobante) is successfully persisted.
import { BillingCycle, PaymentMethod } from "../tenant";

export interface PaymentRequestCreatedPayload {
    tenantId:      string;
    planId:        string;
    billingCycle:  BillingCycle;
    amountUsd:     number;
    paymentMethod: PaymentMethod;
}
