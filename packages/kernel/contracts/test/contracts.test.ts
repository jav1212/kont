import assert from "node:assert/strict";
import test from "node:test";
import {
  definePresentationRegistry,
  type ClientFeature,
  type PresentationRegistry,
} from "../src/index";

test("presentation registries preserve explicit feature classifications", () => {
  type Features = {
    readonly products: ClientFeature<unknown>;
    readonly inventory: ClientFeature<unknown>;
  };
  const registry = definePresentationRegistry<Features>({
    products: { status: "ready" },
    inventory: { status: "planned", reason: "Client presentation pending" },
  }) satisfies PresentationRegistry<Features>;
  assert.equal(registry.products.status, "ready");
  assert.ok(Object.isFrozen(registry));
});
