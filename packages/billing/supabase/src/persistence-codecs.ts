import { z } from "zod";
import { BillingCycle, Currency, InvoiceStatus, PaymentMethodKind, SubscriptionStatus } from "@kontave/billing-domain";
const nullableRelation = <T extends z.ZodType>(schema: T) => z.union([schema, z.array(schema).max(1)]).nullable().transform((value) => Array.isArray(value) ? value[0] ?? null : value);
export const billingAccountRowSchema = z.object({ id:z.uuid(),organization_id:z.uuid(),legal_name:z.string(),tax_id:z.string().nullable(),billing_email:z.string().nullable(),country_code:z.string(),currency:z.enum(Currency) });
export const subscriptionRowSchema = z.object({ id:z.uuid(),organization_id:z.uuid(),status:z.enum(SubscriptionStatus),billing_cycle:z.enum(BillingCycle).nullable(),current_period_start:z.string().nullable(),current_period_end:z.string().nullable(),products:nullableRelation(z.object({slug:z.string()})),plans:nullableRelation(z.object({id:z.uuid(),name:z.string()})) });
export const entitlementRowSchema = z.object({ status:z.enum(SubscriptionStatus),products:nullableRelation(z.object({slug:z.string()})),plans:nullableRelation(z.object({max_companies:z.number().int().nullable()})) });
export const invoiceRowSchema = z.object({ id:z.uuid(),organization_id:z.uuid(),number:z.string(),status:z.enum(InvoiceStatus),subtotal_minor:z.union([z.string(),z.number(),z.bigint()]),tax_minor:z.union([z.string(),z.number(),z.bigint()]),total_minor:z.union([z.string(),z.number(),z.bigint()]),currency:z.enum(Currency),issued_at:z.string().nullable(),due_at:z.string().nullable(),paid_at:z.string().nullable() });
export const paymentMethodRowSchema = z.object({ id:z.uuid(),organization_id:z.uuid(),kind:z.enum(PaymentMethodKind),provider:z.string(),display_label:z.string(),is_default:z.boolean() });
export const billingCreditApplicationRowSchema = z.object({
  id: z.uuid(),
  entry_id: z.uuid(),
  amount_minor: z.union([z.string(), z.number(), z.bigint()]),
  created_at: z.string(),
});
