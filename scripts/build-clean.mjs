import fs from "fs";
import { build } from "../node_modules/.pnpm/esbuild@0.27.3/node_modules/esbuild/lib/main.js";
import esbuildPluginPino from "../artifacts/api-server/node_modules/esbuild-plugin-pino/dist/index.js";

async function compile() {
  await build({
    entryPoints: ["scripts/clean-production-db.ts"],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "esm",
    outdir: "scripts/dist",
    external: [
      "*.node",
      "sharp",
      "fsevents",
      "pg-native",
    ],
    nodePaths: [
      "node_modules",
      "artifacts/api-server/node_modules",
      "node_modules/.pnpm/node_modules",
      "lib/db/node_modules",
    ],
    plugins: [esbuildPluginPino({ target: "node20" })],
    banner: {
      js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';
import __bannerFs from 'node:fs';

(function() {
  function patch(obj, name) {
    const orig = obj[name];
    if (!orig) return;
    obj[name] = function(...args) {
      try { return orig.apply(this, args); } catch (e) {
        if (e && (e.code === 'EPERM' || e.code === 'EACCES')) {
          if (name.includes('lstat')) { try { return __bannerFs.statSync(...args); } catch(_) {} }
          return args[0];
        }
        throw e;
      }
    };
  }
  patch(__bannerFs, 'realpathSync');
  patch(__bannerFs, 'lstatSync');
  if (__bannerFs.promises) { patch(__bannerFs.promises, 'realpath'); patch(__bannerFs.promises, 'lstat'); }
})();

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
`,
    },
  });
  console.log("Successfully compiled scripts/dist/clean-production-db.js!");
}

compile().catch((err) => {
  console.error("Compile failed:", err);
  process.exit(1);
});
