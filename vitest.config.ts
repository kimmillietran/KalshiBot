import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const sharedAlias = {
  "@": path.resolve(__dirname, "./src"),
};

const sharedCoverage = {
  provider: "v8" as const,
  reporter: ["text", "html"],
  include: ["src/**/*.{ts,tsx}"],
  exclude: [
    "src/**/*.test.{ts,tsx}",
    "src/**/*.spec.{ts,tsx}",
    "src/app/**",
    "src/components/ui/**",
  ],
};

/**
 * Environment selection (perf):
 * - Project `unit-node` (default cost path): Node for `*.{test,spec}.ts`
 * - Project `unit-jsdom`: jsdom only for React/RTL `*.{test,spec}.tsx`
 *
 * Pure TypeScript suites must not instantiate jsdom. New browser tests should
 * use a `.tsx` suffix (or a file-level `// @vitest-environment jsdom` directive
 * inside the node project only if unavoidable).
 *
 * Uses Vitest `test.projects` (preferred over deprecated `environmentMatchGlobs`).
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: sharedAlias,
  },
  test: {
    coverage: sharedCoverage,
    projects: [
      {
        extends: true,
        test: {
          name: "unit-node",
          environment: "node",
          setupFiles: ["./vitest.setup.ts"],
          include: [
            "src/**/*.{test,spec}.ts",
            "scripts/**/*.{test,spec}.ts",
          ],
          exclude: [
            "src/**/*.{test,spec}.tsx",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "unit-jsdom",
          environment: "jsdom",
          setupFiles: ["./vitest.setup.ts"],
          include: ["src/**/*.{test,spec}.tsx"],
        },
      },
    ],
  },
});
