import assert from "node:assert/strict";
import test from "node:test";
import { OrganizationAccessPathKind } from "@kontave/organization-delegations-domain";
import { OrganizationRelationship, companyId, organizationId, userId, type CompanyId, type OrganizationId, type OrganizationRelationship as OrganizationRelationshipValue } from "@kontave/organizations-domain";
import { ModuleCode, moduleId, type ModuleCode as ModuleCodeValue } from "@kontave/modules-domain";
import {
  WorkspaceContextSession,
  WorkspaceCompanyContextSession,
  type ActiveWorkspaceCompanyStore,
  WorkspaceModuleContextSession,
  type ActiveWorkspaceModuleStore,
  type ActiveWorkspaceSelectionStore,
  type WorkspacePortfolioEntry,
  type WorkspacePortfolioSource,
} from "../src/index.js";

const actor = userId("user-1");

function workspace(id: string, relationship: OrganizationRelationshipValue): WorkspacePortfolioEntry {
  const organization = organizationId(id);
  const kind = relationship === OrganizationRelationship.Delegated
    ? OrganizationAccessPathKind.DelegatedOrganization
    : OrganizationAccessPathKind.DirectMembership;
  return {
    organizationId: organization,
    name: id,
    avatarUrl: null,
    relationship,
    accessPath: {
      kind,
      actorUserId: actor,
      actingOrganizationId: organization,
      targetOrganizationId: organization,
      delegationId: null,
      scopes: [],
    },
  };
}

class MemorySelection implements ActiveWorkspaceSelectionStore {
  value: OrganizationId | null;
  constructor(value: OrganizationId | null = null) { this.value = value; }
  async read(): Promise<OrganizationId | null> { return this.value; }
  async write(value: OrganizationId | null): Promise<void> { this.value = value; }
}

test("restore preserves an accessible selection", async () => {
  const delegated = workspace("delegated", OrganizationRelationship.Delegated);
  const direct = workspace("direct", OrganizationRelationship.Member);
  const source: WorkspacePortfolioSource = { async list() { return [direct, delegated]; } };
  const session = new WorkspaceContextSession(source, new MemorySelection(delegated.organizationId));
  assert.equal((await session.restore()).active?.organizationId, delegated.organizationId);
});

test("restore falls back to personal when a stored selection is inaccessible", async () => {
  const delegated = workspace("delegated", OrganizationRelationship.Delegated);
  const personal = workspace("personal", OrganizationRelationship.Personal);
  const selection = new MemorySelection(organizationId("missing"));
  const source: WorkspacePortfolioSource = { async list() { return [delegated, personal]; } };
  const session = new WorkspaceContextSession(source, selection);
  assert.equal((await session.restore()).active?.organizationId, personal.organizationId);
  await assert.rejects(() => session.select(organizationId("missing")));
});

test("clear removes both context and persisted selection", async () => {
  const direct = workspace("direct", OrganizationRelationship.Member);
  const selection = new MemorySelection();
  const source: WorkspacePortfolioSource = { async list() { return [direct]; } };
  const session = new WorkspaceContextSession(source, selection);
  await session.restore();
  assert.equal((await session.clear()).active, null);
  assert.equal(selection.value, null);
});

test("restore selects personal even when it is not alphabetically first", async () => {
  const alphabeticalFirst = workspace("a-member", OrganizationRelationship.Member);
  const personal = workspace("z-personal", OrganizationRelationship.Personal);
  const session = new WorkspaceContextSession({ async list() { return [alphabeticalFirst, personal]; } }, new MemorySelection());
  assert.equal((await session.restore()).active?.organizationId, personal.organizationId);
});

test("restore uses member first when no personal organization exists", async () => {
  const delegated = workspace("a-client", OrganizationRelationship.Delegated);
  const member = workspace("z-member", OrganizationRelationship.Member);
  const session = new WorkspaceContextSession({ async list() { return [delegated, member]; } }, new MemorySelection());
  assert.equal((await session.restore()).active?.organizationId, member.organizationId);
});

