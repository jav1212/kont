import type { AccessControlRepository, AuthorizationAudit } from "@kontave/access-control-application";
import type { AuthorizationDecision, AuthorizationRequest, AuthorizationSnapshot } from "@kontave/access-control-domain";
export class InMemoryAccessControlRepository implements AccessControlRepository {
  constructor(private readonly entries: readonly { userId: string; snapshot: AuthorizationSnapshot }[] = []) {}
  async findSnapshot(userId: string, organizationId: string) { return this.entries.find((item) => item.userId === userId && item.snapshot.role.organizationId === organizationId)?.snapshot ?? null; }
}
export class RecordingAuthorizationAudit implements AuthorizationAudit {
  readonly entries: Array<{ request: AuthorizationRequest; decision: AuthorizationDecision; snapshot: AuthorizationSnapshot | null }> = [];
  async record(request: AuthorizationRequest, decision: AuthorizationDecision, snapshot: AuthorizationSnapshot | null) { this.entries.push({ request, decision, snapshot }); }
}
