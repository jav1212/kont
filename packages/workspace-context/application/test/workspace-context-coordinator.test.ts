import assert from "node:assert/strict";
import test from "node:test";
import { OrganizationAccessPathKind } from "@kontave/organization-delegations-domain";
import { ModuleCode, moduleId } from "@kontave/modules-domain";
import {
  OrganizationRelationship,
  companyId,
  organizationId,
  userId,
  type OrganizationCompany,
  type OrganizationId,
} from "@kontave/organizations-domain";
import {
  WorkspaceContextCoordinator,
  WorkspaceContextFailure,
  type PersistedWorkspaceContext,
  type WorkspaceContextStore,
} from "@kontave/workspace-context-application/coordinator";
import type { WorkspacePortfolioEntry } from "../src/index.js";

const actor = userId("actor");

function workspace(id: string, relationship: "personal" | "member" | "delegated"): WorkspacePortfolioEntry {
  const organization = organizationId(id);
  return {
    organizationId: organization,
    name: id,
    avatarUrl: null,
    relationship,
    accessPath: {
      kind: relationship === OrganizationRelationship.Delegated
        ? OrganizationAccessPathKind.DelegatedOrganization
        : OrganizationAccessPathKind.DirectMembership,
      actorUserId: actor,
      actingOrganizationId: organization,
      targetOrganizationId: organization,
      delegationId: null,
      scopes: [],
    },
  };
}

function company(id: string, organization: OrganizationId): OrganizationCompany {
  return { id: companyId(id), organizationId: organization, name: id, rif: null, logoUrl: null };
}

const availableModules = [
  { id: moduleId("payroll-id"), code: ModuleCode.Payroll, name: "Nómina" },
  { id: moduleId("inventory-id"), code: ModuleCode.Inventory, name: "Inventario" },
];

class MemoryStore implements WorkspaceContextStore {
  writes: PersistedWorkspaceContext[] = [];
  constructor(public value: PersistedWorkspaceContext = { organizationId: null, companyId: null, moduleCode: null }) {}
  async read(): Promise<PersistedWorkspaceContext> { return this.value; }
  async write(value: PersistedWorkspaceContext): Promise<void> { this.value = value; this.writes.push(value); }
}

function coordinator(input: {
  portfolio: readonly WorkspacePortfolioEntry[];
  store?: MemoryStore;
  companies?: (organization: OrganizationId) => readonly OrganizationCompany[] | Promise<readonly OrganizationCompany[]>;
}) {
  const store = input.store ?? new MemoryStore();
  const session = new WorkspaceContextCoordinator(
    { async list() { return input.portfolio; } },
    { async listByOrganization(organization) { return input.companies?.(organization) ?? [company(`${organization}-company`, organization)]; } },
    { async listAvailable() { return availableModules; } },
    store,
  );
  return { session, store };
}

test("restore invalidates inaccessible selections and commits one coherent fallback", async () => {
  const personal = workspace("personal", OrganizationRelationship.Personal);
  const store = new MemoryStore({
    organizationId: organizationId("removed"),
    companyId: companyId("removed-company"),
    moduleCode: ModuleCode.Accounting,
  });
  const { session } = coordinator({ portfolio: [workspace("a-member", OrganizationRelationship.Member), personal], store });

  const state = await session.restore();

  assert.equal(state.status, "ready");
  assert.equal(state.snapshot.activeWorkspace?.organizationId, personal.organizationId);
  assert.equal(state.snapshot.activeCompany?.organizationId, personal.organizationId);
  assert.equal(state.snapshot.activeModule?.code, ModuleCode.Payroll);
  assert.deepEqual(store.writes, [{
    organizationId: personal.organizationId,
    companyId: companyId("personal-company"),
    moduleCode: ModuleCode.Payroll,
  }]);
});

test("refresh preserves accessible selections and invalidates removed dependants", async () => {
  const personal = workspace("personal", OrganizationRelationship.Personal);
  let companies = [company("first", personal.organizationId), company("second", personal.organizationId)];
  const { session } = coordinator({ portfolio: [personal], companies: () => companies });
  await session.restore();
  await session.selectCompany(companyId("second"));
  await session.selectModule(ModuleCode.Inventory);
  companies = [company("replacement", personal.organizationId)];

  const state = await session.refresh();

  assert.equal(state.snapshot.activeWorkspace?.organizationId, personal.organizationId);
  assert.equal(state.snapshot.activeCompany?.id, companyId("replacement"));
  assert.equal(state.snapshot.activeModule?.code, ModuleCode.Inventory);
});

