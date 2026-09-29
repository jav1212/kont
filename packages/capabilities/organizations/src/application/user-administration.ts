import {
  type CompanyId,
  MembershipStatus,
  type OrganizationCompany,
  type OrganizationId,
  type OrganizationalUser,
  type UserId,
  UserAdministrationFailure,
} from "../domain";

/** A globally managed identity that may be referenced by an organizational assignment. */
export interface UserIdentity {
  readonly id: UserId;
  readonly email: string;
  readonly displayName: string | null;
}

/** Reads global identities; this port deliberately has no global-delete operation. */
export interface UserIdentityDirectory {
  /**
   * Resolves an identity before it is assigned locally.
   * @param userId Globally managed identity identifier.
   * @returns The identity, or null when it does not exist.
   */
  findById(userId: UserId): Promise<UserIdentity | null>;
}

/** Trusted authorization decision supplied by the authentication/access boundary. */
export interface UserAdministrationAuthority {
  readonly organizationId: OrganizationId;
  /** Maximum administrative priority this actor may assign; it is unrelated to permissions. */
  readonly maximumAssignablePriority: number;
}

/** Obtains authorization from a trusted boundary, never command claims. */
export interface UserAdministrationAuthorizer {
  /**
   * Verifies that an authenticated actor can administer users in an organization.
   * @param actorUserId Authenticated actor supplied by the transport boundary.
   * @param organizationId Tenant in which administration is requested.
   * @returns A trusted authority decision.
   * @throws UserAdministrationFailure when the actor is not authorized.
   */
  authorizeUserAdministration(
    actorUserId: UserId,
    organizationId: OrganizationId,
  ): Promise<UserAdministrationAuthority>;
}

/** Persistence port for local organizational-user assignments. */
export interface OrganizationalUserRepository {
  /** @param organizationId Tenant scope. @returns Local users in that tenant. */
  list(organizationId: OrganizationId): Promise<readonly OrganizationalUser[]>;
  /** @param organizationId Tenant scope. @param userId Identity being read. @returns Assignment or null. */
  find(
    organizationId: OrganizationId,
    userId: UserId,
  ): Promise<OrganizationalUser | null>;
  /** @param user User assignment to create. @returns Persisted assignment. @throws UserAdministrationFailure on duplicate. */
  create(user: OrganizationalUser): Promise<OrganizationalUser>;
  /** @param userId Identity being changed. @param organizationId Tenant scope. @param changes Partial local state. @param expectedVersion CAS version. @returns Persisted assignment. */
  update(
    userId: UserId,
    organizationId: OrganizationId,
    changes: OrganizationalUserChanges,
    expectedVersion: number,
  ): Promise<OrganizationalUser>;
  /**
   * Revokes only the local assignment. Implementations must never delete the global identity.
   * @param userId Identity whose local membership is revoked.
   * @param organizationId Tenant scope.
   * @param expectedVersion CAS version.
   */
  revoke(
    userId: UserId,
    organizationId: OrganizationId,
    expectedVersion: number,
  ): Promise<void>;
}

/** Company directory owned by the organizations capability. */
export interface OrganizationalCompanyDirectory {
  /** @param organizationId Tenant scope. @returns Companies belonging to that tenant only. */
  listCompanies(
    organizationId: OrganizationId,
  ): Promise<readonly OrganizationCompany[]>;
}

/** Reads one company inside a declared organization scope. */
export interface OrganizationalCompanyLookup extends OrganizationalCompanyDirectory {
  /** @param organizationId Tenant scope. @param companyId Company identifier. @returns Company or null. */
  findCompany(
    organizationId: OrganizationId,
    companyId: CompanyId,
  ): Promise<OrganizationCompany | null>;
}

/** Mutable fields of a local organizational-user assignment. */
export interface OrganizationalUserChanges {
  readonly displayName?: string | null;
  readonly administrativePriority?: number;
  readonly allowedCompanyIds?: readonly CompanyId[];
}

/** Input shared by all organizational-user mutations. */
export interface OrganizationalUserCommand {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
}

