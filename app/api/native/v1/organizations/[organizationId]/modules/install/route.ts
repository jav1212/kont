import { createModuleActions } from "@/src/native-api/v1/modules/module-actions";
import { toModuleInstallationDto } from "@/src/native-api/v1/modules/module-dto";
import { executeModuleRequest } from "@/src/native-api/v1/modules/execute-module-request";
import { ModuleCode } from "@kontave/modules-domain";
import { z } from "zod";
export const dynamic="force-dynamic";const schema=z.object({code:z.enum(ModuleCode)});
export async function POST(request:Request,context:{params:Promise<{organizationId:string}>}){const{organizationId}=await context.params;let body:z.infer<typeof schema>;try{body=schema.parse(await request.json())}catch{return Response.json({error:{code:"INVALID_REQUEST",message:"El módulo es inválido."}},{status:400})}return executeModuleRequest(request,organizationId,true,async organization=>toModuleInstallationDto(await createModuleActions().install.execute(organization,body.code,new Date().toISOString())))}
