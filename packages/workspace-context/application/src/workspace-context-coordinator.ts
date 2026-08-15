import type { AvailableOrganizationModule } from "@kontave/modules-application";
import type { ModuleCode } from "@kontave/modules-domain";
import type {
  CompanyId,
  OrganizationCompany,
  OrganizationId,
} from "@kontave/organizations-domain";
import { OrganizationRelationship } from "@kontave/organizations-domain";
import type {
  WorkspaceCompanySource,
  WorkspaceModuleSource,
  WorkspacePortfolioEntry,
  WorkspacePortfolioSource,
} from "./index.js";

export interface PersistedWorkspaceContext {
  readonly organizationId: OrganizationId | null;
  readonly companyId: CompanyId | null;
  readonly moduleCode: ModuleCode | null;
}

/** A single persistence boundary lets adapters commit a workspace switch atomically. */
export interface WorkspaceContextStore {
  read(): Promise<PersistedWorkspaceContext>;
  write(context: PersistedWorkspaceContext): Promise<void>;
}

export interface WorkspaceContextSnapshot {
  readonly portfolio: readonly WorkspacePortfolioEntry[];
  readonly activeWorkspace: WorkspacePortfolioEntry | null;
  readonly companies: readonly OrganizationCompany[];
  readonly activeCompany: OrganizationCompany | null;
  readonly modules: readonly AvailableOrganizationModule[];
  readonly activeModule: AvailableOrganizationModule | null;
}

export type WorkspaceContextStatus =
  | { readonly status: "idle"; readonly snapshot: WorkspaceContextSnapshot }
  | { readonly status: "loading"; readonly snapshot: WorkspaceContextSnapshot }
  | { readonly status: "refreshing"; readonly snapshot: WorkspaceContextSnapshot }
  | { readonly status: "ready"; readonly snapshot: WorkspaceContextSnapshot }
  | { readonly status: "failed"; readonly snapshot: WorkspaceContextSnapshot; readonly error: WorkspaceContextFailure };

export type WorkspaceContextFailureCode =
  | "WORKSPACE_NOT_AVAILABLE"
  | "COMPANY_NOT_AVAILABLE"
  | "MODULE_NOT_AVAILABLE"
  | "INVALID_COMPANY_OWNERSHIP"
  | "SOURCE_UNAVAILABLE"
  | "PERSISTENCE_UNAVAILABLE";

export class WorkspaceContextFailure extends Error {
  constructor(
    readonly code: WorkspaceContextFailureCode,
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "WorkspaceContextFailure";
  }
}

export type WorkspaceContextSubscriber = (state: WorkspaceContextStatus) => void;

const EMPTY_SNAPSHOT: WorkspaceContextSnapshot = freezeSnapshot({
  portfolio: [],
  activeWorkspace: null,
  companies: [],
  activeCompany: null,
  modules: [],
  activeModule: null,
});

/**
 * Coordinates the complete portable workspace context. Candidate data and its
 * persisted selection are committed before observers see the new snapshot.
 */
export class WorkspaceContextCoordinator {
  private state: WorkspaceContextStatus = Object.freeze({ status: "idle", snapshot: EMPTY_SNAPSHOT });
  private operation = 0;
  private persistenceQueue: Promise<void> = Promise.resolve();
  private readonly subscribers = new Set<WorkspaceContextSubscriber>();

  constructor(
    private readonly portfolios: WorkspacePortfolioSource,
    private readonly companies: WorkspaceCompanySource,
    private readonly modules: WorkspaceModuleSource,
    private readonly store: WorkspaceContextStore,
  ) {}

  get current(): WorkspaceContextStatus { return this.state; }

  subscribe(subscriber: WorkspaceContextSubscriber): () => void {
    this.subscribers.add(subscriber);
    subscriber(this.state);
    return () => { this.subscribers.delete(subscriber); };
  }

  async restore(): Promise<WorkspaceContextStatus> {
    const operation = this.begin("loading");
    try {
      const persisted = await this.readPersisted();
      return await this.loadAndCommit(operation, persisted);
    } catch (cause: unknown) {
      return this.fail(operation, normalizeFailure(cause));
    }
  }

