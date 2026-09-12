import { createKontaveClient } from "@kontave/client-runtime";
import {
  GlobalInteractionGate,
  type InteractionBlockActionKind,
  type InteractionBlockLease,
} from "@kontave/client-interaction";
import {
  ConnectivityMonitor,
  type ConnectivityProbe,
} from "@kontave/client-connectivity/application";
import {
  WorkspaceContextCoordinator,
  type PersistedWorkspaceContext,
  type WorkspaceContextSnapshot,
  type WorkspaceContextStatus,
} from "@kontave/workspace-context-application/coordinator";
import type { ModuleCode } from "@kontave/modules/domain";
import {
  companyId,
  organizationId,
  userId,
} from "@kontave/organizations/domain";
import type {
  OperationContextCoordinator,
  OperationContextState,
  UpdateOperationContextInput,
} from "@kontave/operation-context/application";
import type { Company } from "../../companies/frontend/hooks/use-companies";
import type { OrganizationWorkspace } from "../../organizations/contracts";
import type { TenantEntry } from "../../memberships/frontend/hooks/use-active-tenant";
import {
  webAvailableModules,
  webCompanyEntry,
  webPortfolioEntry,
  type WebSubscription,
  type WebWorkspaceSource,
} from "./web-workspace-source";

export interface WebWorkspaceSelection {
  readonly tenantId: string | null;
  readonly companyId: string | null;
  readonly moduleCode: ModuleCode | null;
}

export interface WebApplicationSnapshot {
  readonly status: "stopped" | "loading" | "ready" | "failed";
  readonly workspace: WorkspaceContextSnapshot;
  readonly organizations: readonly OrganizationWorkspace[];
  readonly tenants: readonly TenantEntry[];
  readonly companies: readonly Company[];
  readonly subscriptions: readonly WebSubscription[];
  readonly tenantId: string | null;
  readonly error: string | null;
  readonly operationContext: OperationContextState;
}

export interface WebApplicationOptions {
  readonly actorId: string;
  readonly source: WebWorkspaceSource;
  /** Reads browser/URL hints; every hint is validated against fresh access data. */
  readonly readSelection: () => WebWorkspaceSelection;
  /** Synchronously commits the winning selection to browser compatibility storage. */
  readonly commitSelection: (selection: WebWorkspaceSelection) => void;
  readonly clearSelection: () => void;
  readonly probe: ConnectivityProbe;
  readonly createOperationContext: (
    organization: OrganizationWorkspace,
    company: Company,
    signal: AbortSignal,
  ) => OperationContextCoordinator;
}

const EMPTY_WORKSPACE: WorkspaceContextSnapshot = Object.freeze({
  portfolio: [],
  activeWorkspace: null,
  companies: [],
  activeCompany: null,
  modules: [],
  activeModule: null,
});
const EMPTY_OPERATION: OperationContextState = Object.freeze({
  status: "uninitialized",
});

/** Web composition of the portable lifecycle, workspace, operation and interaction capabilities.
 * Candidate contexts remain private until all selected sources and persistence succeed.
 */
export class WebApplicationController {
  readonly interaction = new GlobalInteractionGate();
  readonly connectivity: ConnectivityMonitor;
  readonly client;
  private readonly listeners = new Set<() => void>();
  private snapshot: WebApplicationSnapshot = Object.freeze({
    status: "stopped",
    workspace: EMPTY_WORKSPACE,
    organizations: [],
    tenants: [],
    companies: [],
    subscriptions: [],
    tenantId: null,
    error: null,
    operationContext: EMPTY_OPERATION,
  });
  private coordinator: WorkspaceContextCoordinator | null = null;
  private pending: AbortController | null = null;
  private revision = 0;
  private stopped = true;
  private workspaceLease: InteractionBlockLease | null;
  private connectivityLease: InteractionBlockLease | null = null;
  private operationLease: InteractionBlockLease | null = null;
  private operation: OperationContextCoordinator | null = null;
  private operationRequest: AbortController | null = null;
  private operationUnsubscribe: (() => void) | null = null;
  private operationRequired = false;
  private operationKey: string | null = null;
  private retrySelection: WebWorkspaceSelection | null = null;
  private lifecycleQueue: Promise<void> = Promise.resolve();
  private lifecycleRevision = 0;

