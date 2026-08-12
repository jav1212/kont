import { createModuleActions } from "@/src/native-api/v1/modules/module-actions";
import { toModuleDefinitionDto } from "@/src/native-api/v1/modules/module-dto";
import { executeModuleRequest } from "@/src/native-api/v1/modules/execute-module-request";
export const dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{organizationId:string}>}){const{organizationId}=await context.params;return executeModuleRequest(request,organizationId,false,async()=>(await createModuleActions().catalog.execute()).map(toModuleDefinitionDto))}
