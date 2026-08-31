import assert from "node:assert/strict";
import test from "node:test";
import { PortalAvailability } from "../../src/domain";
import { SupabasePortalMonitoringRepository } from "../../src/adapters/supabase";

test("maps a portal without checks to unknown", async () => {
  const query = {
    select() { return this; },
    async order() {
      return {
        data: [{
          id: "5d67af5e-d45d-4c99-89e1-7c30bd918ccd",
          slug: "seniat",
          name: "SENIAT",
          category: "fiscal",
          logo_url: null,
          display_order: 1,
          status: null,
          response_time_ms: null,
          checked_at: null,
        }],
        error: null,
      };
    },
  };
  const client = { from: () => query };
  const repository = new SupabasePortalMonitoringRepository(client as never);
  const portals = await repository.listActivePortalStatuses();
  assert.equal(portals[0]?.status, PortalAvailability.Unknown);
});
