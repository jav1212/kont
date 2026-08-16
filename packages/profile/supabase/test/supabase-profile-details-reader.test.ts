import assert from "node:assert/strict";
import test from "node:test";
import { ProfileFailure } from "@kontave/profile-application";
import { SupabaseProfileDetailsReader, type ProfileRowSource } from "../src/index";

function sourceWith(result: { readonly data: unknown; readonly error: { readonly message: string } | null }): ProfileRowSource {
  return { async findByUserId() { return result; } };
}

test("maps the legacy profiles row to portable presentation details", async () => {
  const reader = new SupabaseProfileDetailsReader(sourceWith({
    data: { id: "user-1", name: "  Ada Lovelace  ", avatar_url: "https://example.com/ada.png", version: 1 },
    error: null,
  }));

  assert.deepEqual(await reader.findByUserId("user-1"), {
    displayName: "Ada Lovelace",
    avatarUrl: "https://example.com/ada.png",
    version: 1,
  });
});

test("maps an unavailable repository to a typed expected failure", async () => {
  const reader = new SupabaseProfileDetailsReader(sourceWith({ data: null, error: { message: "offline" } }));

  await assert.rejects(
    reader.findByUserId("user-1"),
    (failure: unknown) => failure instanceof ProfileFailure
      && failure.code === "PROFILE_REPOSITORY_UNAVAILABLE",
  );
});
