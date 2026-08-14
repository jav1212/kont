import assert from "node:assert/strict";
import test from "node:test";
import { ClientInteractionFailure, GlobalInteractionGate } from "../src/index.js";

function block(message: string, priority: number) {
  return { kind: "exclusive_operation" as const, state: "working" as const, message, priority };
}

test("overlapping leases keep the client blocked until every cause is released", () => {
  const gate = new GlobalInteractionGate();
  const exportLease = gate.acquire(block("Exportando PDF", 100));
  const connectivityLease = gate.acquire({ kind: "connectivity", state: "waiting", message: "Sin conexion", priority: 500 });

  assert.equal(gate.getSnapshot().activeBlock?.message, "Sin conexion");
  exportLease.release();
  assert.equal(gate.getSnapshot().status, "blocked");
  assert.deepEqual(gate.getSnapshot().blocks.map(({ token }) => token), [connectivityLease.token]);

  connectivityLease.release();
  assert.equal(gate.getSnapshot().status, "available");
});

test("the oldest lease wins equal priority to keep presentation stable", () => {
  const gate = new GlobalInteractionGate();
  const first = gate.acquire(block("Primero", 100));
  gate.acquire(block("Segundo", 100));
  assert.equal(gate.getSnapshot().activeBlock?.token, first.token);
});

test("a lease updates progress and failure recovery without changing its token", () => {
  const gate = new GlobalInteractionGate();
  const lease = gate.acquire(block("Exportando PDF", 100));
  lease.update({ progress: { kind: "determinate", value: 0.5 } });
  assert.deepEqual(gate.getSnapshot().activeBlock?.progress, { kind: "determinate", value: 0.5 });

  lease.update({ state: "failed", message: "No se pudo exportar", actions: [{ kind: "retry", label: "Reintentar" }] });
  assert.equal(gate.getSnapshot().activeBlock?.state, "failed");
  assert.deepEqual(gate.getSnapshot().activeBlock?.actions, [{ kind: "retry", label: "Reintentar" }]);
});

test("release is idempotent and a released lease cannot be updated", () => {
  const gate = new GlobalInteractionGate();
  const lease = gate.acquire(block("Exportando PDF", 100));
  lease.release();
  lease.release();
  assert.equal(lease.active, false);
  assert.throws(
    () => lease.update({ message: "Todavia exportando" }),
    (failure) => failure instanceof ClientInteractionFailure && failure.code === "CLIENT_INTERACTION_RELEASED",
  );
});

test("snapshots are stable between changes and subscribers can unsubscribe", () => {
  const gate = new GlobalInteractionGate();
  const initial = gate.getSnapshot();
  assert.equal(gate.getSnapshot(), initial);
  let notifications = 0;
  const unsubscribe = gate.subscribe(() => { notifications += 1; });
  const lease = gate.acquire(block("Exportando PDF", 100));
  const blocked = gate.getSnapshot();
  assert.notEqual(blocked, initial);
  assert.equal(gate.getSnapshot(), blocked);
  unsubscribe();
  lease.release();
  assert.equal(notifications, 1);
});

test("invalid progress and reused tokens fail explicitly", () => {
  const gate = new GlobalInteractionGate(() => "fixed-token");
  assert.throws(
    () => gate.acquire({ ...block("Exportando PDF", 100), progress: { kind: "determinate", value: 1.1 } }),
    (failure) => failure instanceof ClientInteractionFailure && failure.code === "CLIENT_INTERACTION_INVALID",
  );
  const lease = gate.acquire(block("Exportando PDF", 100));
  lease.release();
  assert.throws(
    () => gate.acquire(block("Otra operacion", 100)),
    (failure) => failure instanceof ClientInteractionFailure && failure.code === "CLIENT_INTERACTION_DUPLICATE_TOKEN",
  );
});
