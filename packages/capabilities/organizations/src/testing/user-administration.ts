import {
  type OrganizationId,
  type OrganizationalUser,
  type UserId,
  UserAdministrationFailure,
} from "../domain";
import type {
  OrganizationalUserChanges,
  OrganizationalUserRepository,
} from "../application/user-administration";

/** In-memory persistence adapter for deterministic organizational-user tests. */
export class InMemoryOrganizationalUserRepository implements OrganizationalUserRepository {
  private readonly users = new Map<string, OrganizationalUser>();

  /**
   * Initializes deterministic local assignments for a test.
   * @param initial Initial local assignments.
   * @returns An in-memory repository instance.
   */
  constructor(initial: readonly OrganizationalUser[] = []) {
    initial.forEach((user) =>
      this.users.set(key(user.organizationId, user.userId), freeze(user)),
    );
  }

  /** {@inheritDoc OrganizationalUserRepository.list} */
  async list(
    organizationId: OrganizationId,
  ): Promise<readonly OrganizationalUser[]> {
    return [...this.users.values()].filter(
      (user) => user.organizationId === organizationId,
    );
  }
  /** {@inheritDoc OrganizationalUserRepository.find} */
  async find(
    organizationId: OrganizationId,
    userId: UserId,
  ): Promise<OrganizationalUser | null> {
    return this.users.get(key(organizationId, userId)) ?? null;
  }
  /** {@inheritDoc OrganizationalUserRepository.create} */
  async create(user: OrganizationalUser): Promise<OrganizationalUser> {
    const userKey = key(user.organizationId, user.userId);
    if (this.users.has(userKey))
      throw new UserAdministrationFailure(
        "ORGANIZATIONAL_USER_ALREADY_EXISTS",
        "El usuario ya pertenece a esta organización.",
      );
    const created = freeze({
      ...user,
      allowedCompanyIds: [...user.allowedCompanyIds],
      version: 1,
    });
    this.users.set(userKey, created);
    return created;
  }
  /** {@inheritDoc OrganizationalUserRepository.update} */
  async update(
    userId: UserId,
    organizationId: OrganizationId,
    changes: OrganizationalUserChanges,
    expectedVersion: number,
  ): Promise<OrganizationalUser> {
    const userKey = key(organizationId, userId);
    const previous = this.users.get(userKey);
    if (!previous)
      throw new UserAdministrationFailure(
        "ORGANIZATIONAL_USER_NOT_FOUND",
        "El usuario no pertenece a esta organización.",
      );
    if (previous.version !== expectedVersion)
      throw new UserAdministrationFailure(
        "ORGANIZATIONAL_USER_VERSION_CONFLICT",
        "El usuario cambió en otro cliente.",
      );
    const updated = freeze({
      ...previous,
      ...changes,
      allowedCompanyIds: changes.allowedCompanyIds
        ? [...changes.allowedCompanyIds]
        : previous.allowedCompanyIds,
      version: previous.version + 1,
    });
    this.users.set(userKey, updated);
    return updated;
  }
  /** {@inheritDoc OrganizationalUserRepository.revoke} */
  async revoke(
    userId: UserId,
    organizationId: OrganizationId,
    expectedVersion: number,
  ): Promise<void> {
    const userKey = key(organizationId, userId);
    const previous = this.users.get(userKey);
    if (!previous)
      throw new UserAdministrationFailure(
        "ORGANIZATIONAL_USER_NOT_FOUND",
        "El usuario no pertenece a esta organización.",
      );
    if (previous.version !== expectedVersion)
      throw new UserAdministrationFailure(
        "ORGANIZATIONAL_USER_VERSION_CONFLICT",
        "El usuario cambió en otro cliente.",
      );
    // This removes only this tenant assignment; no identity storage exists in this adapter.
    this.users.delete(userKey);
  }
}
function key(organizationId: OrganizationId, userId: UserId): string {
  return JSON.stringify([organizationId, userId]);
}
function freeze(user: OrganizationalUser): OrganizationalUser {
  return Object.freeze({
    ...user,
    allowedCompanyIds: Object.freeze([...user.allowedCompanyIds]),
  });
}
