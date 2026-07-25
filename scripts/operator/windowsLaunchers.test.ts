import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const LAUNCHERS = [
  "run-capture-restart-smoke.ps1",
  "run-capture-reconnect-smoke.ps1",
  "audit-latest-capture.ps1",
  "run-6h-capture.ps1",
  "run-8h-capture.ps1",
] as const;

describe("Windows PowerShell operator launchers", () => {
  for (const launcher of LAUNCHERS) {
    it(`${launcher} remains a thin npx tsx forwarder`, () => {
      const source = readFileSync(join(process.cwd(), launcher), "utf8");
      expect(source).toContain("npx tsx scripts/operator/");
      expect(source).toContain("exit $LASTEXITCODE");
      expect(source).not.toContain("Start-Job");
      expect(source).not.toMatch(/Get-ChildItem.*LastWriteTime/);
    });
  }

  it("eight-hour launcher requires authorization parameters", () => {
    const source = readFileSync(join(process.cwd(), "run-8h-capture.ps1"), "utf8");
    expect(source).toContain("AuthorizedByRestartSmokeRunDir");
    expect(source).toContain("AuthorizedByReconnectSmokeRunDir");
    expect(source).toContain("--authorized-by-restart-smoke-run-dir");
    expect(source).toContain("--authorized-by-reconnect-smoke-run-dir");
    expect(source).not.toMatch(/-Force|-SkipGate|--force|--skip-gate/);
  });
});