  async refresh(): Promise<WorkspaceContextStatus> {
    const operation = this.begin("refreshing");
    const snapshot = this.state.snapshot;
    const preferred: PersistedWorkspaceContext = {
      organizationId: snapshot.activeWorkspace?.organizationId ?? null,
      companyId: snapshot.activeCompany?.id ?? null,
      moduleCode: snapshot.activeModule?.code ?? null,
    };
    try {
      return await this.loadAndCommit(operation, preferred);
    } catch (cause: unknown) {
      return this.fail(operation, normalizeFailure(cause));
    }
  }

  async selectWorkspace(organizationId: OrganizationId): Promise<WorkspaceContextStatus> {
    const operation = this.begin("loading");
    try {
      const portfolio = await this.listPortfolio();
      if (!portfolio.some((entry) => entry.organizationId === organizationId)) {
        throw new WorkspaceContextFailure("WORKSPACE_NOT_AVAILABLE", "El espacio de trabajo no está disponible.");
      }
      return await this.loadAndCommit(operation, { organizationId, companyId: null, moduleCode: null }, portfolio);
    } catch (cause: unknown) {
      return this.fail(operation, normalizeFailure(cause));
    }
  }

  async selectCompany(companyId: CompanyId): Promise<WorkspaceContextStatus> {
    const snapshot = this.state.snapshot;
    const company = snapshot.companies.find((item) => item.id === companyId);
    if (!company) {
      return this.fail(++this.operation, new WorkspaceContextFailure("COMPANY_NOT_AVAILABLE", "La empresa no está disponible."));
    }
    return this.commitSelection({ ...snapshot, activeCompany: company });
  }

  async selectModule(moduleCode: ModuleCode): Promise<WorkspaceContextStatus> {
    const snapshot = this.state.snapshot;
    const module = snapshot.modules.find((item) => item.code === moduleCode);
    if (!module) {
      return this.fail(++this.operation, new WorkspaceContextFailure("MODULE_NOT_AVAILABLE", "El módulo no está disponible."));
    }
    return this.commitSelection({ ...snapshot, activeModule: module });
  }

  async clear(): Promise<WorkspaceContextStatus> {
    const operation = ++this.operation;
    try {
      if (!await this.persist(operation, EMPTY_SNAPSHOT)) return this.state;
      return this.publish({ status: "idle", snapshot: EMPTY_SNAPSHOT });
    } catch (cause: unknown) {
      return this.fail(operation, normalizePersistenceFailure(cause));
    }
  }

  private begin(status: "loading" | "refreshing"): number {
    const operation = ++this.operation;
    this.publish({ status, snapshot: this.state.snapshot });
    return operation;
  }

  private async loadAndCommit(
    operation: number,
    preferred: PersistedWorkspaceContext,
    suppliedPortfolio?: readonly WorkspacePortfolioEntry[],
  ): Promise<WorkspaceContextStatus> {
    const portfolio = suppliedPortfolio ?? await this.listPortfolio();
    const activeWorkspace = selectWorkspace(portfolio, preferred.organizationId);
    const [companies, modules] = activeWorkspace
      ? await Promise.all([
          this.listCompanies(activeWorkspace.organizationId),
          this.listModules(activeWorkspace.organizationId),
        ])
      : [[], []] as const;
    validateCompanies(activeWorkspace?.organizationId ?? null, companies);
    const snapshot = freezeSnapshot({
      portfolio,
      activeWorkspace,
      companies,
      activeCompany: companies.find((item) => item.id === preferred.companyId) ?? companies[0] ?? null,
      modules,
      activeModule: modules.find((item) => item.code === preferred.moduleCode) ?? modules[0] ?? null,
    });
    if (operation !== this.operation) return this.state;
    if (!await this.persist(operation, snapshot)) return this.state;
    return this.publish({ status: "ready", snapshot });
  }

  private async commitSelection(candidate: WorkspaceContextSnapshot): Promise<WorkspaceContextStatus> {
    const operation = ++this.operation;
    const snapshot = freezeSnapshot(candidate);
    try {
      if (!await this.persist(operation, snapshot)) return this.state;
      return this.publish({ status: "ready", snapshot });
    } catch (cause: unknown) {
      return this.fail(operation, normalizePersistenceFailure(cause));
    }
  }

