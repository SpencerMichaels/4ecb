import { join } from "node:path";

import { defineConfig } from "vitest/config";

/** The shared D&D 4e kit (git submodule vendor/4e-kit), as apps/web's
 *  vite.config.ts maps it. Its own tests run in the kit repo. */
const kitSource = join(import.meta.dirname, "vendor/4e-kit/src");

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@kit$/, replacement: join(kitSource, "index.ts") },
      { find: /^@kit\//, replacement: `${kitSource}/` },
    ],
  },
  test: {
    coverage: {
      reporter: ["text", "json", "html"],
    },
    include: ["apps/**/*.test.{ts,tsx}", "packages/**/*.test.ts"],
  },
});
