import type { OrganizationId } from "@kontave/organizations-domain";
import { ModuleInstallationStatus, type ModuleCode, type ModuleDefinition, type ModuleInstallation } from "@kontave/modules-domain";

export class InMemoryModuleCatalog {
  constructor(readonly definitions: readonly ModuleDefinition[]) {}
  async list() { return this.definitions; }
  async findByCode(code: ModuleCode) { return this.definitions.find((definition) => definition.code === code) ?? null; }
}

export class InMemoryOrganizationModules {
  constructor(readonly installations: ModuleInstallation[] = []) {}
  async list(organizationId: OrganizationId) { return this.installations.filter((item) => item.organizationId === organizationId); }
  async find(organizationId: OrganizationId, code: ModuleCode) { return this.installations.find((item) => item.organizationId === organizationId && item.moduleCode === code) ?? null; }
  async install(organizationId: OrganizationId, definition: ModuleDefinition, installedAt: string) {
    const installation: ModuleInstallation = { id: crypto.randomUUID(), organizationId, moduleId: definition.id, moduleCode: definition.code, status: ModuleInstallationStatus.Active, configurationVersion: 1, installedAt, activatedAt: installedAt, suspendedAt: null };
    this.installations.push(installation); return installation;
  }
  async changeStatus(input: { organizationId: OrganizationId; code: ModuleCode; status: ModuleInstallationStatus; occurredAt: string }) {
    const current = await this.find(input.organizationId, input.code); if (!current) throw new Error("Missing fixture installation");
    const updated: ModuleInstallation = { ...current, status: input.status, activatedAt: input.status === ModuleInstallationStatus.Active ? input.occurredAt : current.activatedAt, suspendedAt: input.status === ModuleInstallationStatus.Suspended ? input.occurredAt : null };
    this.installations.splice(this.installations.indexOf(current), 1, updated); return updated;
  }
}

export class InMemoryModuleEntitlements {
  constructor(private readonly codes: ReadonlySet<ModuleCode>) {}
  async isEntitled(_organizationId: OrganizationId, code: ModuleCode) { return this.codes.has(code); }
}
