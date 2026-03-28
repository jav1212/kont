// SendMemberInvitationUseCase — creates a tenant invitation and dispatches the invite email.
// Role: application — enforces role-based authorization rules, delegates persistence and email sending.
// Invariant: contables cannot invite anyone; admins can only invite contables; owners can invite admins and contables.

import { UseCase }               from "@/src/core/domain/use-case";
import { Result }                from "@/src/core/domain/result";
import { IEventBus }             from "@/src/core/domain/event-bus";
import { Invitation }            from "../../domain/invitation";
import { IMembershipsRepository } from "../../domain/memberships-repository";
import { sendInviteEmail }       from "@/src/shared/backend/utils/send-invite-email";
import { MemberRole }            from "../../domain/membership";
import { InvitationSentPayload } from "../../domain/events/invitation-sent.event";

interface Input {
    tenantOwnerId: string;
    invitedBy:     string;
    email:         string;
    role:          MemberRole;
    callerRole:    string;
    origin:        string;
}

export class SendMemberInvitationUseCase extends UseCase<Input, Invitation> {
    constructor(
        private readonly repo:     IMembershipsRepository,
        private readonly eventBus?: IEventBus,
    ) {
        super();
    }

    async execute(input: Input): Promise<Result<Invitation>> {
        const { tenantOwnerId, invitedBy, email, role, callerRole, origin } = input;

        if (!email || !role) {
            return Result.fail("email and role are required");
        }

        if (!["admin", "contable"].includes(role)) {
            return Result.fail("role must be admin or contable");
        }

        if (callerRole === "contable") {
            return Result.fail("Insufficient permissions to invite");
        }

        if (callerRole === "admin" && role !== "contable") {
            return Result.fail("Admins can only invite contable members");
        }

        const result = await this.repo.sendInvitation({
            tenantOwnerId,
            invitedBy,
            email: email.toLowerCase().trim(),
            role,
        });

        if (result.isFailure) return result;

        const invitation = result.getValue();
        const acceptUrl  = `${origin}/accept-invite?token=${invitation.token}`;

        // Email is fire-and-forget — invitation is already persisted.
        // TODO: extract to IEmailService port in a future phase.
        // role is guaranteed to be "admin" | "contable" by validation above.
        sendInviteEmail({
            to:           email.toLowerCase().trim(),
            role:         role as "admin" | "contable",
            tenantName:   invitedBy,
            inviterEmail: invitedBy,
            acceptUrl,
        }).catch((err) => {
            console.error("[SendMemberInvitation] Error sending invite email:", err);
        });

        if (this.eventBus) {
            await this.eventBus.publish<InvitationSentPayload>({
                eventId:    crypto.randomUUID(),
                eventType:  "membership.invitation_sent",
                occurredAt: new Date().toISOString(),
                payload: {
                    tenantOwnerId,
                    invitedBy,
                    invitedEmail: email.toLowerCase().trim(),
                    role,
                },
            });
        }

        return Result.success({ ...invitation, acceptUrl });
    }
}