  /** Composes one browser-session runtime without starting network activity.
   * @param options - Explicit Web persistence, transport and operational adapters.
   * @returns A controller whose start/stop lifecycle owns its resources.
   */
  constructor(private readonly options: WebApplicationOptions) {
    this.workspaceLease = this.interaction.acquire({
      kind: "startup",
      state: "working",
      priority: 650,
      message: "Restaurando tu espacio de trabajo",
      description: "Estamos obteniendo el contexto de tu cuenta.",
    });
    this.connectivity = new ConnectivityMonitor({
      probe: options.probe,
      failureThreshold: 2,
    });
    this.connectivity.subscribe(() => this.synchronizeConnectivity());
    this.client = createKontaveClient({
      features: {
        workspace: {
          getSnapshot: this.getSnapshot,
          subscribe: (listener: (snapshot: WebApplicationSnapshot) => void) => {
            listener(this.snapshot);
            return this.subscribe(() => listener(this.snapshot));
          },
        },
        operationContext: {
          getSnapshot: () => this.snapshot.operationContext,
          subscribe: (listener: (state: OperationContextState) => void) => {
            listener(this.snapshot.operationContext);
            return this.subscribe(() =>
              listener(this.snapshot.operationContext),
            );
          },
        },
        connectivity: {
          getSnapshot: this.connectivity.getSnapshot,
          subscribe: (
            listener: (
              state: ReturnType<ConnectivityMonitor["getSnapshot"]>,
            ) => void,
          ) => {
            listener(this.connectivity.getSnapshot());
            return this.connectivity.subscribe(() =>
              listener(this.connectivity.getSnapshot()),
            );
          },
        },
      },
      modules: [
        {
          start: async () => {
            this.stopped = false;
            await this.load(this.options.readSelection());
          },
          stop: () => this.shutdown(),
        },
      ],
    });
  }

  /** Reads a stable immutable aggregate; reading never performs I/O. @returns The last committed state. */
  getSnapshot = (): WebApplicationSnapshot => this.snapshot;

  /** Observes aggregate changes. @param listener - Notification callback. @returns Idempotent unsubscribe function. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Starts the portable lifecycle and restores browser selection. @returns Completion after restoration settles. */
  async start(): Promise<void> {
    const revision = ++this.lifecycleRevision;
    const start = this.lifecycleQueue.then(async () => {
      if (revision === this.lifecycleRevision) await this.client.start();
    });
    this.lifecycleQueue = start.catch(() => undefined);
    try {
      await start;
    } catch {
      if (!this.stopped) this.failWorkspace();
    }
  }

  /** Invalidates in-flight work synchronously, then stops the portable lifecycle.
   * @returns Completion after resources are released; durable selection remains for reload.
   */
  async stop(): Promise<void> {
    this.lifecycleRevision += 1;
    this.shutdown();
    const stop = this.lifecycleQueue.then(() => this.client.stop());
    this.lifecycleQueue = stop.catch(() => undefined);
    await stop;
  }

  /** Clears remembered state on sign-out, without deleting business data. @returns Completion after shutdown. */
  async signOut(): Promise<void> {
    this.options.clearSelection();
    await this.stop();
  }

  /** Selects an organization through a fresh authorized portfolio.
   * @param id - Organization UUID from the current directory.
   * @returns Completion after the latest transition settles; expected failures appear in snapshot.
   */
  async selectOrganization(id: string): Promise<void> {
    const organization = this.snapshot.organizations.find(
      (entry) => entry.id === id,
    );
    if (!organization || this.stopped) return;
    await this.load(
      {
        tenantId: organization.legacyTenantId,
        companyId: null,
        moduleCode: null,
      },
      id,
    );
  }

  /** Resolves a legacy tenant selection through the organization directory.
   * @param tenantId - Legacy tenant represented by an accessible organization.
   * @returns Completion after the corresponding organization transition.
   */
  async selectTenant(tenantId: string): Promise<void> {
    const organization = this.snapshot.organizations.find(
      (entry) => entry.legacyTenantId === tenantId,
    );
    if (organization) await this.selectOrganization(organization.id);
  }

