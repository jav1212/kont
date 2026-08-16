import type { OrganizationId } from "@kontave/organizations-domain";
import {
  ModuleFailure,
  ModuleLifecycleStatus,
  ModuleInstallationStatus,
  assertModuleCanActivate,
  moduleProvides,
  type ModuleCapability,
  type ModuleCode,
  type ModuleDefinition,
  type ModuleInstallation,
  type Platform,
} from "@kontave/modules-domain";

export interface ModuleCatalogRepository {
  list(): Promise<readonly ModuleDefinition[]>;
  findByCode(code: ModuleCode): Promise<ModuleDefinition | null>;
}

export interface OrganizationModuleRepository {
  list(organizationId: OrganizationId): Promise<readonly ModuleInstallation[]>;
  find(organizationId: OrganizationId, code: ModuleCode): Promise<ModuleInstallation | null>;
  install(organizationId: OrganizationId, definition: ModuleDefinition, installedAt: string): Promise<ModuleInstallation>;
  changeStatus(input: { organizationId: OrganizationId; code: ModuleCode; status: ModuleInstallationStatus; occurredAt: string }): Promise<ModuleInstallation>;
}

export interface ModuleEntitlementService {
  isEntitled(organizationId: OrganizationId, code: ModuleCode): Promise<boolean>;
}

export class ListAvailableModules {
  constructor(private readonly catalog: ModuleCatalogRepository) {}
  execute() { return this.catalog.list(); }
}

export class ListOrganizationModules {
  constructor(private readonly repository: OrganizationModuleRepository) {}
  execute(organizationId: OrganizationId) { return this.repository.list(organizationId); }
}

export interface AvailableOrganizationModule {
  readonly id: ModuleDefinition["id"];
  readonly code: ModuleCode;
  readonly name: string;
}

/** Resolves modules that are installed, active, and supported by a client platform. */
export class ListAvailableOrganizationModules {
  constructor(
    private readonly catalog: ModuleCatalogRepository,
    private readonly installations: OrganizationModuleRepository,
  ) {}

  async execute(
    organizationId: OrganizationId,
    platform: Platform,
  ): Promise<readonly AvailableOrganizationModule[]> {
    const [definitions, installed] = await Promise.all([
      this.catalog.list(),
      this.installations.list(organizationId),
    ]);
    const activeModuleIds = new Set(
      installed
        .filter((installation) => installation.status === ModuleInstallationStatus.Active)
        .map((installation) => installation.moduleId),
    );
    return definitions
      .filter((definition) => definition.status === ModuleLifecycleStatus.Active)
      .filter((definition) => definition.supportedPlatforms.includes(platform))
      .filter((definition) => activeModuleIds.has(definition.id))
      .map((definition) => ({ id: definition.id, code: definition.code, name: definition.name }));
  }
}

export class InstallModule {
  constructor(
    private readonly catalog: ModuleCatalogRepository,
    private readonly installations: OrganizationModuleRepository,
    private readonly entitlements: ModuleEntitlementService,
  ) {}

  async execute(organizationId: OrganizationId, code: ModuleCode, occurredAt: string) {
    const definition = await requireDefinition(this.catalog, code);
    if (await this.installations.find(organizationId, code)) {
      throw new ModuleFailure("MODULE_ALREADY_INSTALLED", "The module is already installed.");
    }
    const current = await this.installations.list(organizationId);
    const activeDependencies = new Set(
      current.filter((item) => item.status === ModuleInstallationStatus.Active).map((item) => item.moduleCode),
    );
    assertModuleCanActivate(definition, await this.entitlements.isEntitled(organizationId, code), activeDependencies);
    return this.installations.install(organizationId, definition, occurredAt);
  }
}

export class ActivateModule {
  constructor(
    private readonly catalog: ModuleCatalogRepository,
    private readonly installations: OrganizationModuleRepository,
    private readonly entitlements: ModuleEntitlementService,
  ) {}

  async execute(organizationId: OrganizationId, code: ModuleCode, occurredAt: string) {
    if (!(await this.installations.find(organizationId, code))) {
      throw new ModuleFailure("MODULE_NOT_INSTALLED", "The module is not installed.");
    }
    const definition = await requireDefinition(this.catalog, code);
    const activeDependencies = new Set(
      (await this.installations.list(organizationId))
        .filter((item) => item.status === ModuleInstallationStatus.Active)
        .map((item) => item.moduleCode),
    );
    assertModuleCanActivate(definition, await this.entitlements.isEntitled(organizationId, code), activeDependencies);
    return this.installations.changeStatus({ organizationId, code, status: ModuleInstallationStatus.Active, occurredAt });
  }
}

export class SuspendModule {
  constructor(private readonly catalog: ModuleCatalogRepository, private readonly installations: OrganizationModuleRepository) {}
  async execute(organizationId: OrganizationId, code: ModuleCode, occurredAt: string) {
    if (!(await this.installations.find(organizationId, code))) {
      throw new ModuleFailure("MODULE_NOT_INSTALLED", "The module is not installed.");
    }
    const activeCodes = new Set(
      (await this.installations.list(organizationId))
        .filter((installation) => installation.status === ModuleInstallationStatus.Active)
        .map((installation) => installation.moduleCode),
    );
    const activeDependent = (await this.catalog.list()).find(
      (definition) => activeCodes.has(definition.code) && definition.dependencies.includes(code),
    );
    if (activeDependent) {
      throw new ModuleFailure("MODULE_DEPENDENT_ACTIVE", `The active module ${activeDependent.code} depends on this module.`);
    }
    return this.installations.changeStatus({ organizationId, code, status: ModuleInstallationStatus.Suspended, occurredAt });
  }
}

export class RequireModuleCapability {
  constructor(private readonly catalog: ModuleCatalogRepository, private readonly installations: OrganizationModuleRepository) {}
  async execute(organizationId: OrganizationId, capability: ModuleCapability): Promise<void> {
    const definitions = await this.catalog.list();
    const providers = definitions.filter((definition) => moduleProvides(definition, capability));
    const installed = await this.installations.list(organizationId);
    const allowed = providers.some((provider) => installed.some(
      (installation) => installation.moduleId === provider.id && installation.status === ModuleInstallationStatus.Active,
    ));
    if (!allowed) throw new ModuleFailure("MODULE_CAPABILITY_UNAVAILABLE", "The organization does not have this module capability.");
  }
}

async function requireDefinition(catalog: ModuleCatalogRepository, code: ModuleCode): Promise<ModuleDefinition> {
  const definition = await catalog.findByCode(code);
  if (!definition) throw new ModuleFailure("MODULE_NOT_FOUND", "The module does not exist.");
  return definition;
}
