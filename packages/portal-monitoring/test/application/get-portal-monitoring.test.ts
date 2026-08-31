import assert from "node:assert/strict";
import test from "node:test";
import { PortalAvailability, PortalMonitoringFailure, type PortalStatus } from "../../src/domain";
import { GetPortalMonitoring, type PortalMonitoringRepository } from "../../src/application";

class Repository implements PortalMonitoringRepository {
  async listActivePortalStatuses(): Promise<readonly PortalStatus[]> {
    return [{
      id: "portal-1", slug: "seniat", name: "SENIAT", category: "fiscal", logoUrl: null,
      status: PortalAvailability.Operational, responseTimeMs: 350, checkedAt: "2026-08-15T12:00:00.000Z",
    }];
  }
}

test("builds a monitoring snapshot from persisted portal observations", async () => {
  const snapshot = await new GetPortalMonitoring(new Repository()).execute();
  assert.equal(snapshot.status, PortalAvailability.Operational);
  assert.equal(snapshot.portals[0]?.slug, "seniat");
  assert.equal(snapshot.observedAt, "2026-08-15T12:00:00.000Z");
});

test("maps unexpected repository errors to a typed public failure", async () => {
  const repository: PortalMonitoringRepository = {
    listActivePortalStatuses: async () => { throw new Error("database unavailable"); },
  };
  await assert.rejects(
    new GetPortalMonitoring(repository).execute(),
    (cause) => cause instanceof PortalMonitoringFailure
      && cause.code === "PORTAL_MONITORING_REPOSITORY_UNAVAILABLE"
      && cause.cause instanceof Error,
  );
});