  /** Applies URL context after browser navigation without trusting unverified identifiers.
   * @param selection - Tenant/company/module hints from the URL.
   * @returns Completion after the requested context is validated and committed.
   */
  async navigate(selection: WebWorkspaceSelection): Promise<void> {
    if (!this.stopped) await this.load(selection);
  }

  /** Reloads authorization and dependent data while retaining only accessible selections.
   * @returns Completion after refresh; a failed refresh remains globally blocked.
   */
  async refresh(): Promise<void> {
    if (!this.stopped) await this.load(this.currentSelection());
  }

  /** Selects a company already validated by the active workspace coordinator.
   * @param id - Operational company identifier within the active organization.
   * @returns Completion after selection persistence and operational context restoration.
   */
  async selectCompany(id: string): Promise<void> {
    if (this.snapshot.status !== "ready" || !this.coordinator) return;
    if (this.snapshot.workspace.activeCompany?.id === id) return;
    const revision = ++this.revision;
    this.blockWorkspace("Cambiando de empresa");
    this.clearOperation();
    const state = await this.coordinator.selectCompany(companyId(id));
    if (revision !== this.revision || this.stopped) return;
    this.commitSelectionState(state);
  }

  /** Remembers a module only when it is available in the committed context.
   * @param code - Module identifier from available navigation.
   * @returns Completion after the coordinator confirms the selection.
   */
  async selectModule(code: ModuleCode): Promise<void> {
    if (
      this.snapshot.status !== "ready" ||
      !this.coordinator ||
      this.snapshot.workspace.activeModule?.code === code
    )
      return;
    const revision = this.revision;
    const state = await this.coordinator.selectModule(code);
    if (revision === this.revision && !this.stopped)
      this.commitSelectionState(state);
  }

  /** Registers whether the current route needs company operational defaults.
   * @param required - True for routes consuming the shared date/currency/rate context.
   * @returns Nothing; initialization and interaction leases follow asynchronously.
   */
  setOperationRequired(required: boolean): void {
    this.operationRequired = required;
    if (required) this.restoreOperation();
    else this.clearOperation();
  }

  /** Applies versioned operational-default changes under the operation gate.
   * @param input - Date, currency or an explicitly justified manual rate.
   * @returns Completion; expected failures remain available for retry.
   */
  async updateOperationContext(
    input: UpdateOperationContextInput,
  ): Promise<void> {
    if (!this.operation || this.snapshot.status !== "ready") return;
    try {
      await this.operation.update(input);
    } catch {
      /* The coordinator publishes a typed recoverable state. */
    }
  }

  /** Dispatches actions only for the currently presented interaction token.
   * @param token - Token of the visible block.
   * @param action - Semantic action selected by the user.
   * @returns Nothing; obsolete tokens cannot retry another operation.
   */
  handleInteractionAction(
    token: string,
    action: InteractionBlockActionKind,
  ): void {
    const block = this.interaction.getSnapshot().activeBlock;
    if (!block || block.token !== token || action !== "retry") return;
    if (token === this.connectivityLease?.token) {
      void this.connectivity.refresh();
      return;
    }
    if (token === this.operationLease?.token) {
      this.clearOperation();
      this.restoreOperation();
      return;
    }
    if (this.client.getLifecycleSnapshot().status === "failed") {
      void this.start();
      return;
    }
    void this.load(this.retrySelection ?? this.currentSelection());
  }

