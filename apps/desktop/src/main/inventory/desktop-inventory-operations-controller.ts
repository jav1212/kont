import { KontaveRemoteClient, KontaveRemoteFailure, RemoteInventoryPort } from "@kontave/client-remote";
import type { CreateInventoryOperationDto, InventoryFlowPageDto, InventoryOperationDetailDto, ReverseInventoryOperationDto, UpdateInventoryOperationDto } from "@kontave/client-contracts";
import type { DesktopInventoryFlowQuery, DesktopInventoryResult } from "../../shared/desktop-api";
import type { DesktopAuthenticatedRequest } from "../auth/desktop-authenticated-request";

export class DesktopInventoryOperationsController {
  private readonly inventory: RemoteInventoryPort;
  constructor(baseUrl:string,authenticatedRequest:DesktopAuthenticatedRequest){this.inventory=new RemoteInventoryPort(new KontaveRemoteClient({baseUrl,platform:"desktop",authenticatedRequest:(input,init)=>authenticatedRequest.fetch(input,init)}));}
  entries(organizationId:unknown,companyId:unknown,query:unknown){return this.list("entries",organizationId,companyId,query);}
  outputs(organizationId:unknown,companyId:unknown,query:unknown){return this.list("outputs",organizationId,companyId,query);}
  operations(organizationId:unknown,companyId:unknown,query:unknown){return this.list("operations",organizationId,companyId,query);}
  operation(organizationId:unknown,companyId:unknown,operationId:unknown):Promise<DesktopInventoryResult<InventoryOperationDetailDto>>{return execute(()=>this.inventory.operation(segment(organizationId),segment(companyId),segment(operationId)));}
  create(organizationId:unknown,companyId:unknown,command:CreateInventoryOperationDto):Promise<DesktopInventoryResult<InventoryOperationDetailDto>>{return execute(()=>this.inventory.create(segment(organizationId),segment(companyId),command));}
  update(organizationId:unknown,companyId:unknown,operationId:unknown,command:UpdateInventoryOperationDto):Promise<DesktopInventoryResult<InventoryOperationDetailDto>>{return execute(()=>this.inventory.update(segment(organizationId),segment(companyId),segment(operationId),command));}
  post(organizationId:unknown,companyId:unknown,operationId:unknown,expectedVersion:unknown):Promise<DesktopInventoryResult<InventoryOperationDetailDto>>{if(typeof expectedVersion!=="number")return Promise.resolve({ok:false,error:{code:"INVALID_REQUEST",message:"La versión no es válida.",requestId:null}});return execute(()=>this.inventory.post(segment(organizationId),segment(companyId),segment(operationId),expectedVersion));}
  reverse(organizationId:unknown,companyId:unknown,operationId:unknown,command:ReverseInventoryOperationDto):Promise<DesktopInventoryResult<InventoryOperationDetailDto>>{return execute(()=>this.inventory.reverse(segment(organizationId),segment(companyId),segment(operationId),command));}
  private list(kind:"entries"|"outputs"|"operations",organizationId:unknown,companyId:unknown,query:unknown):Promise<DesktopInventoryResult<InventoryFlowPageDto>>{const context=[segment(organizationId),segment(companyId)] as const;const parsed=readQuery(query);return execute(()=>this.inventory[kind](context[0],context[1],parsed));}
}
function segment(value:unknown){if(typeof value!=="string"||!value.trim())throw new Error("El contexto de Inventario no es válido.");return value;}
function readQuery(value:unknown):DesktopInventoryFlowQuery{if(typeof value!=="object"||value===null)throw new Error("El período de Inventario es obligatorio.");const query=value as DesktopInventoryFlowQuery;if(!/^\d{4}-\d{2}-\d{2}$/.test(query.from)||!/^\d{4}-\d{2}-\d{2}$/.test(query.to))throw new Error("El período de Inventario no es válido.");return query;}
async function execute<T>(operation:()=>Promise<T>):Promise<DesktopInventoryResult<T>>{try{return{ok:true,value:await operation()};}catch(cause){const failure=findFailure(cause);return{ok:false,error:{code:failure?.code??"INVENTORY_OPERATION_REPOSITORY_UNAVAILABLE",message:failure?.message??(cause instanceof Error?cause.message:"No se pudo acceder a las operaciones de Inventario."),requestId:failure?.requestId??crypto.randomUUID()}};}}
function findFailure(cause:unknown):KontaveRemoteFailure|null{let current=cause;const visited=new Set<unknown>();while(current instanceof Error&&!visited.has(current)){if(current instanceof KontaveRemoteFailure)return current;visited.add(current);current=current.cause;}return null;}
