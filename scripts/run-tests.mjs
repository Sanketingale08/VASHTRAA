import { spawnSync } from "child_process";
import path from "path";

const nodeExe = "C:\\Users\\Administrator\\AppData\\Local\\ms-playwright-go\\1.57.0\\node.exe";
const vitestMjs = path.resolve(process.cwd(), "artifacts/api-server/node_modules/vitest/vitest.mjs");

const nodePath = [
  path.resolve(process.cwd(), "node_modules/.pnpm/node_modules"),
  path.resolve(process.cwd(), "node_modules"),
  path.resolve(process.cwd(), "artifacts/api-server/node_modules"),
  path.resolve(process.cwd(), "lib/db/node_modules"),
].join(path.delimiter);

console.log("Running Admin Settings Vitest tests...");
const res = spawnSync(nodeExe, [
  "--preserve-symlinks-main",
  "--preserve-symlinks",
  vitestMjs,
  "run",
  "artifacts/api-server/src/__tests__/admin-settings-phase3.test.ts",
  "artifacts/api-server/src/__tests__/admin-settings-phase2.test.ts",
  "artifacts/api-server/src/__tests__/admin-maintenance-middleware.test.ts",
  "artifacts/api-server/src/__tests__/admin-2fa-setup-gates.test.ts",
  "artifacts/api-server/src/__tests__/admin-2fa-routes.test.ts",
  "artifacts/api-server/src/__tests__/admin-2fa-gate.test.ts"
], {
  cwd: process.cwd(),
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_PATH: nodePath,
    NODE_PRESERVE_SYMLINKS: "1"
  }
});

process.exit(res.status ?? 0);
