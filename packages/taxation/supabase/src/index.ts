import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { companyId } from "@kontave/companies-domain";
import { exactDecimal } from "@kontave/monetary-domain";
import { productId, type ProductId } from "@kontave/products-domain";
import type { ProductTaxationRepository, TaxationContext } from "@kontave/taxation-application";
import {
  ProductTaxProfile, productTaxProfileId, taxCode, taxRule, taxRuleId, taxationDate, TaxationFailure,
  type TaxCode, type TaxTreatment,
} from "@kontave/taxation-domain";
import { z } from "zod";

const assignmentSchema=z.object({taxCode:z.string(),treatment:z.enum(["taxed","exempt","exonerated","not_subject"]),effectiveFrom:z.string(),effectiveTo:z.string().nullable(),legalBasis:z.string(),classificationVersion:z.string()});
const profileSchema=z.object({id:z.string(),companyId:z.string(),productId:z.string(),jurisdiction:z.string(),version:z.number().int().positive(),assignments:z.array(assignmentSchema)});
const ruleSchema=z.object({id:z.string(),taxCode:z.string(),jurisdiction:z.string(),treatment:z.enum(["taxed","exempt","exonerated","not_subject"]),rate:z.string(),calculationMode:z.enum(["tax_exclusive","tax_inclusive"]),effectiveFrom:z.string(),effectiveTo:z.string().nullable(),legalBasis:z.string(),version:z.string()});

export class SupabaseProductTaxationRepository implements ProductTaxationRepository {
  constructor(private readonly client:SupabaseClient){}
  async getProfile(context:TaxationContext,id:ProductId){const data=await this.rpc("get_native_product_tax_profile",{...args(context),p_product_id:id});return data===null?null:mapProfile(profileSchema.parse(data));}
  async listRules(code:TaxCode,jurisdiction:string){return ruleSchema.array().parse(await this.rpc("list_native_tax_rules",{p_tax_code:code,p_jurisdiction:jurisdiction})).map(value=>taxRule({id:taxRuleId(value.id),taxCode:taxCode(value.taxCode),jurisdiction:value.jurisdiction,treatment:value.treatment,rate:exactDecimal(value.rate),calculationMode:value.calculationMode,effectiveFrom:taxationDate(value.effectiveFrom),effectiveTo:value.effectiveTo?taxationDate(value.effectiveTo):null,legalBasis:value.legalBasis,version:value.version}));}
  async setTreatment(input:TaxationContext&{productId:ProductId;taxCode:TaxCode;treatment:TaxTreatment;effectiveFrom:string;legalBasis:string;expectedVersion:number}){return mapProfile(profileSchema.parse(await this.rpc("set_native_product_tax_treatment",{...args(input),p_product_id:input.productId,p_tax_code:input.taxCode,p_treatment:input.treatment,p_effective_from:input.effectiveFrom,p_legal_basis:input.legalBasis,p_expected_version:input.expectedVersion})));}
  private async rpc(name:string,input:Record<string,unknown>){const{data,error}=await this.client.rpc(name,input);if(error)throw failure(error);return data;}
}
export function createSupabaseProductTaxationRepository(config:{readonly url:string;readonly serviceRoleKey:string}){return new SupabaseProductTaxationRepository(createClient(config.url,config.serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}));}
function args(value:TaxationContext){return{p_actor_user_id:value.actorUserId,p_organization_id:value.organizationId,p_company_id:value.companyId};}
function mapProfile(value:z.infer<typeof profileSchema>){return new ProductTaxProfile({id:productTaxProfileId(value.id),companyId:companyId(value.companyId),productId:productId(value.productId),jurisdiction:value.jurisdiction,version:value.version,assignments:value.assignments.map(a=>({taxCode:taxCode(a.taxCode),treatment:a.treatment,effectiveFrom:taxationDate(a.effectiveFrom),effectiveTo:a.effectiveTo?taxationDate(a.effectiveTo):null,legalBasis:a.legalBasis,classificationVersion:a.classificationVersion}))});}
function failure(error:{message:string}){for(const code of["TAXATION_VERSION_CONFLICT","TAXATION_PROFILE_NOT_FOUND","TAXATION_PROFILE_INVALID"]as const)if(error.message.includes(code))return new TaxationFailure(code,error.message,{cause:error});return new TaxationFailure("TAXATION_REPOSITORY_UNAVAILABLE","Taxation repository is unavailable.",{cause:error});}
