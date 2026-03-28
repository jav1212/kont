// memberships-factory — assembles the memberships module dependency graph.
// Role: infrastructure entry point — constructs the repository and wires all use cases.
// Invariant: callers must not instantiate use cases directly; always go through this factory.

import { ServerSupabaseSource }          from "@/src/shared/backend/source/infra/server-supabase";
import { LocalEventBus }                 from "@/src/shared/backend/infra/local-event-bus";
import { SupabaseMembershipsRepository } from "./infrastructure/repositories/supabase-memberships.repository";
import { SendMemberInvitationUseCase }   from "./application/commands/send-member-invitation.use-case";
import { RevokeMembershipUseCase }       from "./application/commands/revoke-membership.use-case";
import { AcceptInvitationUseCase }       from "./application/commands/accept-invitation.use-case";
import { GetUserMembershipsUseCase }     from "./application/queries/get-user-memberships.use-case";
import { GetMembersUseCase }             from "./application/queries/get-members.use-case";

export function getMembershipsActions() {
    const repo     = new SupabaseMembershipsRepository(new ServerSupabaseSource());
    const eventBus = new LocalEventBus();

    return {
        getUserMemberships: new GetUserMembershipsUseCase(repo),
        getMembers:         new GetMembersUseCase(repo),
        sendInvitation:     new SendMemberInvitationUseCase(repo, eventBus),
        revokeMembership:   new RevokeMembershipUseCase(repo, eventBus),
        acceptInvitation:   new AcceptInvitationUseCase(repo, eventBus),
    };
}
