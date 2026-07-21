import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// RTL auto-cleanup only registers when Vitest globals are enabled; this config
// runs without globals, so unmount explicitly. Otherwise components rendered by
// render()/renderHook() stay mounted past environment teardown and React's
// pending scheduler work throws "window is not defined" (flaky CI failures).
afterEach(() => {
  cleanup();
});
