import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * M12.1I: reconnect PowerShell launcher is thin; contracts live in TypeScript.
 * Kept as a separate file so Windows CI can target reconnect regressions.
 */
const wrapper = readFileSync(
  join(process.cwd(), "run-capture-reconnect-smoke.ps1"),
  "utf8",
);
const ts = readFileSync(
  join(process.cwd(), "scripts/operator/runCaptureReconnectSmoke.ts"),
  "utf8",
);

describe("run-capture-reconnect-smoke.ps1 reconnect validation wrapper", () => {
  it("rejects JavaScript-style // line comments (PowerShell 5.1 runtime blocker)", () => {
    expect(wrapper).not.toMatch(/^\s*\/\//m);
  });

  it("delegates to the TypeScript reconnect smoke CLI", () => {
    expect(wrapper).toContain("scripts/operator/runCaptureReconnectSmoke.ts");
    expect(wrapper).not.toContain("scripts/live/runForwardQuoteCapture.ts");
  });
});

describe("reconnect smoke TypeScript SSoT", () => {
  it("calls the dedicated reconnect validation capture script", () => {
    expect(ts).toContain("scripts/live/runReconnectValidationCapture.ts");
    expect(ts).not.toContain("scripts/live/runForwardQuoteCapture.ts");
  });

  it("bounds duration to 15-20 minutes and refuses eight-hour captures", () => {
    expect(ts).toContain("RECONNECT_SMOKE_DURATION_MIN");
    expect(ts).toContain("RECONNECT_SMOKE_DURATION_MAX");
    expect(ts).toContain("DurationMinutes must be between");
    expect(ts).toContain("Refusing to start an eight-hour capture");
    expect(ts).toContain("durationMinutes >= 480");
    expect(ts).not.toMatch(/--duration-minutes",\s*"480"/);
  });

  it("loads the canonical profile without duplicated workload literals", () => {
    expect(ts).toContain("loadCanonicalCaptureProfile");
    expect(ts).toContain("buildCanonicalCaptureArgv(profile, durationMinutes)");
    expect(ts).not.toMatch(/--max-markets",\s*"3"/);
    expect(ts).not.toMatch(/--series",\s*"KXBTC15M"/);
  });

  it("invokes the restart gate with named flags", () => {
    expect(ts).toContain("evaluateCaptureRestartGate.ts");
    expect(ts).toContain("--capture-run-dir");
    expect(ts).toContain("--expected-duration-minutes");
    expect(ts).not.toContain("npm run research:capture-restart-gate");
  });

  it("identifies the exact run from stdout and never falls back to newest directory", () => {
    expect(ts).toContain("parseExactRunIdentityFromOutput");
    expect(ts).toContain("Never fall back");
    expect(ts).not.toMatch(/Get-ChildItem.*Sort-Object.*LastWriteTime/);
  });

  it("uses six fail-closed steps including post-run preflight", () => {
    for (const step of [
      "Step 1/6",
      "Step 2/6",
      "Step 3/6",
      "Step 4/6",
      "Step 5/6",
      "Step 6/6",
    ]) {
      expect(ts).toContain(step);
    }
    expect(ts).toContain("evaluateExactRunReconnectSmokeAcceptance");
    expect(ts).toContain("issueReconnectSmokeAuthorization");
    expect(ts).not.toContain("evaluateReconnectSmokeGate.ts");
    expect(ts).not.toContain("--write-authorization");
    expect(ts).toContain("RECONNECT GATE PASSED");
    expect(ts).toContain("RECONNECT GATE FAILED");
  });

  it("runs post-run preflight after capture attempt", () => {
    expect(ts).toContain("finally {");
    expect(ts).toContain("captureAttempted");
    expect(ts).toContain("capture-lifecycle.jsonl");
    expect(ts).not.toMatch(/unlinkSync\([^\)]*capture\.lock/);
  });
});
