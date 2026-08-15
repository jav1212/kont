import assert from "node:assert/strict";
import test from "node:test";
import { PortalAvailability, type PortalStatus } from "@kontave/platform-status-domain";
import { GetPlatformStatus, type PlatformStatusRepository } from "../src/index.js";

class Repository implements PlatformStatusRepository {
  async listActivePortalStatuses(): Promise<readonly PortalStatus[]> {
    return [{
      id: "portal-1", slug: "seniat", name: "SENIAT", category: "fiscal", logoUrl: null,
      status: PortalAvailability.Operational, responseTimeMs: 350, checkedAt: "2026-08-15T12:00:00.000Z",
    }];
  }
}

test("builds a platform snapshot from persisted portal observations", async () => {
  const snapshot = await new GetPlatformStatus(new Repository()).execute();
  assert.equal(snapshot.status, PortalAvailability.Operational);
  assert.equal(snapshot.portals[0]?.slug, "seniat");
  assert.equal(snapshot.observedAt, "2026-08-15T12:00:00.000Z");
});
