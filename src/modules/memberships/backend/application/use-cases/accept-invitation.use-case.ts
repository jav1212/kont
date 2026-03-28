// AcceptInvitationUseCase — validates a token and creates the membership, then emits InvitationAccepted.
// Role: application — owns all business validation: token existence, expiry, email match, duplicate prevention.
// Invariant: on success, both tenant_memberships insert and invitation accepted_at update are applied atomically via the repository.

import { UseCase }                   from "@/src/core/domain/use-case";
import { Result }                    from "@/src/core/domain/result";
import { IEventBus }                 from "@/src/core/domain/event-bus";
import { AcceptedInvitation }        from "../../domain/invitation";
import { IMembershipsRepository }    from "../../domain/memberships-repository";
import { InvitationAcceptedPayload } from "../../domain/events/invitation-accepted.event";

interface Input {
    token:     string;
    userId:    string;
    userEmail: string;
}

export class AcceptInvitationUseCase extends UseCase<Input, AcceptedInvitation> {
    constructor(
        private readonly repo:     IMembershipsRepository,
        private readonly eventBus?: IEventBus,
    ) {
        super();
    }

    async execute(input: Input): Promise<Result<AcceptedInvitation>> {
        const result = await this.repo.acceptInvitation(input);

        if (result.isSuccess && this.eventBus) {
            const accepted = result.getValue();
            await this.eventBus.publish<InvitationAcceptedPayload>({
                eventId:    crypto.randomUUID(),
                eventType:  "membership.invitation_accepted",
                occurredAt: new Date().toISOString(),
                payload: {
                    tenantOwnerId: accepted.tenantId,
                    userId:        input.userId,
                    userEmail:     input.userEmail,
                },
            });
        }

        return result;
    }
}