test("a workspace switch is not visible when persistence fails", async () => {
  const first = workspace("first", OrganizationRelationship.Personal);
  const second = workspace("second", OrganizationRelationship.Member);
  const store = new MemoryStore();
  const { session } = coordinator({ portfolio: [first, second], store });
  await session.restore();
  store.write = async () => { throw new Error("disk unavailable"); };

  const state = await session.selectWorkspace(second.organizationId);

  assert.equal(state.status, "failed");
  assert.equal(state.snapshot.activeWorkspace?.organizationId, first.organizationId);
  assert.equal(state.error.code, "PERSISTENCE_UNAVAILABLE");
});

test("the latest overlapping operation wins", async () => {
  const first = workspace("first", OrganizationRelationship.Personal);
  const second = workspace("second", OrganizationRelationship.Member);
  let releaseFirst: (() => void) | undefined;
  const firstCompanies = new Promise<readonly OrganizationCompany[]>((resolve) => {
    releaseFirst = () => resolve([company("first-company", first.organizationId)]);
  });
  const { session } = coordinator({
    portfolio: [first, second],
    companies: (organization) => organization === first.organizationId
      ? firstCompanies
      : [company("second-company", second.organizationId)],
  });

  const slow = session.selectWorkspace(first.organizationId);
  const fast = session.selectWorkspace(second.organizationId);
  assert.equal((await fast).snapshot.activeWorkspace?.organizationId, second.organizationId);
  releaseFirst?.();
  await slow;
  assert.equal(session.current.snapshot.activeWorkspace?.organizationId, second.organizationId);
});

test("a slow older persistence write cannot overwrite the latest selection", async () => {
  const first = workspace("first", OrganizationRelationship.Personal);
  const second = workspace("second", OrganizationRelationship.Member);
  let release: (() => void) | undefined;
  let blockNextWrite = false;
  const store = new MemoryStore();
  store.write = async (value) => {
    if (blockNextWrite) {
      blockNextWrite = false;
      await new Promise<void>((resolve) => { release = resolve; });
    }
    store.value = value;
    store.writes.push(value);
  };
  const { session } = coordinator({ portfolio: [first, second], store });
  await session.restore();
  blockNextWrite = true;

  const older = session.selectWorkspace(second.organizationId);
  await new Promise<void>((resolve) => setImmediate(resolve));
  const latest = session.selectWorkspace(first.organizationId);
  release?.();
  await Promise.all([older, latest]);

  assert.equal(session.current.snapshot.activeWorkspace?.organizationId, first.organizationId);
  assert.equal(store.value.organizationId, first.organizationId);
});

test("clear supersedes an in-flight refresh", async () => {
  const personal = workspace("personal", OrganizationRelationship.Personal);
  let release: (() => void) | undefined;
  let delayed = false;
  const { session } = coordinator({
    portfolio: [personal],
    companies: (organization) => delayed
      ? new Promise((resolve) => { release = () => resolve([company("late", organization)]); })
      : [company("initial", organization)],
  });
  await session.restore();
  delayed = true;
  const refresh = session.refresh();
  await session.clear();
  release?.();
  await refresh;
  assert.equal(session.current.status, "idle");
  assert.equal(session.current.snapshot.activeWorkspace, null);
});

test("source and ownership failures are portable and retain the prior snapshot", async () => {
  const personal = workspace("personal", OrganizationRelationship.Personal);
  const { session } = coordinator({
    portfolio: [personal],
    companies: () => [company("leaked", organizationId("another"))],
  });

  const state = await session.restore();

  assert.equal(state.status, "failed");
  assert.equal(state.error.code, "INVALID_COMPANY_OWNERSHIP");
  assert.equal(state.snapshot.activeWorkspace, null);
  assert.ok(state.error instanceof WorkspaceContextFailure);
});

test("subscribers receive portable transitions and can unsubscribe", async () => {
  const personal = workspace("personal", OrganizationRelationship.Personal);
  const { session } = coordinator({ portfolio: [personal] });
  const statuses: string[] = [];
  const unsubscribe = session.subscribe((state) => statuses.push(state.status));
  await session.restore();
  unsubscribe();
  await session.refresh();
  assert.deepEqual(statuses, ["idle", "loading", "ready"]);
});
