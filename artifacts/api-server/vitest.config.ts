import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 30000,
    alias: {
      "@workspace/db": fileURLToPath(
        new URL("../../lib/db/src/index.ts", import.meta.url)
      ),
    },
  },
});