test("restore uses delegated when no direct relationships exist", async () => {
  const delegated = workspace("client", OrganizationRelationship.Delegated);
  const session = new WorkspaceContextSession({ async list() { return [delegated]; } }, new MemorySelection());
  assert.equal((await session.restore()).active?.organizationId, delegated.organizationId);
});

test("a direct access remains member unless the backend classifies it as personal", () => {
  const direct = workspace("direct", OrganizationRelationship.Member);
  assert.equal(direct.accessPath.kind, OrganizationAccessPathKind.DirectMembership);
  assert.equal(direct.relationship, OrganizationRelationship.Member);
});

class MemoryModuleSelection implements ActiveWorkspaceModuleStore {
  readonly values = new Map<OrganizationId, ModuleCodeValue>();
  async read(organization: OrganizationId): Promise<ModuleCodeValue | null> { return this.values.get(organization) ?? null; }
  async write(organization: OrganizationId, code: ModuleCodeValue | null): Promise<void> {
    if (code) this.values.set(organization, code); else this.values.delete(organization);
  }
}

test("module context restores selection independently for each organization", async () => {
  const first = organizationId("organization-1");
  const second = organizationId("organization-2");
  const modules = [
    { id: moduleId("payroll-id"), code: ModuleCode.Payroll, name: "Nómina" },
    { id: moduleId("inventory-id"), code: ModuleCode.Inventory, name: "Inventario" },
  ];
  const store = new MemoryModuleSelection();
  store.values.set(first, ModuleCode.Inventory);
  const session = new WorkspaceModuleContextSession({ async listAvailable() { return modules; } }, store);

  assert.equal((await session.restore(first)).active?.code, ModuleCode.Inventory);
  assert.equal((await session.restore(second)).active?.code, ModuleCode.Payroll);
  await session.select(ModuleCode.Inventory);
  assert.equal(store.values.get(second), ModuleCode.Inventory);
});

test("module context rejects modules unavailable to the active organization", async () => {
  const session = new WorkspaceModuleContextSession({ async listAvailable() { return []; } }, new MemoryModuleSelection());
  await session.restore(organizationId("organization-1"));
  await assert.rejects(() => session.select(ModuleCode.Accounting), { code: "MODULE_NOT_ACTIVE" });
});

class MemoryCompanySelection implements ActiveWorkspaceCompanyStore {
  readonly values = new Map<OrganizationId, CompanyId>();
  async read(organization: OrganizationId): Promise<CompanyId | null> { return this.values.get(organization) ?? null; }
  async write(organization: OrganizationId, selectedCompanyId: CompanyId | null): Promise<void> {
    if (selectedCompanyId) this.values.set(organization, selectedCompanyId); else this.values.delete(organization);
  }
}

test("company context selects only companies owned by the active organization", async () => {
  const organization = organizationId("organization-1");
  const first = { id: companyId("company-1"), organizationId: organization, name: "Principal", rif: "J-1", logoUrl: null };
  const second = { id: companyId("company-2"), organizationId: organization, name: "Sucursal", rif: "J-2", logoUrl: null };
  const store = new MemoryCompanySelection();
  const session = new WorkspaceCompanyContextSession({ async listByOrganization() { return [first, second]; } }, store);

  assert.equal((await session.restore(organization)).active?.id, first.id);
  assert.equal((await session.select(second.id)).active?.id, second.id);
  assert.equal(store.values.get(organization), second.id);
});

test("company context rejects a company leaked from a client organization", async () => {
  const organization = organizationId("organization-1");
  const session = new WorkspaceCompanyContextSession({
    async listByOrganization() {
      return [{ id: companyId("client-company"), organizationId: organizationId("client-organization"), name: "Cliente", rif: null, logoUrl: null }];
    },
  }, new MemoryCompanySelection());
  await assert.rejects(() => session.restore(organization), { code: "COMPANY_NOT_FOUND" });
});
