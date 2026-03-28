// memberships-factory — assembles the memberships module dependency graph.
// Role: infrastructure entry point — constructs the repository and wires all use cases.
// Invariant: callers must not instantiate use cases directly; always go through this factory.

import { ServerSupabaseSource }           from "@/src/shared/backend/source/infra/server-supabase";
import { LocalEventBus }                  from "@/src/shared/backend/infra/local-event-bus";
import { SupabaseMembershipsRepository }  from "./infrastructure/repositories/supabase-memberships.repository";
import { GetUserMembershipsUseCase }      from "./application/use-cases/get-user-memberships.use-case";
import { GetMembersUseCase }              from "./application/use-cases/get-members.use-case";
import { SendMemberInvitationUseCase }    from "./application/use-cases/send-member-invitation.use-case";
import { RevokeMembershipUseCase }        from "./application/use-cases/revoke-membership.use-case";
import { AcceptInvitationUseCase }        from "./application/use-cases/accept-invitation.use-case";

export function getMembershipsActions() {
    const repo     = new SupabaseMembershipsRepository(new ServerSupabaseSource());
    const eventBus = new LocalEventBus();

    return {
        getUserMemberships: new GetUserMembershipsUseCase(repo),
        getMembers:         new GetMembersUseCase(repo),
        sendInvitation:     new SendMemberInvitationUseCase(repo, eventBus),
        revokeMembership:   new RevokeMembershipUseCase(repo),
        acceptInvitation:   new AcceptInvitationUseCase(repo),
    };
}
