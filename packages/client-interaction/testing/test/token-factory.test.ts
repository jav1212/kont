import assert from "node:assert/strict";
import test from "node:test";
import { GlobalInteractionGate } from "@kontave/client-interaction-application";
import { SequentialInteractionBlockTokenFactory } from "../src/index";

test("the test token factory makes interaction leases deterministic", () => {
  const tokens = new SequentialInteractionBlockTokenFactory("lease");
  const gate = new GlobalInteractionGate(tokens.next);
  const input = { kind: "startup" as const, state: "working" as const, priority: 100, message: "Iniciando" };
  assert.equal(gate.acquire(input).token, "lease-1");
  assert.equal(gate.acquire(input).token, "lease-2");
});
