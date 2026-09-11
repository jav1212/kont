import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Keep the existing `audit:routes` entry point while evaluating the same
// TypeScript policy consumed by the Web, without a second permission registry.
const root = fileURLToPath(new URL("../", import.meta.url));
const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/audit-route-access.ts"], {
  cwd: root,
  stdio: "inherit",
});
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
