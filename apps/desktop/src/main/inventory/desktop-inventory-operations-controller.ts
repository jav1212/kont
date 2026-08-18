import { KontaveRemoteClient, KontaveRemoteFailure } from "@kontave/client-remote";
import type { CreateInventoryOperationDto, InventoryFlowPageDto, InventoryOperationDetailDto, ReverseInventoryOperationDto, UpdateInventoryOperationDto } from "@kontave/client-contracts";
import type { DesktopInventoryFlowQuery, DesktopInventoryResult } from "../../shared/desktop-api";
import type { DesktopAuthenticatedRequest } from "../auth/desktop-authenticated-request";

export class DesktopInventoryOperationsController {
  private readonly client: KontaveRemoteClient;
  constructor(baseUrl:string,authenticatedRequest:DesktopAuthenticatedRequest){this.client=new KontaveRemoteClient({baseUrl,platform:"desktop",authenticatedRequest:(input,init)=>authenticatedRequest.fetch(input,init)});}
  entries(organizationId:unknown,companyId:unknown,query:unknown){return this.list("entries",organizationId,companyId,query);}
  outputs(organizationId:unknown,companyId:unknown,query:unknown){return this.list("outputs",organizationId,companyId,query);}
  operations(organizationId:unknown,companyId:unknown,query:unknown){return this.list("operations",organizationId,companyId,query);}
  operation(organizationId:unknown,companyId:unknown,operationId:unknown):Promise<DesktopInventoryResult<InventoryOperationDetailDto>>{return execute(()=>this.client.get(`${root(organizationId,companyId)}/inventory/operations/${segment(operationId)}`));}
  create(organizationId:unknown,companyId:unknown,command:CreateInventoryOperationDto):Promise<DesktopInventoryResult<InventoryOperationDetailDto>>{return execute(()=>this.client.request(`${root(organizationId,companyId)}/inventory/operations`,json("POST",command)));}
  update(organizationId:unknown,companyId:unknown,operationId:unknown,command:UpdateInventoryOperationDto):Promise<DesktopInventoryResult<InventoryOperationDetailDto>>{return execute(()=>this.client.request(`${root(organizationId,companyId)}/inventory/operations/${segment(operationId)}`,json("PATCH",command)));}
  post(organizationId:unknown,companyId:unknown,operationId:unknown,expectedVersion:unknown):Promise<DesktopInventoryResult<InventoryOperationDetailDto>>{return execute(()=>this.client.request(`${root(organizationId,companyId)}/inventory/operations/${segment(operationId)}/post`,json("POST",{expectedVersion})));}
  reverse(organizationId:unknown,companyId:unknown,operationId:unknown,command:ReverseInventoryOperationDto):Promise<DesktopInventoryResult<InventoryOperationDetailDto>>{return execute(()=>this.client.request(`${root(organizationId,companyId)}/inventory/operations/${segment(operationId)}/reverse`,json("POST",command)));}
  private list(kind:"entries"|"outputs"|"operations",organizationId:unknown,companyId:unknown,query:unknown):Promise<DesktopInventoryResult<InventoryFlowPageDto>>{return execute(()=>this.client.get(`${root(organizationId,companyId)}/inventory/${kind}${queryString(readQuery(query),kind==="operations")}`));}
}
function root(organizationId:unknown,companyId:unknown){return `/api/client/v1/organizations/${segment(organizationId)}/companies/${segment(companyId)}`;}
function segment(value:unknown){if(typeof value!=="string"||!value.trim())throw new Error("El contexto de Inventario no es válido.");return encodeURIComponent(value);}
function readQuery(value:unknown):DesktopInventoryFlowQuery{if(typeof value!=="object"||value===null)throw new Error("El período de Inventario es obligatorio.");const query=value as DesktopInventoryFlowQuery;if(!/^\d{4}-\d{2}-\d{2}$/.test(query.from)||!/^\d{4}-\d{2}-\d{2}$/.test(query.to))throw new Error("El período de Inventario no es válido.");return query;}
function queryString(query:DesktopInventoryFlowQuery,manual:boolean){const values=new URLSearchParams();Object.entries(query).forEach(([key,value])=>{if((typeof value==="string"||typeof value==="number")&&value!=="")values.set(key,String(value));});if(manual)values.set("sourceKind","inventory");return `?${values.toString()}`;}
function json(method:"POST"|"PATCH",body:unknown):RequestInit{return{method,headers:{"content-type":"application/json"},body:JSON.stringify(body)};}
async function execute<T>(operation:()=>Promise<T>):Promise<DesktopInventoryResult<T>>{try{return{ok:true,value:await operation()};}catch(cause){const failure=findFailure(cause);return{ok:false,error:{code:failure?.code??"INVENTORY_OPERATION_REPOSITORY_UNAVAILABLE",message:failure?.message??(cause instanceof Error?cause.message:"No se pudo acceder a las operaciones de Inventario."),requestId:failure?.requestId??crypto.randomUUID()}};}}
function findFailure(cause:unknown):KontaveRemoteFailure|null{let current=cause;const visited=new Set<unknown>();while(current instanceof Error&&!visited.has(current)){if(current instanceof KontaveRemoteFailure)return current;visited.add(current);current=current.cause;}return null;}
