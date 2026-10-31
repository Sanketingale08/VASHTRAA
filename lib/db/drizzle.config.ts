import { defineConfig } from "drizzle-kit";
import path from "path";
import fs from "fs";

if (!process.env.DATABASE_URL) {
  const envPath = path.resolve(__dirname, "../../.env");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    const match = envContent.match(/^DATABASE_URL=(.+)$/m);
    if (match) {
      process.env.DATABASE_URL = match[1].trim();
    }
  }
}

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/vastraa";
}

export default defineConfig({
  schema: "./src/schema/*.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
