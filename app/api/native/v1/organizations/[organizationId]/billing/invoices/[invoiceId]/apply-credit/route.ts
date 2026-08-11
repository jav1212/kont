import { createPaymentActions } from "@/src/native-api/v1/payments/payment-actions";
import { toCreditApplicationDto } from "@/src/native-api/v1/payments/payment-dto";
import { executePaymentRequest } from "@/src/native-api/v1/payments/execute-payment-request";
import { Currency,money } from "@kontave/billing-domain";
import { z } from "zod";
export const dynamic="force-dynamic";
const schema=z.object({amountMinor:z.string().regex(/^\d+$/),currency:z.enum(Currency),idempotencyKey:z.string().trim().min(8).max(200)});
export async function POST(request:Request,context:{params:Promise<{organizationId:string;invoiceId:string}>}){const{organizationId,invoiceId}=await context.params;let body:z.infer<typeof schema>;try{body=schema.parse(await request.json())}catch{return Response.json({error:{code:"INVALID_REQUEST",message:"Los datos del crédito son inválidos."}},{status:400})}return executePaymentRequest(request,organizationId,async organization=>toCreditApplicationDto(await createPaymentActions().applyCredit.execute({organizationId:organization,invoiceId,amount:money(BigInt(body.amountMinor),body.currency),idempotencyKey:body.idempotencyKey,occurredAt:new Date().toISOString()})),true)}