/** Creates a local assignment for an existing global identity (SEG-001). */
export class CreateOrganizationalUser {
  /**
   * Creates the local-assignment creation use case.
   * @param repository Local organizational-user persistence.
   * @param identities Trusted identity lookup.
   * @param companies Tenant company lookup.
   * @param authorizer Trusted authorization boundary.
   * @returns A creation use case instance.
   */
  constructor(
    private readonly repository: OrganizationalUserRepository,
    private readonly identities: UserIdentityDirectory,
    private readonly companies: OrganizationalCompanyDirectory,
    private readonly authorizer: UserAdministrationAuthorizer,
  ) {}

  /**
   * Creates an active local assignment for an existing identity.
   * @param command Assignment request.
   * @returns Created local assignment.
   * @throws UserAdministrationFailure for authorization, identity validation, company scope, or duplicate assignments.
   */
  async execute(
    command: OrganizationalUserCommand & {
      readonly userId: UserId;
      readonly displayName?: string | null;
      readonly administrativePriority: number;
      readonly allowedCompanyIds: readonly CompanyId[];
    },
  ): Promise<OrganizationalUser> {
    const authority = await authorize(this.authorizer, command);
    assertPriority(command.administrativePriority, authority);
    const identity = await this.identities.findById(command.userId);
    if (!identity)
      throw failure(
        "ORGANIZATIONAL_USER_DATA_INVALID",
        "La identidad de usuario no existe.",
      );
    if (identity.id !== command.userId)
      throw failure(
        "ORGANIZATIONAL_USER_DATA_INVALID",
        "La identidad resuelta no corresponde al usuario solicitado.",
      );
    const user: OrganizationalUser = {
      organizationId: command.organizationId,
      userId: identity.id,
      email: identity.email,
      displayName: normalizeName(command.displayName, identity.displayName),
      administrativePriority: command.administrativePriority,
      allowedCompanyIds: await validateCompanies(
        this.companies,
        command.organizationId,
        command.allowedCompanyIds,
      ),
      status: MembershipStatus.Active,
      version: 1,
    };
    return this.repository.create(user);
  }
}

/** Modifies local profile data, priority, and allowed companies (SEG-002, SEG-006, SEG-007). */
export class UpdateOrganizationalUser {
  /**
   * Creates the local-assignment update use case.
   * @param repository Local organizational-user persistence.
   * @param companies Tenant company lookup.
   * @param authorizer Trusted authorization boundary.
   * @returns An update use case instance.
   */
  constructor(
    private readonly repository: OrganizationalUserRepository,
    private readonly companies: OrganizationalCompanyDirectory,
    private readonly authorizer: UserAdministrationAuthorizer,
  ) {}

  /**
   * Updates mutable local-assignment state under compare-and-swap control.
   * @param command Change request with a compare-and-swap version.
   * @returns Updated assignment.
   * @throws UserAdministrationFailure on stale versions, cross-tenant companies, or priority escalation.
   */
  async execute(
    command: OrganizationalUserCommand & {
      readonly userId: UserId;
      readonly expectedVersion: number;
      readonly changes: OrganizationalUserChanges;
    },
  ): Promise<OrganizationalUser> {
    const authority = await authorize(this.authorizer, command);
    assertVersion(command.expectedVersion);
    if (command.changes.administrativePriority !== undefined)
      assertPriority(command.changes.administrativePriority, authority);
    const allowedCompanyIds =
      command.changes.allowedCompanyIds === undefined
        ? undefined
        : await validateCompanies(
            this.companies,
            command.organizationId,
            command.changes.allowedCompanyIds,
          );
    const changes: OrganizationalUserChanges = {
      ...(command.changes.displayName === undefined
        ? {}
        : { displayName: normalizeName(command.changes.displayName, null) }),
      ...(command.changes.administrativePriority === undefined
        ? {}
        : { administrativePriority: command.changes.administrativePriority }),
      ...(allowedCompanyIds === undefined ? {} : { allowedCompanyIds }),
    };
    if (Object.keys(changes).length === 0)
      throw failure(
        "ORGANIZATIONAL_USER_DATA_INVALID",
        "Debes indicar al menos un cambio.",
      );
    return this.repository.update(
      command.userId,
      command.organizationId,
      changes,
      command.expectedVersion,
    );
  }
}

