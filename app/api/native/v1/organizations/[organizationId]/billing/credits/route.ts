import { createPaymentActions } from "@/src/native-api/v1/payments/payment-actions";
import { toMoneyDto } from "@/src/native-api/v1/payments/payment-dto";
import { executePaymentRequest } from "@/src/native-api/v1/payments/execute-payment-request";
export const dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{organizationId:string}>}){const{organizationId}=await context.params;return executePaymentRequest(request,organizationId,async organization=>toMoneyDto((await createPaymentActions().creditBalance.execute(organization)).balance),false)}
