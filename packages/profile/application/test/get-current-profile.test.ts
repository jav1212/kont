import assert from "node:assert/strict";
import test from "node:test";
import { GetCurrentProfile, type ProfileDetailsReader } from "../src/index.js";

test("combines the authenticated identity with its presentation details", async () => {
  const reader: ProfileDetailsReader = {
    async findByUserId(userId) {
      assert.equal(userId, "user-1");
      return { displayName: "Ada Lovelace", avatarUrl: "https://example.com/ada.png" };
    },
  };

  const result = await new GetCurrentProfile(reader).execute({ userId: "user-1", email: "ada@example.com" });

  assert.deepEqual(result, {
    userId: "user-1",
    email: "ada@example.com",
    displayName: "Ada Lovelace",
    avatarUrl: "https://example.com/ada.png",
  });
});

test("keeps a valid identity usable when no profile row exists", async () => {
  const reader: ProfileDetailsReader = { async findByUserId() { return null; } };

  const result = await new GetCurrentProfile(reader).execute({ userId: "user-2", email: null });

  assert.deepEqual(result, {
    userId: "user-2",
    email: null,
    displayName: null,
    avatarUrl: null,
  });
});
