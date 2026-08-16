import{AuthorizationDenied,PERMISSIONS,permissionCode}from"@kontave/access-control-domain";
import{createSupabaseAuthorization}from"@kontave/access-control-supabase";
import{InventoryDashboardFailure,type InventoryDashboardSnapshot}from"@kontave/inventory-application";
import{companyId}from"@kontave/companies-domain";
import{RequireModuleCapability}from"@kontave/modules-application";
import{ModuleCapability,ModuleFailure}from"@kontave/modules-domain";
import{createModulesInfrastructure}from"@kontave/modules-supabase";
import{companyId as organizationCompanyId,organizationId,userId}from"@kontave/organizations-domain";
import{OrganizationAccessFailure,OrganizationAccessPathKind}from"@kontave/organization-delegations-domain";
import{DelegatedPermissionScopePolicy}from"@kontave/workspace-context-application";
import{authenticateNativeRequest}from"../auth/native-auth-context";
import{createCompanyActions}from"../companies/company-actions";
import{nativeClientSource}from"../http/native-client-source";
import{nativeError,nativeSuccess}from"../http/native-response";
import{createOrganizationAccessActions}from"../organization-access/organization-access-actions";
import{createInventoryDashboardActions}from"./inventory-dashboard-actions";

export type InventoryDashboardPart="dashboard"|"summary"|"charts"|"sales"|"purchases";
export async function executeInventoryDashboardRequest(request:Request,rawOrganizationId:string,rawCompanyId:string,part:InventoryDashboardPart):Promise<Response>{
 const requestId=crypto.randomUUID();
 try{
  const identity=await authenticateNativeRequest(request);if(!identity)return nativeError("INVALID_ACCESS_TOKEN","La sesión no es válida o expiró.",requestId,401);
  const organization=organizationId(rawOrganizationId),company=companyId(rawCompanyId),occurredAt=new Date().toISOString(),permission=permissionCode(PERMISSIONS.INVENTORY_READ);
  const access=(await createOrganizationAccessActions().portfolio.execute(userId(identity.userId),occurredAt)).find(item=>item.organizationId===organization);
  if(!access||!new DelegatedPermissionScopePolicy().permits(access.accessPath,permission))return nativeError("INVENTORY_DASHBOARD_ACCESS_DENIED","No tienes acceso al tablero de inventario.",requestId,403);
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new Error("Native inventory dashboard infrastructure is not configured.");
  if(access.accessPath.kind===OrganizationAccessPathKind.DirectMembership)await createSupabaseAuthorization({url,serviceRoleKey:key}).require.execute({actor:{userId:identity.userId,organizationId:organization},permission,resource:{type:"inventory_dashboard",organizationId:organization,companyId:company},context:{requestId,source:nativeClientSource(request.headers.get("x-kontave-client")),occurredAt}});
  await createCompanyActions().getOperational.execute(organization,company);
  const modules=createModulesInfrastructure({url,serviceRoleKey:key});await new RequireModuleCapability(modules.catalog,modules.installations).execute(organization, ModuleCapability.InventoryMovements);
  const query=readQuery(request);
  const snapshot=await createInventoryDashboardActions().get.execute({actorUserId:userId(identity.userId),organizationId:organization,companyId:organizationCompanyId(rawCompanyId),...query});
  return nativeSuccess(selectPart(snapshot,part),requestId);
 }catch(cause){
  if(cause instanceof InventoryDashboardFailure)return nativeError(cause.code,cause.message,requestId,cause.code==="INVENTORY_DASHBOARD_INVALID"?400:cause.code==="INVENTORY_DASHBOARD_ACCESS_DENIED"?403:503);
  if(cause instanceof AuthorizationDenied||cause instanceof OrganizationAccessFailure)return nativeError("INVENTORY_DASHBOARD_ACCESS_DENIED","No tienes acceso al tablero de inventario.",requestId,403);
  if(cause instanceof ModuleFailure)return nativeError(cause.code,cause.message,requestId,409);
  console.error("native.inventory_dashboard.failed",{requestId,cause});return nativeError("INTERNAL_ERROR","No se pudo obtener el tablero de inventario.",requestId,500);
 }
}
function readQuery(request:Request){const url=new URL(request.url),from=url.searchParams.get("from"),to=url.searchParams.get("to");if(!from||!to)throw new InventoryDashboardFailure("INVENTORY_DASHBOARD_INVALID","from y to son obligatorios.");const granularity=url.searchParams.get("granularity")??"day",rawLimit=url.searchParams.get("limit");return{from,to,granularity:granularity as"day",recentLimit:rawLimit===null?5:Number(rawLimit)}}
function selectPart(snapshot:InventoryDashboardSnapshot,part:InventoryDashboardPart){if(part==="summary")return snapshot.summary;if(part==="charts")return snapshot.charts;if(part==="sales")return snapshot.recentSales;if(part==="purchases")return snapshot.recentPurchases;return snapshot;}