/** Revokes a local organizational membership while preserving the shared global identity (SEG-003). */
export class RevokeOrganizationalUser {
  /**
   * Creates the local-membership revocation use case.
   * @param repository Local organizational-user persistence.
   * @param authorizer Trusted authorization boundary.
   * @returns A revocation use case instance.
   */
  constructor(
    private readonly repository: OrganizationalUserRepository,
    private readonly authorizer: UserAdministrationAuthorizer,
  ) {}

  /**
   * Revokes a tenant assignment without deleting the global identity.
   * @param command Revocation request with a compare-and-swap version.
   * @returns Nothing after revocation.
   * @throws UserAdministrationFailure for authorization, absence, or stale versions.
   */
  async execute(
    command: OrganizationalUserCommand & {
      readonly userId: UserId;
      readonly expectedVersion: number;
    },
  ): Promise<void> {
    await authorize(this.authorizer, command);
    assertVersion(command.expectedVersion);
    await this.repository.revoke(
      command.userId,
      command.organizationId,
      command.expectedVersion,
    );
  }
}

/** Selects one local organizational-user assignment with tenant isolation (SEG-004). */
export class GetOrganizationalUser {
  /**
   * Creates the local-assignment selection use case.
   * @param repository Local organizational-user persistence.
   * @param authorizer Trusted authorization boundary.
   * @returns A selection use case instance.
   */
  constructor(
    private readonly repository: OrganizationalUserRepository,
    private readonly authorizer: UserAdministrationAuthorizer,
  ) {}

  /**
   * Selects one local assignment within the requested tenant.
   * @param command Selection request.
   * @returns The requested local assignment.
   * @throws UserAdministrationFailure when absent, unauthorized, or a repository returns a mismatched user.
   */
  async execute(
    command: OrganizationalUserCommand & { readonly userId: UserId },
  ): Promise<OrganizationalUser> {
    await authorize(this.authorizer, command);
    const user = await this.repository.find(
      command.organizationId,
      command.userId,
    );
    if (!user)
      throw failure(
        "ORGANIZATIONAL_USER_NOT_FOUND",
        "El usuario no pertenece a esta organización.",
      );
    if (user.organizationId !== command.organizationId)
      throw failure(
        "ORGANIZATIONAL_USER_ACCESS_DENIED",
        "El usuario pertenece a otra organización.",
      );
    if (user.userId !== command.userId)
      throw failure(
        "ORGANIZATIONAL_USER_ACCESS_DENIED",
        "El repositorio devolvió un usuario distinto al solicitado.",
      );
    return user;
  }
}

/** Lists local assignments after authorization and rejects repository rows from another tenant. */
export class ListOrganizationalUsers {
  /**
   * Creates the listing use case.
   * @param repository Local organizational-user persistence.
   * @param authorizer Trusted authorization boundary.
   * @returns A use case instance.
   */
  constructor(
    private readonly repository: OrganizationalUserRepository,
    private readonly authorizer: UserAdministrationAuthorizer,
  ) {}

  /**
   * Lists users assigned to the organization.
   * @param command Authenticated actor and organization scope.
   * @returns Tenant-scoped organizational users.
   * @throws UserAdministrationFailure when authorization or repository tenant isolation fails.
   */
  async execute(
    command: OrganizationalUserCommand,
  ): Promise<readonly OrganizationalUser[]> {
    await authorize(this.authorizer, command);
    const users = await this.repository.list(command.organizationId);
    if (users.some((user) => user.organizationId !== command.organizationId))
      throw failure(
        "ORGANIZATIONAL_USER_ACCESS_DENIED",
        "El repositorio devolvió usuarios de otra organización.",
      );
    return users;
  }
}

/** Enforces an active local assignment and its company allowlist before exposing a company. */
export class RequireOrganizationalCompanyAccess {
  /**
   * Creates the portable company access guard. Consumers explicitly compose it with their company query; existing Web behavior is unchanged.
   * @param users Local organizational-user assignments.
   * @param companies Tenant-scoped company lookup.
   * @returns A company access guard.
   */
  constructor(
    private readonly users: OrganizationalUserRepository,
    private readonly companies: OrganizationalCompanyLookup,
  ) {}