  private async load(
    preferred: WebWorkspaceSelection,
    requestedOrganization?: string,
  ): Promise<void> {
    const revision = ++this.revision;
    this.pending?.abort();
    const pending = new AbortController();
    this.pending = pending;
    this.retrySelection = preferred;
    this.clearOperation();
    this.blockWorkspace(
      this.snapshot.workspace.activeWorkspace
        ? "Cambiando tu espacio de trabajo"
        : "Restaurando tu espacio de trabajo",
    );
    try {
      const directory = await this.options.source.directory(pending.signal);
      let companies: readonly Company[] = [];
      let subscriptions: readonly WebSubscription[] = [];
      const selectedOrganization = directory.organizations.find(
        (entry) => entry.legacyTenantId === preferred.tenantId,
      );
      if (
        requestedOrganization &&
        !directory.organizations.some(
          (entry) => entry.id === requestedOrganization,
        )
      )
        throw new Error("WORKSPACE_NOT_AVAILABLE");
      let selection: PersistedWorkspaceContext = {
        organizationId: selectedOrganization
          ? organizationId(selectedOrganization.id)
          : null,
        companyId:
          (!preferred.tenantId || selectedOrganization) && preferred.companyId
            ? companyId(preferred.companyId)
            : null,
        moduleCode:
          !preferred.tenantId || selectedOrganization
            ? preferred.moduleCode
            : null,
      };
      const coordinator = new WorkspaceContextCoordinator(
        {
          list: async () =>
            directory.organizations.map((entry) =>
              webPortfolioEntry(entry, this.options.actorId),
            ),
        },
        {
          listByOrganization: async (id) => {
            const organization = directory.organizations.find(
              (entry) => entry.id === id,
            )!;
            companies = await this.options.source.companies(
              organization,
              pending.signal,
            );
            return companies.map((entry) => webCompanyEntry(entry, id));
          },
        },
        {
          listAvailable: async (id) => {
            const organization = directory.organizations.find(
              (entry) => entry.id === id,
            )!;
            subscriptions = await this.options.source.subscriptions(
              organization,
              pending.signal,
            );
            return webAvailableModules(organization, subscriptions);
          },
        },
        {
          read: async () => selection,
          write: async (candidate) => {
            selection = candidate;
          },
        },
      );
      const state = await coordinator.restore();
      if (pending.signal.aborted || revision !== this.revision || this.stopped)
        return;
      if (state.status !== "ready")
        throw new Error("WORKSPACE_RESTORATION_FAILED");
      const organization = directory.organizations.find(
        (entry) => entry.id === state.snapshot.activeWorkspace?.organizationId,
      );
      this.options.commitSelection({
        tenantId: organization?.legacyTenantId ?? null,
        companyId: state.snapshot.activeCompany?.id ?? null,
        moduleCode: state.snapshot.activeModule?.code ?? null,
      });
      this.coordinator = coordinator;
      this.publish({
        ...this.snapshot,
        status: "ready",
        error: null,
        workspace: state.snapshot,
        organizations: directory.organizations,
        tenants: directory.tenants,
        companies,
        subscriptions,
        tenantId: organization?.legacyTenantId ?? null,
      });
      this.retrySelection = null;
      this.restoreOperation();
      this.workspaceLease?.release();
      this.workspaceLease = null;
    } catch {
      if (
        !pending.signal.aborted &&
        revision === this.revision &&
        !this.stopped
      )
        this.failWorkspace();
    }
  }

  private commitSelectionState(state: WorkspaceContextStatus): void {
    if (state.status !== "ready") {
      this.failWorkspace();
      return;
    }
    try {
      this.options.commitSelection({
        tenantId: this.snapshot.tenantId,
        companyId: state.snapshot.activeCompany?.id ?? null,
        moduleCode: state.snapshot.activeModule?.code ?? null,
      });
      this.publish({
        ...this.snapshot,
        status: "ready",
        error: null,
        workspace: state.snapshot,
      });
      this.restoreOperation();
      this.workspaceLease?.release();
      this.workspaceLease = null;
    } catch {
      this.failWorkspace();
    }
  }

  private currentSelection(): WebWorkspaceSelection {
    return {
      tenantId: this.snapshot.tenantId,
      companyId: this.snapshot.workspace.activeCompany?.id ?? null,
      moduleCode: this.snapshot.workspace.activeModule?.code ?? null,
    };
  }

  private blockWorkspace(message: string): void {
    const input = {
      state: "working" as const,
      message,
      description: "Estamos obteniendo el contexto de tu cuenta.",
      actions: [],
    };
    if (this.workspaceLease) this.workspaceLease.update(input);
    else
      this.workspaceLease = this.interaction.acquire({
        kind: "startup",
        priority: 650,
        ...input,
      });
    this.publish({ ...this.snapshot, status: "loading", error: null });
  }

