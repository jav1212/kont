import type { OrganizationId } from "@kontave/organizations-domain";
import type { CompanyId } from "@kontave/companies-domain";

declare const moduleIdBrand: unique symbol;
export type ModuleId = string & { readonly [moduleIdBrand]: true };
export function moduleId(value: string): ModuleId {
  const normalized = value.trim();
  if (!normalized) throw new ModuleFailure("MODULE_INVALID", "Module identifiers cannot be empty.");
  return normalized as ModuleId;
}

export enum ModuleCode {
  Payroll = "payroll",
  Purchases = "purchases",
  Sales = "sales",
  Inventory = "inventory",
  Accounting = "accounting",
  Tools = "tools",
  Companies = "companies",
  Documents = "documents",
}

export enum ModuleLifecycleStatus {
  Active = "active",
  Deprecated = "deprecated",
  Retired = "retired",
}

export enum ModuleInstallationStatus {
  Pending = "pending",
  Active = "active",
  Suspended = "suspended",
  Uninstalled = "uninstalled",
}
export enum ModuleEntitlementStatus {
  Active = "active",
  Suspended = "suspended",
}

export enum Platform {
  Web = "web",
  Desktop = "desktop",
  Mobile = "mobile",
}

export function platform(value: string): Platform {
  if (value === Platform.Web || value === Platform.Desktop || value === Platform.Mobile) return value;
  throw new ModuleFailure("MODULE_INVALID", "The requested platform is invalid.");
}

export enum ModuleCapability {
  PayrollRuns = "payroll.runs",
  PayrollEmployees = "payroll.employees",
  InventoryProducts = "inventory.products",
  InventoryMovements = "inventory.movements",
  AccountingEntries = "accounting.entries",
  AccountingPeriods = "accounting.periods",
  DocumentsFiles = "documents.files",
}

export interface ModuleDefinition {
  readonly id: ModuleId;
  readonly code: ModuleCode;
  readonly name: string;
  readonly status: ModuleLifecycleStatus;
  readonly capabilities: readonly ModuleCapability[];
  readonly dependencies: readonly ModuleCode[];
  readonly supportedPlatforms: readonly Platform[];
}

export interface ModuleInstallation {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly moduleId: ModuleId;
  readonly moduleCode: ModuleCode;
  readonly status: ModuleInstallationStatus;
  readonly configurationVersion: number;
  readonly installedAt: string;
  readonly activatedAt: string | null;
  readonly suspendedAt: string | null;
}

export enum CompanyModuleActivationStatus {
  Active = "active",
  Suspended = "suspended",
}

export interface CompanyModuleActivation {
  readonly id: string;
  readonly companyId: CompanyId;
  readonly moduleId: ModuleId;
  readonly moduleCode: ModuleCode;
  readonly status: CompanyModuleActivationStatus;
  readonly configurationVersion: number;
  readonly activatedAt: string;
  readonly suspendedAt: string | null;
}

export type ModuleFailureCode =
  | "MODULE_INVALID"
  | "MODULE_NOT_FOUND"
  | "MODULE_NOT_ENTITLED"
  | "MODULE_DEPENDENCY_MISSING"
  | "MODULE_DEPENDENT_ACTIVE"
  | "MODULE_ALREADY_INSTALLED"
  | "MODULE_NOT_INSTALLED"
  | "MODULE_NOT_ACTIVE"
  | "MODULE_CAPABILITY_UNAVAILABLE"
  | "COMPANY_MODULE_NOT_ACTIVE"
  | "MODULE_REPOSITORY_UNAVAILABLE";

export class ModuleFailure extends Error {
  constructor(readonly code: ModuleFailureCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ModuleFailure";
  }
}

export function assertModuleCanActivate(
  definition: ModuleDefinition,
  entitled: boolean,
  activeDependencies: ReadonlySet<ModuleCode>,
): void {
  if (definition.status !== ModuleLifecycleStatus.Active) {
    throw new ModuleFailure("MODULE_NOT_ACTIVE", "The module is not available for activation.");
  }
  if (!entitled) throw new ModuleFailure("MODULE_NOT_ENTITLED", "The organization is not entitled to this module.");
  const missing = definition.dependencies.find((dependency) => !activeDependencies.has(dependency));
  if (missing) throw new ModuleFailure("MODULE_DEPENDENCY_MISSING", `The required module ${missing} is not active.`);
}

export function moduleProvides(definition: ModuleDefinition, capability: ModuleCapability): boolean {
  return definition.capabilities.includes(capability);
}
