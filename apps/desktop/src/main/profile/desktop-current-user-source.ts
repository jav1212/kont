import type { ClientPortFeature, ProfilePort } from "@kontave/client-contracts";
import type { DesktopCurrentUserState } from "../../renderer-bridge";
import { requireClientValue } from "../client/client-operation";

/** Desktop composition adapter for the portable current-user remote port. */
export class DesktopCurrentUserSource {
  /**
   * Creates the source over the portable profile feature.
   * @param profile - Runtime-managed profile feature.
   */
  constructor(private readonly profile: ClientPortFeature<ProfilePort>) {}

  /** @returns Current profile mapped to Desktop presentation state. */
  async getCurrent(): Promise<DesktopCurrentUserState> {
    return {
      status: "ready",
      user: requireClientValue(await this.profile.current()),
    };
  }
}
