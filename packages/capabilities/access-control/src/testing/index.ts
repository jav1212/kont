import type { AccessControlRepository, AuthorizationAudit, ScopedAccessGrantWriter } from "../application";
import type { AuthorizationDecision, AuthorizationRequest, AuthorizationSnapshot } from "../domain";
export class InMemoryAccessControlRepository implements AccessControlRepository {
  constructor(private readonly entries: readonly { userId: string; snapshot: AuthorizationSnapshot }[] = []) {}
  async findSnapshot(userId: string, organizationId: string) { return this.entries.find((item) => item.userId === userId && item.snapshot.role.organizationId === organizationId)?.snapshot ?? null; }
  async findSnapshots(userId: string, organizationIds: readonly string[]) {
    return new Map(this.entries
      .filter((item) => item.userId === userId && organizationIds.includes(item.snapshot.role.organizationId ?? ""))
      .map((item) => [item.snapshot.role.organizationId!, item.snapshot]));
  }
}
export class RecordingAuthorizationAudit implements AuthorizationAudit {
  readonly entries: Array<{ request: AuthorizationRequest; decision: AuthorizationDecision; snapshot: AuthorizationSnapshot | null }> = [];
  async record(request: AuthorizationRequest, decision: AuthorizationDecision, snapshot: AuthorizationSnapshot | null) { this.entries.push({ request, decision, snapshot }); }
}
/** In-memory exact-target grant store for deterministic application tests. */
export class InMemoryScopedAccessGrants implements ScopedAccessGrantWriter {
  private readonly entries = new Set<string>();
  async hasGrant(input: Parameters<ScopedAccessGrantWriter["hasGrant"]>[0]): Promise<boolean> { return this.entries.has(this.key(input)); }
  async grant(input: Parameters<ScopedAccessGrantWriter["grant"]>[0]): Promise<void> { this.entries.add(this.mutationKey(input)); }
  async revoke(input: Parameters<ScopedAccessGrantWriter["revoke"]>[0]): Promise<void> { this.entries.delete(this.mutationKey(input)); }
  private key(input: Parameters<ScopedAccessGrantWriter["hasGrant"]>[0]): string { return JSON.stringify([input.actor.userId, input.actor.organizationId, input.resource?.companyId ?? null, input.permission, input.target.kind, input.target.id]); }
  private mutationKey(input: Parameters<ScopedAccessGrantWriter["grant"]>[0]): string { return JSON.stringify([input.membershipId, input.administrator.organizationId, input.resource?.companyId ?? null, input.permission, input.target.kind, input.target.id]); }
}