  private failWorkspace(): void {
    const error =
      "No pudimos cargar tu espacio de trabajo. Vuelve a intentarlo.";
    if (!this.workspaceLease)
      this.blockWorkspace("Restaurando tu espacio de trabajo");
    this.workspaceLease!.update({
      state: "failed",
      message: "No pudimos cargar tu espacio de trabajo",
      description: "Revisa tu conexión o vuelve a intentarlo.",
      actions: [{ kind: "retry", label: "Reintentar" }],
    });
    this.publish({ ...this.snapshot, status: "failed", error });
  }

  private restoreOperation(): void {
    if (
      !this.operationRequired ||
      this.snapshot.status !== "ready" ||
      this.stopped
    )
      return;
    const organization = this.snapshot.organizations.find(
      (entry) =>
        entry.id === this.snapshot.workspace.activeWorkspace?.organizationId,
    );
    const company = this.snapshot.companies.find(
      (entry) => entry.id === this.snapshot.workspace.activeCompany?.id,
    );
    if (!organization || !company) return;
    const key = `${organization.id}:${company.id}`;
    if (this.operationKey === key) return;
    this.clearOperation();
    this.operationKey = key;
    const request = new AbortController();
    this.operationRequest = request;
    this.operation = this.options.createOperationContext(
      organization,
      company,
      request.signal,
    );
    this.operationUnsubscribe = this.operation.subscribe((state) => {
      if (this.stopped || request.signal.aborted) return;
      if (
        state.status === "loading" ||
        state.status === "changing" ||
        state.status === "failed"
      ) {
        const input = {
          state:
            state.status === "failed"
              ? ("failed" as const)
              : ("working" as const),
          message:
            state.status === "failed"
              ? "No pudimos cargar el contexto operativo"
              : "Preparando el contexto operativo",
          description:
            "Estamos actualizando la fecha, moneda y tasa de cambio.",
          actions:
            state.status === "failed"
              ? [{ kind: "retry" as const, label: "Reintentar" }]
              : [],
        };
        if (this.operationLease) this.operationLease.update(input);
        else
          this.operationLease = this.interaction.acquire({
            kind: "exclusive_operation",
            priority: 600,
            ...input,
          });
      } else {
        this.operationLease?.release();
        this.operationLease = null;
      }
      this.publish({ ...this.snapshot, operationContext: state });
    });
    void this.operation.initialize({
      userId: userId(this.options.actorId),
      organizationId: organizationId(organization.id),
      companyId: companyId(company.id),
    });
  }

  private clearOperation(): void {
    this.operationRequest?.abort();
    this.operationRequest = null;
    this.operationUnsubscribe?.();
    this.operationUnsubscribe = null;
    this.operation?.clear();
    this.operation = null;
    this.operationKey = null;
    this.operationLease?.release();
    this.operationLease = null;
    if (this.snapshot.operationContext !== EMPTY_OPERATION)
      this.publish({ ...this.snapshot, operationContext: EMPTY_OPERATION });
  }

  private synchronizeConnectivity(): void {
    if (this.stopped) return;
    const connectivity = this.connectivity.getSnapshot();
    if (connectivity.availability === "unavailable") {
      this.connectivityLease ??= this.interaction.acquire({
        kind: "connectivity",
        state: "waiting",
        priority: 800,
        message: "Sin conexión",
        description: "Intentando reconectar automáticamente.",
        actions: [{ kind: "retry", label: "Reintentar" }],
      });
    } else if (connectivity.availability === "available") {
      this.connectivityLease?.release();
      this.connectivityLease = null;
    }
  }

  private shutdown(): void {
    this.stopped = true;
    this.revision += 1;
    this.pending?.abort();
    this.pending = null;
    this.clearOperation();
    this.coordinator = null;
    this.connectivityLease?.release();
    this.connectivityLease = null;
    this.workspaceLease?.release();
    this.workspaceLease = null;
    this.publish({
      status: "stopped",
      workspace: EMPTY_WORKSPACE,
      organizations: [],
      tenants: [],
      companies: [],
      subscriptions: [],
      tenantId: null,
      error: null,
      operationContext: EMPTY_OPERATION,
    });
  }

  private publish(snapshot: WebApplicationSnapshot): void {
    this.snapshot = Object.freeze(snapshot);
    for (const listener of this.listeners) listener();
  }
}
