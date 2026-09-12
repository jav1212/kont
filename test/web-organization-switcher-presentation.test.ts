import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sidebarSource = readFileSync("src/shared/frontend/components/app-sidebar.tsx", "utf8");
const switcherSource = readFileSync("src/modules/organizations/frontend/components/organization-switcher.tsx", "utf8");

test("organization directory is layered above the desktop content pane", () => {
  assert.match(sidebarSource, /xl:z-30/);
  assert.match(switcherSource, /open \? "z-\[70\]" : "z-0"/);
});

test("organization search opts out of global raw-input chrome", () => {
  assert.match(switcherSource, /data-slot="organization-search"/);
});

test("organization avatars prefer the workspace presentation image and recover on load failure", () => {
  assert.match(switcherSource, /organization\?\.avatarUrl \?\? organization\?\.logoUrl/);
  assert.match(switcherSource, /onError=\{\(\) => setFailedImageUrl\(imageUrl\)\}/);
});
