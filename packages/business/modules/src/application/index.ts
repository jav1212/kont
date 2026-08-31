import {
  ModuleFailure,
  ModuleInstallationStatus,
  ModuleLifecycleStatus,
  assertModuleCanActivate,
  moduleProvides,
  type ModuleCapability,
  type ModuleCode,
  type ModuleDefinition,
  type ModuleInstallation,
  type Platform,
} from "../domain";
import type { OrganizationId } from "@kontave/organizations/domain";

/** Read port for the global module catalog. */
export interface ModuleCatalogRepository {
  /** @returns Every module definition visible to native clients. */
  list(): Promise<readonly ModuleDefinition[]>;
  /** @returns The definition for a code, or `null` when absent. */
  findByCode(code: ModuleCode): Promise<ModuleDefinition | null>;
}

/** Persistence port for organization-specific module installations. */
export interface OrganizationModuleRepository {
  /** @returns Installations owned by the organization. */
  list(organizationId: OrganizationId): Promise<readonly ModuleInstallation[]>;
  /** @returns The matching installation, or `null` when absent. */
  find(organizationId: OrganizationId, code: ModuleCode): Promise<ModuleInstallation | null>;
  /** @returns The authoritative installation created by persistence. */
  install(
    organizationId: OrganizationId,
    definition: ModuleDefinition,
    installedAt: string,
  ): Promise<ModuleInstallation>;
  /** @returns The authoritative installation after changing status. */
  changeStatus(input: {
    organizationId: OrganizationId;
    code: ModuleCode;
    status: ModuleInstallationStatus;
    occurredAt: string;
  }): Promise<ModuleInstallation>;
}

/** Commercial-entitlement port used before module activation. */
export interface ModuleEntitlementService {
  /** @returns Whether the organization is entitled to the module code. */
  isEntitled(organizationId: OrganizationId, code: ModuleCode): Promise<boolean>;
}

/** Lists every definition in the module catalog. */
export class ListAvailableModules {
  /** @param catalog - Module catalog port. */
  constructor(private readonly catalog: ModuleCatalogRepository) {}

  /**
   * @returns All catalog definitions.
   * @throws {ModuleFailure} When the catalog is unavailable.
   */
  execute(): Promise<readonly ModuleDefinition[]> {
    return moduleCall(() => this.catalog.list());
  }
}

/** Lists module installations owned by an organization. */
export class ListOrganizationModules {
  /** @param repository - Organization-module persistence port. */
  constructor(private readonly repository: OrganizationModuleRepository) {}

  /**
   * @param organizationId - Owning organization.
   * @returns Its module installations.
   * @throws {ModuleFailure} When persistence is unavailable.
   */
  execute(organizationId: OrganizationId): Promise<readonly ModuleInstallation[]> {
    return moduleCall(() => this.repository.list(organizationId));
  }
}

/** Minimal module projection exposed to platform navigation. */
export interface AvailableOrganizationModule {
  readonly id: ModuleDefinition["id"];
  readonly code: ModuleCode;
  readonly name: string;
}

/** Resolves modules that are installed, active and supported by a client platform. */
export class ListAvailableOrganizationModules {
  /**
   * @param catalog - Module catalog port.
   * @param installations - Organization-module persistence port.
   */
  constructor(
    private readonly catalog: ModuleCatalogRepository,
    private readonly installations: OrganizationModuleRepository,
  ) {}

  /**
   * @param organizationId - Organization whose active modules are requested.
   * @param platform - Platform that must be supported by each definition.
   * @returns Active, installed and platform-compatible module projections.
   * @throws {ModuleFailure} When either persistence boundary fails.
   */
  execute(
    organizationId: OrganizationId,
    platform: Platform,
  ): Promise<readonly AvailableOrganizationModule[]> {
    return moduleCall(async () => {
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
    });
  }
}

/** Installs and immediately activates an entitled module whose dependencies are active. */
export class InstallModule {
  /**
   * @param catalog - Module catalog port.
   * @param installations - Organization-module persistence port.
   * @param entitlements - Commercial-entitlement port.
   */
  constructor(
    private readonly catalog: ModuleCatalogRepository,
    private readonly installations: OrganizationModuleRepository,
    private readonly entitlements: ModuleEntitlementService,
  ) {}

  /**
   * @param organizationId - Organization receiving the module.
   * @param code - Module code to install.
   * @param occurredAt - Portable ISO instant for the installation.
   * @returns The authoritative installation.
   * @throws {ModuleFailure} When absent, already installed, not entitled, blocked by dependencies or unavailable.
   */
  execute(
    organizationId: OrganizationId,
    code: ModuleCode,
    occurredAt: string,
  ): Promise<ModuleInstallation> {
    return moduleCall(async () => {
      const definition = await requireDefinition(this.catalog, code);
      if (await this.installations.find(organizationId, code)) {
        throw new ModuleFailure("MODULE_ALREADY_INSTALLED", "The module is already installed.");
      }
      const current = await this.installations.list(organizationId);
      const activeDependencies = new Set(
        current
          .filter((item) => item.status === ModuleInstallationStatus.Active)
          .map((item) => item.moduleCode),
      );
      const entitled = await this.entitlements.isEntitled(organizationId, code);
      assertModuleCanActivate(definition, entitled, activeDependencies);
      return this.installations.install(organizationId, definition, occurredAt);
    });
  }
}

