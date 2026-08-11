import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { money } from "@kontave/billing-domain";
import { organizationId, type OrganizationId } from "@kontave/organizations-domain";
import type { PaymentEventOutbox, PaymentsRepository } from "@kontave/payments-application";
import { PaymentFailure, type Payment, type PaymentConfirmed } from "@kontave/payments-domain";
import { confirmedPaymentResultSchema, paymentRowSchema } from "./persistence-codecs";

export interface PaymentsSupabaseConfiguration { readonly url: string; readonly serviceRoleKey: string }
export function createPaymentsInfrastructure(configuration: PaymentsSupabaseConfiguration) {
  const client = createClient(configuration.url, configuration.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return { repository: new SupabasePaymentsRepository(client), outbox: new SupabasePaymentEventOutbox(client) };
}

class SupabasePaymentsRepository implements PaymentsRepository {
  constructor(private readonly client: SupabaseClient) {}
  async list(id: OrganizationId): Promise<readonly Payment[]> {
    const { data,error }=await this.client.from("organization_payments").select("*").eq("organization_id",id).order("created_at",{ascending:false});
    if(error) throw repositoryFailure(error); return paymentRowSchema.array().parse(data??[]).map(mapPayment);
  }
  async confirm(input: Parameters<PaymentsRepository["confirm"]>[0]): Promise<{payment:Payment;event:PaymentConfirmed}> {
    const {data,error}=await this.client.rpc("confirm_organization_payment",{p_organization_id:input.organizationId,p_invoice_id:input.invoiceId,p_provider:input.provider,p_provider_reference:input.providerReference,p_amount_minor:input.amount.minorAmount.toString(),p_currency:input.amount.currency,p_idempotency_key:input.idempotencyKey,p_occurred_at:input.occurredAt});
    if(error) throw mapPaymentError(error); const row=confirmedPaymentResultSchema.parse(data);
    return {payment:mapPayment(row.payment),event:{id:row.event.id,type:row.event.type,paymentId:row.event.paymentId,organizationId:organizationId(row.event.organizationId),invoiceId:row.event.invoiceId,amount:money(BigInt(row.event.amountMinor),row.event.currency),isFirstPaidInvoice:row.event.isFirstPaidInvoice,occurredAt:row.event.occurredAt}};
  }
}
class SupabasePaymentEventOutbox implements PaymentEventOutbox {
  constructor(private readonly client:SupabaseClient){}
  async markProcessed(eventId:string,processedAt:string){const{error}=await this.client.rpc("mark_organization_outbox_processed",{p_event_id:eventId,p_processed_at:processedAt});if(error)throw repositoryFailure(error);}
}
function mapPayment(row: ReturnType<typeof paymentRowSchema.parse>):Payment{return{id:row.id,organizationId:organizationId(row.organization_id),invoiceId:row.invoice_id,provider:row.provider,providerReference:row.provider_reference,amount:money(BigInt(row.amount_minor),row.currency),status:row.status,confirmedAt:row.confirmed_at,createdAt:row.created_at}}
function repositoryFailure(cause:unknown){return new PaymentFailure("PAYMENT_REPOSITORY_UNAVAILABLE","No se pudo acceder a los pagos.",{cause})}
function mapPaymentError(error:{message?:string}){const message=error.message??"";if(message.includes("invoice_not_payable"))return new PaymentFailure("PAYMENT_INVOICE_NOT_PAYABLE","La factura no admite pagos.");if(message.includes("currency_mismatch"))return new PaymentFailure("PAYMENT_CURRENCY_MISMATCH","La moneda del pago no coincide con la factura.");if(message.includes("payment_amount_invalid"))return new PaymentFailure("PAYMENT_AMOUNT_INVALID","El monto no coincide con el saldo de la factura.");return repositoryFailure(error)}
