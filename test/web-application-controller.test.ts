import assert from "node:assert/strict";
import test from "node:test";
import {
  WebApplicationController,
  type WebWorkspaceSelection,
} from "../src/modules/workspace/frontend/web-application-controller";
import type { WebWorkspaceSource } from "../src/modules/workspace/frontend/web-workspace-source";
import type { OrganizationWorkspace } from "../src/modules/organizations/contracts";
import { OperationContextCoordinator } from "@kontave/operation-context/application";
import { localDate } from "@kontave/operation-context/domain";
import { currencyCode } from "@kontave/monetary/domain";

const first: OrganizationWorkspace = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "First",
  slug: "first",
  logoUrl: null,
  version: 1,
  role: "owner",
  permissions: ["*"],
  legacyTenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
};
const second: OrganizationWorkspace = {
  ...first,
  id: "22222222-2222-4222-8222-222222222222",
  name: "Second",
  slug: "second",
  role: "cajero",
  legacyTenantId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
};
const initial = {
  tenantId: first.legacyTenantId,
  companyId: "J-FIRST",
  moduleCode: null,
};
const company = (organization: OrganizationWorkspace) => ({
  id: organization.id === first.id ? "J-FIRST" : "J-SECOND",
  ownerId: organization.legacyTenantId,
  name: organization.name,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup(overrides: Partial<WebWorkspaceSource> = {}) {
  const commits: WebWorkspaceSelection[] = [];
  let reachable = true;
  const source: WebWorkspaceSource = {
    directory: async () => ({ organizations: [first, second], tenants: [] }),
    companies: async (organization) => [company(organization)],
    subscriptions: async () => [
      { id: "subscription", status: "active", product: { slug: "inventory" } },
    ],
    ...overrides,
  };
  const controller = new WebApplicationController({
    actorId: first.legacyTenantId,
    source,
    readSelection: () => initial,
    commitSelection: (selection) => {
      commits.push(selection);
    },
    clearSelection: () => {
      commits.length = 0;
    },
    probe: {
      check: async () =>
        reachable
          ? { reachable: true }
          : { reachable: false, reason: "network_unreachable" },
    },
    createOperationContext: () =>
      new OperationContextCoordinator(
        {
          load: async (key) => ({
            key,
            effectiveDate: localDate("2026-09-12"),
            presentationCurrency: currencyCode("VES"),
            exchangeRate: {
              status: "unavailable",
              effectiveDate: localDate("2026-09-12"),
            },
            version: 1,
            updatedAt: "2026-09-12T12:00:00Z",
          }),
          save: async (value) => value,
          clear: async () => undefined,
        },
        {
          historical: async () => {
            throw new Error("unused");
          },
        },
        {
          today: () => localDate("2026-09-12"),
          now: () => "2026-09-12T12:00:00Z",
        },
      ),
  });
  return {
    controller,
    commits,
    setReachable: (value: boolean) => {
      reachable = value;
    },
  };
}

test("startup stays blocked until companies and subscriptions form one committed workspace", async () => {
  const pending = deferred<ReturnType<typeof company>[]>();
  const { controller, commits } = setup({ companies: () => pending.promise });
  const start = controller.start();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(controller.client.getLifecycleSnapshot().status, "starting");
  assert.equal(controller.getSnapshot().status, "loading");
  assert.equal(controller.interaction.getSnapshot().status, "blocked");
  assert.deepEqual(commits, []);
  pending.resolve([company(first)]);
  await start;
  assert.equal(controller.getSnapshot().workspace.activeCompany?.id, "J-FIRST");
  assert.equal(controller.interaction.getSnapshot().status, "available");
});

test("a late older organization cannot overwrite the latest selection or browser persistence", async () => {
  const older = deferred<ReturnType<typeof company>[]>();
  let postpone = false;
  const { controller, commits } = setup({
    companies: async (organization) =>
      postpone && organization.id === second.id
        ? older.promise
        : [company(organization)],
  });
  await controller.start();
  postpone = true;
  const firstSwitch = controller.selectOrganization(second.id);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await controller.selectOrganization(first.id);
  older.resolve([company(second)]);
  await firstSwitch;
  assert.equal(controller.getSnapshot().tenantId, first.legacyTenantId);
  assert.equal(commits.at(-1)?.tenantId, first.legacyTenantId);
  assert.equal(
    commits.some((selection) => selection.tenantId === second.legacyTenantId),
    false,
  );
});

test("failed switch retains previous data behind the gate and retries the selected destination", async () => {
  let fail = true;
  const { controller } = setup({
    companies: async (organization) => {
      if (organization.id === second.id && fail)
        throw new Error("secret backend diagnostic");
      return [company(organization)];
    },
  });
  await controller.start();
  await controller.selectOrganization(second.id);
  assert.equal(controller.getSnapshot().status, "failed");
  assert.equal(controller.getSnapshot().tenantId, first.legacyTenantId);
  const block = controller.interaction.getSnapshot().activeBlock!;
  assert.equal(block.state, "failed");
  assert.doesNotMatch(JSON.stringify(block), /secret/);
  fail = false;
  controller.handleInteractionAction(block.token, "retry");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(controller.getSnapshot().tenantId, second.legacyTenantId);
  assert.equal(controller.getSnapshot().status, "ready");
});

test("empty organizations and empty companies finish without an endless loading state", async () => {
  const empty = setup({
    directory: async () => ({ organizations: [], tenants: [] }),
  });
  await empty.controller.start();
  assert.equal(empty.controller.getSnapshot().status, "ready");
  assert.equal(empty.controller.getSnapshot().tenantId, null);
  assert.equal(empty.controller.interaction.getSnapshot().status, "available");
  const noCompanies = setup({ companies: async () => [] });
  noCompanies.controller.setOperationRequired(true);
  await noCompanies.controller.start();
  assert.equal(
    noCompanies.controller.getSnapshot().workspace.activeCompany,
    null,
  );
  assert.equal(
    noCompanies.controller.interaction.getSnapshot().status,
    "available",
  );
});

test("sign-out discards an in-flight switch and clears remembered user context", async () => {
  const pending = deferred<ReturnType<typeof company>[]>();
  const { controller, commits } = setup({
    companies: async (organization) =>
      organization.id === second.id ? pending.promise : [company(organization)],
  });
  await controller.start();
  const change = controller.selectOrganization(second.id);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await controller.signOut();
  pending.resolve([company(second)]);
  await change;
  assert.equal(controller.getSnapshot().status, "stopped");
  assert.deepEqual(commits, []);
  assert.equal(controller.getSnapshot().organizations.length, 0);
});

test("React's start-cleanup-start sequence restores a usable runtime", async () => {
  const { controller } = setup();
  const firstStart = controller.start();
  const stop = controller.stop();
  const secondStart = controller.start();
  await Promise.all([firstStart, stop, secondStart]);
  assert.equal(controller.getSnapshot().status, "ready");
  assert.equal(controller.client.getLifecycleSnapshot().status, "ready");
});

test("workspace completion does not release an independent connectivity block", async () => {
  const { controller, setReachable } = setup();
  await controller.start();
  setReachable(false);
  await controller.connectivity.refresh();
  await controller.connectivity.refresh();
  await controller.selectOrganization(second.id);
  assert.equal(controller.getSnapshot().status, "ready");
  assert.equal(
    controller.interaction.getSnapshot().activeBlock?.kind,
    "connectivity",
  );
  setReachable(true);
  await controller.connectivity.refresh();
  assert.equal(controller.interaction.getSnapshot().status, "available");
});

test("operational defaults are restored only when demanded and cleared on departure", async () => {
  const { controller } = setup();
  await controller.start();
  assert.equal(
    controller.getSnapshot().operationContext.status,
    "uninitialized",
  );
  controller.setOperationRequired(true);
  assert.equal(
    controller.interaction.getSnapshot().activeBlock?.kind,
    "exclusive_operation",
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(controller.getSnapshot().operationContext.status, "ready");
  controller.setOperationRequired(false);
  assert.equal(
    controller.getSnapshot().operationContext.status,
    "uninitialized",
  );
  assert.equal(controller.interaction.getSnapshot().status, "available");
});
