import { createPaymentActions } from "@/src/native-api/v1/payments/payment-actions";
import { toPaymentDto } from "@/src/native-api/v1/payments/payment-dto";
import { executePaymentRequest } from "@/src/native-api/v1/payments/execute-payment-request";
import { Currency,money } from "@kontave/billing-domain";
import { PaymentProvider } from "@kontave/payments-domain";
import { z } from "zod";
export const dynamic="force-dynamic";
const schema=z.object({invoiceId:z.uuid(),provider:z.enum(PaymentProvider),providerReference:z.string().trim().min(1).max(200),amountMinor:z.string().regex(/^\d+$/),currency:z.enum(Currency),idempotencyKey:z.string().trim().min(8).max(200)});
export async function POST(request:Request,context:{params:Promise<{organizationId:string}>}){const{organizationId}=await context.params;let body:z.infer<typeof schema>;try{body=schema.parse(await request.json())}catch{return Response.json({error:{code:"INVALID_REQUEST",message:"Los datos del pago son inválidos."}},{status:400})}return executePaymentRequest(request,organizationId,async organization=>toPaymentDto(await createPaymentActions().confirm.execute({organizationId:organization,invoiceId:body.invoiceId,provider:body.provider,providerReference:body.providerReference,amount:money(BigInt(body.amountMinor),body.currency),occurredAt:new Date().toISOString(),idempotencyKey:body.idempotencyKey})),true)}
