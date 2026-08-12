import { createModuleActions } from "@/src/native-api/v1/modules/module-actions";
import { toModuleInstallationDto } from "@/src/native-api/v1/modules/module-dto";
import { executeModuleRequest } from "@/src/native-api/v1/modules/execute-module-request";
import { ModuleCode } from "@kontave/modules-domain";
import { z } from "zod";
export const dynamic="force-dynamic";
export async function POST(request:Request,context:{params:Promise<{organizationId:string;code:string}>}){const{organizationId,code}=await context.params;const parsed=z.enum(ModuleCode).safeParse(code);if(!parsed.success)return Response.json({error:{code:"INVALID_REQUEST",message:"El módulo es inválido."}},{status:400});return executeModuleRequest(request,organizationId,true,async organization=>toModuleInstallationDto(await createModuleActions().suspend.execute(organization,parsed.data,new Date().toISOString())))}