  /**
   * Resolves a company only when the user has an active local assignment and an explicit allowlist entry.
   * @param userId User whose company access is requested.
   * @param organizationId Tenant scope.
   * @param companyId Company to resolve.
   * @returns The tenant-owned company.
   * @throws UserAdministrationFailure when the assignment is inactive, revoked, unauthorized, or the lookup leaks a foreign row.
   */
  async execute(
    userId: UserId,
    organizationId: OrganizationId,
    companyId: CompanyId,
  ): Promise<OrganizationCompany> {
    const assignment = await this.users.find(organizationId, userId);
    if (
      !assignment ||
      assignment.organizationId !== organizationId ||
      assignment.userId !== userId ||
      assignment.status !== MembershipStatus.Active
    )
      throw failure(
        "ORGANIZATIONAL_USER_ACCESS_DENIED",
        "El usuario no tiene una asignación activa en la organización.",
      );
    if (!assignment.allowedCompanyIds.includes(companyId))
      throw failure(
        "ORGANIZATIONAL_USER_ACCESS_DENIED",
        "El usuario no tiene acceso a esta empresa.",
      );
    const company = await this.companies.findCompany(organizationId, companyId);
    if (
      !company ||
      company.organizationId !== organizationId ||
      company.id !== companyId
    )
      throw failure(
        "ORGANIZATIONAL_USER_COMPANY_INVALID",
        "La empresa no pertenece a la organización.",
      );
    return company;
  }
}

async function authorize(
  authorizer: UserAdministrationAuthorizer,
  command: OrganizationalUserCommand,
): Promise<UserAdministrationAuthority> {
  const authority = await authorizer.authorizeUserAdministration(
    command.actorUserId,
    command.organizationId,
  );
  if (authority.organizationId !== command.organizationId)
    throw failure(
      "ORGANIZATIONAL_USER_ACCESS_DENIED",
      "La autorización no corresponde a la organización.",
    );
  if (
    !Number.isSafeInteger(authority.maximumAssignablePriority) ||
    authority.maximumAssignablePriority < 0 ||
    authority.maximumAssignablePriority > 1000
  )
    throw failure(
      "ORGANIZATIONAL_USER_ACCESS_DENIED",
      "La autoridad contiene un límite de prioridad inválido.",
    );
  return authority;
}
async function validateCompanies(
  directory: OrganizationalCompanyDirectory,
  organizationId: OrganizationId,
  ids: readonly CompanyId[],
): Promise<readonly CompanyId[]> {
  const unique = [...new Set(ids)];
  const companies = await directory.listCompanies(organizationId);
  const allowed = new Set(
    companies
      .filter((company) => company.organizationId === organizationId)
      .map((company) => company.id),
  );
  if (unique.some((id) => !allowed.has(id)))
    throw failure(
      "ORGANIZATIONAL_USER_COMPANY_INVALID",
      "Todas las empresas permitidas deben pertenecer a la organización.",
    );
  return unique;
}
function assertPriority(
  priority: number,
  authority: UserAdministrationAuthority,
): void {
  if (!Number.isSafeInteger(priority) || priority < 0 || priority > 1000)
    throw failure(
      "ORGANIZATIONAL_USER_PRIORITY_INVALID",
      "La prioridad administrativa debe ser un entero entre 0 y 1000.",
    );
  if (priority > authority.maximumAssignablePriority)
    throw failure(
      "ORGANIZATIONAL_USER_PRIORITY_ESCALATION",
      "No puedes asignar una prioridad administrativa superior a la autorizada.",
    );
}
function assertVersion(version: number): void {
  if (!Number.isSafeInteger(version) || version < 1)
    throw failure(
      "ORGANIZATIONAL_USER_DATA_INVALID",
      "La versión esperada no es válida.",
    );
}
function normalizeName(
  value: string | null | undefined,
  fallback: string | null,
): string | null {
  if (value === undefined) return fallback;
  const normalized = value?.trim() ?? null;
  if (normalized !== null && (normalized.length < 1 || normalized.length > 160))
    throw failure(
      "ORGANIZATIONAL_USER_DATA_INVALID",
      "El nombre debe contener entre 1 y 160 caracteres.",
    );
  return normalized;
}
function failure(
  code: import("../domain").UserAdministrationFailureCode,
  message: string,
): UserAdministrationFailure {
  return new UserAdministrationFailure(code, message);
}
