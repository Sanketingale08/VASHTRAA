import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const apiServerDir = path.resolve(currentDir, "../artifacts/api-server");

async function testBuild() {
  console.log("Testing build.mjs esbuild...");
  try {
    const res = await esbuild({
      entryPoints: [path.resolve(apiServerDir, "src/index.ts")],
      platform: "node",
      bundle: true,
      format: "esm",
      outfile: path.resolve(apiServerDir, "dist/index.mjs"),
      logLevel: "info",
      external: [
        "*.node", "sharp", "better-sqlite3", "sqlite3", "canvas", "bcrypt", "argon2", "fsevents", "re2", "farmhash", "xxhash-addon", "bufferutil", "utf-8-validate", "ssh2", "cpu-features", "dtrace-provider", "isolated-vm", "lightningcss", "pg-native", "oracledb", "mongodb-client-encryption", "nodemailer", "handlebars", "knex", "typeorm", "protobufjs", "onnxruntime-node", "@tensorflow/*", "@prisma/client", "@mikro-orm/*", "@grpc/*", "@swc/*", "@azure/*", "@opentelemetry/*", "googleapis", "firebase-admin", "@parcel/watcher", "@sentry/profiling-node", "@tree-sitter/*", "aws-sdk", "classic-level", "dd-trace", "ffi-napi", "grpc", "hiredis", "kerberos", "leveldown", "miniflare", "mysql2", "newrelic", "odbc", "piscina", "realm", "ref-napi", "rocksdb", "sass-embedded", "sequelize", "serialport", "snappy", "tinypool", "usb", "workerd", "wrangler", "zeromq", "zeromq-prebuilt", "playwright", "puppeteer", "puppeteer-core", "electron", "pdfkit", "fontkit"
      ],
      sourcemap: "linked",
      plugins: [esbuildPluginPino()],
    });
    console.log("Build SUCCESS:", res);
  } catch (err) {
    console.error("Build FAILED with error:", err);
  }
}

testBuild();