  private async readPersisted(): Promise<PersistedWorkspaceContext> {
    try { return await this.store.read(); }
    catch (cause: unknown) { throw normalizePersistenceFailure(cause); }
  }

  private async writePersisted(snapshot: WorkspaceContextSnapshot): Promise<void> {
    try {
      await this.store.write({
        organizationId: snapshot.activeWorkspace?.organizationId ?? null,
        companyId: snapshot.activeCompany?.id ?? null,
        moduleCode: snapshot.activeModule?.code ?? null,
      });
    } catch (cause: unknown) { throw normalizePersistenceFailure(cause); }
  }

  /** Serializing writes guarantees that an older operation cannot finish last. */
  private persist(operation: number, snapshot: WorkspaceContextSnapshot): Promise<boolean> {
    const write = this.persistenceQueue.then(async () => {
      if (operation !== this.operation) return false;
      await this.writePersisted(snapshot);
      return operation === this.operation;
    });
    this.persistenceQueue = write.then(() => undefined, () => undefined);
    return write;
  }

  private async listPortfolio(): Promise<readonly WorkspacePortfolioEntry[]> {
    try { return Object.freeze([...(await this.portfolios.list())]); }
    catch (cause: unknown) { throw normalizeSourceFailure(cause); }
  }

  private async listCompanies(organizationId: OrganizationId): Promise<readonly OrganizationCompany[]> {
    try { return Object.freeze([...(await this.companies.listByOrganization(organizationId))]); }
    catch (cause: unknown) { throw normalizeSourceFailure(cause); }
  }

  private async listModules(organizationId: OrganizationId): Promise<readonly AvailableOrganizationModule[]> {
    try { return Object.freeze([...(await this.modules.listAvailable(organizationId))]); }
    catch (cause: unknown) { throw normalizeSourceFailure(cause); }
  }

  private fail(operation: number, error: WorkspaceContextFailure): WorkspaceContextStatus {
    if (operation !== this.operation) return this.state;
    return this.publish({ status: "failed", snapshot: this.state.snapshot, error });
  }

  private publish(state: WorkspaceContextStatus): WorkspaceContextStatus {
    this.state = Object.freeze(state);
    for (const subscriber of this.subscribers) subscriber(this.state);
    return this.state;
  }
}

function selectWorkspace(
  portfolio: readonly WorkspacePortfolioEntry[],
  preferred: OrganizationId | null,
): WorkspacePortfolioEntry | null {
  return (preferred ? portfolio.find((entry) => entry.organizationId === preferred) : undefined)
    ?? portfolio.find((entry) => entry.relationship === OrganizationRelationship.Personal)
    ?? portfolio.find((entry) => entry.relationship === OrganizationRelationship.Member)
    ?? portfolio.find((entry) => entry.relationship === OrganizationRelationship.Delegated)
    ?? null;
}

function validateCompanies(organizationId: OrganizationId | null, companies: readonly OrganizationCompany[]): void {
  if (organizationId && companies.some((company) => company.organizationId !== organizationId)) {
    throw new WorkspaceContextFailure("INVALID_COMPANY_OWNERSHIP", "Una empresa no pertenece a la organización activa.");
  }
}

function freezeSnapshot(snapshot: WorkspaceContextSnapshot): WorkspaceContextSnapshot {
  return Object.freeze({
    ...snapshot,
    portfolio: Object.freeze([...snapshot.portfolio]),
    companies: Object.freeze([...snapshot.companies]),
    modules: Object.freeze([...snapshot.modules]),
  });
}

function normalizeFailure(cause: unknown): WorkspaceContextFailure {
  return cause instanceof WorkspaceContextFailure ? cause : normalizeSourceFailure(cause);
}

function normalizeSourceFailure(cause: unknown): WorkspaceContextFailure {
  return new WorkspaceContextFailure("SOURCE_UNAVAILABLE", "No se pudo obtener el contexto de trabajo.", cause);
}

function normalizePersistenceFailure(cause: unknown): WorkspaceContextFailure {
  return cause instanceof WorkspaceContextFailure && cause.code === "PERSISTENCE_UNAVAILABLE"
    ? cause
    : new WorkspaceContextFailure("PERSISTENCE_UNAVAILABLE", "No se pudo guardar el contexto de trabajo.", cause);
}
