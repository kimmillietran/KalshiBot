import { afterEach } from "vitest";

/**
 * Setup is shared across Node and jsdom environments.
 *
 * Convention: `vitest.config.ts` defaults to `node` and maps
 * `*.{test,spec}.tsx` → `jsdom` via `environmentMatchGlobs`.
 * Browser/RTL helpers therefore load only when `document` exists.
 */
const isJsdomEnvironment = typeof document !== "undefined";

if (isJsdomEnvironment) {
  await import("@testing-library/jest-dom/vitest");
  const { cleanup } = await import("@testing-library/react");

  // RTL auto-cleanup only registers when Vitest globals are enabled; this config
  // runs without globals, so unmount explicitly. Otherwise components rendered by
  // render()/renderHook() stay mounted past environment teardown and React's
  // pending scheduler work throws "window is not defined" (flaky CI failures).
  afterEach(() => {
    cleanup();
  });
}
