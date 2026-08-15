import type { ProfileDetails, ProfileDetailsReader } from "@kontave/profile-application";

export class StubProfileDetailsReader implements ProfileDetailsReader {
  readonly requestedUserIds: string[] = [];

  constructor(private readonly details: ProfileDetails | null = null) {}

  async findByUserId(userId: string): Promise<ProfileDetails | null> {
    this.requestedUserIds.push(userId);
    return this.details;
  }
}
