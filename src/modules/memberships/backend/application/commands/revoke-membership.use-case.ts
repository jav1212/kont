// RevokeMembershipUseCase — revokes an accepted membership or deletes a pending invitation, then emits MembershipRevoked.
// Role: application — enforces authorization: contables cannot revoke; admins cannot revoke owners; owners cannot self-revoke.
// Invariant: the operation targets either tenant_memberships or tenant_invitations — never both.

import { UseCase }                  from "@/src/core/domain/use-case";
import { Result }                   from "@/src/core/domain/result";
import { IEventBus }                from "@/src/core/domain/event-bus";
import { IMembershipsRepository }   from "../../domain/memberships-repository";
import { MembershipRevokedPayload } from "../../domain/events/membership-revoked.event";

interface Input {
    tenantOwnerId: string;
    memberId:      string;
    callerRole:    string;
}

export class RevokeMembershipUseCase extends UseCase<Input, void> {
    constructor(
        private readonly repo:     IMembershipsRepository,
        private readonly eventBus?: IEventBus,
    ) {
        super();
    }

    async execute({ tenantOwnerId, memberId, callerRole }: Input): Promise<Result<void>> {
        if (callerRole === "contable") {
            return Result.fail("Insufficient permissions");
        }

        // Attempt to revoke an accepted membership first.
        const memberResult = await this.repo.revokeMembership(tenantOwnerId, memberId);

        if (memberResult.isSuccess) {
            const { memberRole, isTenantOwner } = memberResult.getValue();

            if (callerRole === "admin" && memberRole === "owner") {
                return Result.fail("Cannot remove the owner");
            }

            if (isTenantOwner) {
                return Result.fail("Cannot remove the tenant owner");
            }

            if (this.eventBus) {
                await this.eventBus.publish<MembershipRevokedPayload>({
                    eventId:    crypto.randomUUID(),
                    eventType:  "membership.revoked",
                    occurredAt: new Date().toISOString(),
                    payload: { tenantOwnerId, memberId, revokedBy: callerRole },
                });
            }

            return Result.success(undefined);
        }

        // Not an accepted membership — try pending invitation.
        const invResult = await this.repo.revokeInvitation(tenantOwnerId, memberId);

        if (invResult.isFailure) {
            return Result.fail("Membership not found");
        }

        if (this.eventBus) {
            await this.eventBus.publish<MembershipRevokedPayload>({
                eventId:    crypto.randomUUID(),
                eventType:  "membership.revoked",
                occurredAt: new Date().toISOString(),
                payload: { tenantOwnerId, memberId, revokedBy: callerRole },
            });
        }

        return Result.success(undefined);
    }
}
