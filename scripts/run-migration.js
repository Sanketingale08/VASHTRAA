import { build } from "esbuild";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  await build({
    entryPoints: [path.resolve(__dirname, "migrate-pg-to-mongo.ts")],
    outfile: path.resolve(__dirname, "migrate-pg-to-mongo.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node18",
  });
  console.log("Migration script bundled to CJS successfully.");

  await import("./migrate-pg-to-mongo.cjs");
}

main().catch(err => {
  console.error("Migration execution error:", err);
  process.exit(1);
});
