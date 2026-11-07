import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "../artifacts/api-server/node_modules/esbuild/lib/main.js";
import esbuildPluginPino from "../artifacts/api-server/node_modules/esbuild-plugin-pino/dist/index.js";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

async function main() {
  console.log("Bundling test runner with esbuild...");
  const outdir = path.resolve(__dirname, "test-dist");
  const bundlePath = path.resolve(outdir, "test-returns-lifecycle.js");

  await esbuild({
    entryPoints: [path.resolve(__dirname, "test-returns-lifecycle.ts")],
    platform: "node",
    bundle: true,
    format: "esm",
    outdir: outdir,
    banner: {
      js: `
import { createRequire as __bannerCrReq } from "module";
import * as __bannerUrl from "url";
import * as __bannerPath from "path";
globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
      `,
    },
    external: [
      "mongodb"
    ],
    plugins: [esbuildPluginPino({ transports: ["pino-pretty"] })],
    logLevel: "warning",
  });
  console.log("Bundle created successfully.");

  console.log("Executing test bundle...\n");
  const child = spawn(process.execPath, [bundlePath], {
    cwd: rootDir,
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "development",
      NODE_PATH: `${path.resolve(rootDir, "artifacts/api-server/node_modules")};${process.env.NODE_PATH || ""}`,
    },
  });

  child.on("exit", (code) => {
    process.exit(code || 0);
  });
}

main().catch((err) => {
  console.error("Bundle error:", err);
  process.exit(1);
});
