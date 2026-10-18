import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Run source tests once, including after tsc has emitted copies in dist/.
    include: ["tests/**/*.test.ts"],
  },
});
