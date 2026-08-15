import { summarizePlatformStatus, type PlatformStatusSnapshot, type PortalStatus } from "@kontave/platform-status-domain";

export interface PlatformStatusRepository {
  listActivePortalStatuses(): Promise<readonly PortalStatus[]>;
}

export class GetPlatformStatus {
  constructor(private readonly repository: PlatformStatusRepository) {}

  async execute(): Promise<PlatformStatusSnapshot> {
    return summarizePlatformStatus(await this.repository.listActivePortalStatuses());
  }
}