/** Activates an installed, entitled module whose dependencies are active. */
export class ActivateModule {
  /**
   * @param catalog - Module catalog port.
   * @param installations - Organization-module persistence port.
   * @param entitlements - Commercial-entitlement port.
   */
  constructor(
    private readonly catalog: ModuleCatalogRepository,
    private readonly installations: OrganizationModuleRepository,
    private readonly entitlements: ModuleEntitlementService,
  ) {}

  /**
   * @param organizationId - Organization owning the installation.
   * @param code - Module code to activate.
   * @param occurredAt - Portable ISO instant for the transition.
   * @returns The authoritative active installation.
   * @throws {ModuleFailure} When not installed, unavailable, not entitled or blocked by dependencies.
   */
  execute(
    organizationId: OrganizationId,
    code: ModuleCode,
    occurredAt: string,
  ): Promise<ModuleInstallation> {
    return moduleCall(async () => {
      if (!(await this.installations.find(organizationId, code))) {
        throw new ModuleFailure("MODULE_NOT_INSTALLED", "The module is not installed.");
      }
      const definition = await requireDefinition(this.catalog, code);
      const activeDependencies = new Set(
        (await this.installations.list(organizationId))
          .filter((item) => item.status === ModuleInstallationStatus.Active)
          .map((item) => item.moduleCode),
      );
      const entitled = await this.entitlements.isEntitled(organizationId, code);
      assertModuleCanActivate(definition, entitled, activeDependencies);
      return this.installations.changeStatus({
        organizationId,
        code,
        status: ModuleInstallationStatus.Active,
        occurredAt,
      });
    });
  }
}

/** Suspends a module only when no active installation depends on it. */
export class SuspendModule {
  /**
   * @param catalog - Module catalog port.
   * @param installations - Organization-module persistence port.
   */
  constructor(
    private readonly catalog: ModuleCatalogRepository,
    private readonly installations: OrganizationModuleRepository,
  ) {}

  /**
   * @param organizationId - Organization owning the installation.
   * @param code - Module code to suspend.
   * @param occurredAt - Portable ISO instant for the transition.
   * @returns The authoritative suspended installation.
   * @throws {ModuleFailure} When absent, required by an active module or persistence fails.
   */
  execute(
    organizationId: OrganizationId,
    code: ModuleCode,
    occurredAt: string,
  ): Promise<ModuleInstallation> {
    return moduleCall(async () => {
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
        throw new ModuleFailure(
          "MODULE_DEPENDENT_ACTIVE",
          `The active module ${activeDependent.code} depends on this module.`,
        );
      }
      return this.installations.changeStatus({
        organizationId,
        code,
        status: ModuleInstallationStatus.Suspended,
        occurredAt,
      });
    });
  }
}

/** Requires at least one active installed module that provides a capability. */
export class RequireModuleCapability {
  /**
   * @param catalog - Module catalog port.
   * @param installations - Organization-module persistence port.
   */
  constructor(
    private readonly catalog: ModuleCatalogRepository,
    private readonly installations: OrganizationModuleRepository,
  ) {}

  /**
   * @param organizationId - Organization requiring the capability.
   * @param capability - Capability required by the caller.
   * @returns A promise completed when an active provider exists.
   * @throws {ModuleFailure} When unavailable or a persistence boundary fails.
   */
  execute(organizationId: OrganizationId, capability: ModuleCapability): Promise<void> {
    return moduleCall(async () => {
      const definitions = await this.catalog.list();
      const providers = definitions.filter((definition) => moduleProvides(definition, capability));
      const installed = await this.installations.list(organizationId);
      const allowed = providers.some((provider) => installed.some(
        (installation) => (
          installation.moduleId === provider.id
          && installation.status === ModuleInstallationStatus.Active
        ),
      ));
      if (!allowed) {
        throw new ModuleFailure(
          "MODULE_CAPABILITY_UNAVAILABLE",
          "The organization does not have this module capability.",
        );
      }
    });
  }
}

async function requireDefinition(
  catalog: ModuleCatalogRepository,
  code: ModuleCode,
): Promise<ModuleDefinition> {
  const definition = await catalog.findByCode(code);
  if (!definition) throw new ModuleFailure("MODULE_NOT_FOUND", "The module does not exist.");
  return definition;
}

async function moduleCall<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (cause: unknown) {
    if (cause instanceof ModuleFailure) throw cause;
    throw new ModuleFailure("MODULE_REPOSITORY_UNAVAILABLE", "No se pudo acceder a los módulos.", { cause });
  }
}
