import { CompanyModuleActivationStatus, ModuleCapability, ModuleCode, ModuleInstallationStatus, ModuleLifecycleStatus, Platform } from "@kontave/modules-domain";
import { z } from "zod";

export const moduleDefinitionRowSchema = z.object({
  id: z.uuid(), code: z.enum(ModuleCode), name: z.string(), status: z.enum(ModuleLifecycleStatus),
  capabilities: z.array(z.enum(ModuleCapability)), dependencies: z.array(z.enum(ModuleCode)),
  supported_platforms: z.array(z.enum(Platform)),
});
export const moduleInstallationRowSchema = z.object({
  id: z.uuid(), organization_id: z.uuid(), module_id: z.uuid(), module_code: z.enum(ModuleCode),
  status: z.enum(ModuleInstallationStatus), configuration_version: z.number().int().positive(),
  installed_at: z.string(), activated_at: z.string().nullable(), suspended_at: z.string().nullable(),
});
export const companyModuleActivationRowSchema = z.object({
  id: z.uuid(), company_id: z.string().min(1), module_id: z.uuid(), module_code: z.enum(ModuleCode),
  status: z.enum(CompanyModuleActivationStatus), configuration_version: z.number().int().positive(),
  activated_at: z.string(), suspended_at: z.string().nullable(),
});
