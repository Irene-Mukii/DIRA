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
    include: [
      "tests/education-retrieval.test.mjs",
      "tests/education-markdown-cache.test.mjs",
      "tests/fetch-mcp.integration.test.mjs",
      "tests/evidence-reasoning.test.mjs",
      "tests/models.test.mjs",
      "tests/model-cost.test.mjs",
      "tests/suggest-test.test.mjs",
      "tests/suggest-test-graph.test.mjs",
    ],
    fileParallelism: false,
  },
});
