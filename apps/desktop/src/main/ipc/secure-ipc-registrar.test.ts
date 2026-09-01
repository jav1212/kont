import assert from "node:assert/strict";
import test from "node:test";
import { SecureIpcRegistrar } from "./secure-ipc-registrar";

type RegisteredHandler = (event: unknown, ...arguments_: unknown[]) => unknown;

test("secure registrar requires the exact trusted renderer main-frame URL", () => {
  const handlers = new Map<string, RegisteredHandler>();
  const frame = { url: "http://localhost:5173/" };
  const contents = { mainFrame: frame };
  const registrar = new SecureIpcRegistrar(
    { handle: (channel: string, handler: RegisteredHandler) => handlers.set(channel, handler) } as never,
    () => contents as never,
    () => "http://localhost:5173/",
  );
  registrar.handle("test:trusted", (_event, value) => value as never);
  const handler = handlers.get("test:trusted")!;

  assert.equal(handler({ sender: contents, senderFrame: frame }, "accepted"), "accepted");
  assert.throws(
    () => handler({ sender: contents, senderFrame: { url: "http://localhost:5173/" } }, "rejected"),
    /untrusted renderer/,
  );
  frame.url = "https://localhost:5173/";
  assert.throws(
    () => handler({ sender: contents, senderFrame: frame }, "rejected"),
    /untrusted renderer/,
  );
});
