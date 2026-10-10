import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": root,
      "server-only": path.join(root, "tests", "helpers", "server-only.mjs"),
    },
  },
  test: {
    include: ["tests/**/*.test.mjs"],
    fileParallelism: false,
    globalSetup: ["./tests/global-setup.mjs"],
    setupFiles: ["./tests/setup.mjs"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
