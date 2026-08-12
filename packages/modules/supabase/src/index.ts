import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ModuleCatalogRepository, ModuleEntitlementService, OrganizationModuleRepository } from "@kontave/modules-application";
import { ModuleEntitlementStatus, ModuleFailure, moduleId, type ModuleCode, type ModuleDefinition } from "@kontave/modules-domain";
import { organizationId, type OrganizationId } from "@kontave/organizations-domain";
import { moduleDefinitionRowSchema, moduleInstallationRowSchema } from "./persistence-codecs";

export interface ModulesSupabaseConfiguration { readonly url: string; readonly serviceRoleKey: string }
export function createModulesInfrastructure(configuration: ModulesSupabaseConfiguration) {
  const client = createClient(configuration.url, configuration.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return { catalog: new SupabaseModuleCatalog(client), installations: new SupabaseOrganizationModules(client), entitlements: new SupabaseModuleEntitlements(client) };
}

class SupabaseModuleCatalog implements ModuleCatalogRepository {
  constructor(private readonly client: SupabaseClient) {}
  async list() { const {data,error}=await this.client.rpc("list_module_catalog"); if(error)throw repositoryFailure(error); return moduleDefinitionRowSchema.array().parse(data??[]).map(mapDefinition); }
  async findByCode(code:ModuleCode){const definitions=await this.list();return definitions.find((definition)=>definition.code===code)??null;}
}
class SupabaseOrganizationModules implements OrganizationModuleRepository {
  constructor(private readonly client:SupabaseClient){}
  async list(id:OrganizationId){const{data,error}=await this.client.from("organization_module_installations").select("id,organization_id,module_id,status,configuration_version,installed_at,activated_at,suspended_at,module_catalog!inner(code)").eq("organization_id",id);if(error)throw repositoryFailure(error);return moduleInstallationRowSchema.array().parse((data??[]).map((row)=>({...row,module_code:relationCode(row.module_catalog)}))).map(mapInstallation)}
  async find(id:OrganizationId,code:ModuleCode){return(await this.list(id)).find((item)=>item.moduleCode===code)??null}
  async install(organization:OrganizationId,definition:ModuleDefinition,installedAt:string){const{data,error}=await this.client.rpc("install_organization_module",{p_organization_id:organization,p_module_code:definition.code,p_occurred_at:installedAt});if(error)throw mapModuleError(error);return mapInstallation(moduleInstallationRowSchema.parse(data))}
  async changeStatus(input:Parameters<OrganizationModuleRepository["changeStatus"]>[0]){const{data,error}=await this.client.rpc("change_organization_module_status",{p_organization_id:input.organizationId,p_module_code:input.code,p_status:input.status,p_occurred_at:input.occurredAt});if(error)throw mapModuleError(error);return mapInstallation(moduleInstallationRowSchema.parse(data))}
}
class SupabaseModuleEntitlements implements ModuleEntitlementService {
  constructor(private readonly client:SupabaseClient){}
  async isEntitled(id:OrganizationId,code:ModuleCode){const{count,error}=await this.client.from("organization_module_entitlements").select("id",{count:"exact",head:true}).eq("organization_id",id).eq("module_code",code).eq("status",ModuleEntitlementStatus.Active);if(error)throw repositoryFailure(error);return(count??0)>0}
}
function relationCode(value:unknown):unknown{if(Array.isArray(value))return value[0]?.code;if(value&&typeof value==="object"&&"code"in value)return value.code;return undefined}
function mapDefinition(row:ReturnType<typeof moduleDefinitionRowSchema.parse>):ModuleDefinition{return{id:moduleId(row.id),code:row.code,name:row.name,status:row.status,capabilities:row.capabilities,dependencies:row.dependencies,supportedPlatforms:row.supported_platforms}}
function mapInstallation(row:ReturnType<typeof moduleInstallationRowSchema.parse>){return{id:row.id,organizationId:organizationId(row.organization_id),moduleId:moduleId(row.module_id),moduleCode:row.module_code,status:row.status,configurationVersion:row.configuration_version,installedAt:row.installed_at,activatedAt:row.activated_at,suspendedAt:row.suspended_at}}
function repositoryFailure(cause:unknown){return new ModuleFailure("MODULE_REPOSITORY_UNAVAILABLE","No se pudo acceder a los módulos.",{cause})}
function mapModuleError(error:{message?:string}){const message=error.message??"";if(message.includes("module_not_entitled"))return new ModuleFailure("MODULE_NOT_ENTITLED","La organización no tiene acceso comercial al módulo.");if(message.includes("module_dependency_missing"))return new ModuleFailure("MODULE_DEPENDENCY_MISSING","Falta una dependencia activa.");if(message.includes("module_dependent_active"))return new ModuleFailure("MODULE_DEPENDENT_ACTIVE","Otro módulo activo depende de este módulo.");if(message.includes("module_not_found"))return new ModuleFailure("MODULE_NOT_FOUND","El módulo no existe.");if(message.includes("module_already_installed"))return new ModuleFailure("MODULE_ALREADY_INSTALLED","El módulo ya está instalado.");return repositoryFailure(error)}
