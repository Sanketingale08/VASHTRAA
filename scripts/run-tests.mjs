import { spawnSync } from "child_process";
import path from "path";

const nodeExe = "C:\\Users\\Administrator\\AppData\\Local\\ms-playwright-go\\1.57.0\\node.exe";
const vitestMjs = path.resolve(process.cwd(), "artifacts/api-server/node_modules/vitest/vitest.mjs");

console.log("Running Vitest tests...");
const res = spawnSync(nodeExe, ["--preserve-symlinks-main", "--preserve-symlinks", vitestMjs, "run", "--dir", "artifacts/api-server/src/__tests__"], {
  cwd: process.cwd(),
  stdio: "inherit",
  env: { ...process.env, NODE_PRESERVE_SYMLINKS: "1" }
});

process.exit(res.status ?? 0);
