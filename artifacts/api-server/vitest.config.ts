import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    alias: {
      "@workspace/db/schema": new URL("../../lib/db/src/schema/index.ts", import.meta.url)
        .pathname,
      "@workspace/db": new URL("../../lib/db/src/index.ts", import.meta.url)
        .pathname,
    },
  },
});
