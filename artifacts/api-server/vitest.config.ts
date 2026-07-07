import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    alias: {
      "@workspace/db": new URL("../../lib/db/src/index.ts", import.meta.url)
        .pathname,
    },
  },
});
