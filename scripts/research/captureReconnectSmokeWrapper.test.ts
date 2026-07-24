import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * M12.1H content-level regression tests for run-capture-reconnect-smoke.ps1.
 * These assert wrapper contracts without requiring PowerShell or live Kalshi.
 */
const wrapperPath = join(process.cwd(), "run-capture-reconnect-smoke.ps1");
const wrapper = readFileSync(wrapperPath, "utf8");

describe("run-capture-reconnect-smoke.ps1 reconnect validation wrapper", () => {
  it("calls the dedicated reconnect validation capture script", () => {
    expect(wrapper).toContain("scripts/live/runReconnectValidationCapture.ts");
    expect(wrapper).not.toContain("scripts/live/runForwardQuoteCapture.ts");
  });

  it("bounds duration to 15-20 minutes and refuses eight-hour captures", () => {
    expect(wrapper).toContain("$smokeDurationMin = 15");
    expect(wrapper).toContain("$smokeDurationMax = 20");
    expect(wrapper).toContain("DurationMinutes must be between");
    expect(wrapper).toContain("Refusing to start an eight-hour capture");
    expect(wrapper).toContain("$DurationMinutes -ge 480");
    expect(wrapper).not.toMatch(/--duration-minutes\s+480/);
  });

  it("loads the canonical profile via --write-canonical-profile (no duplicated workload literals)", () => {
    expect(wrapper).toContain("--write-canonical-profile");
    expect(wrapper).toContain("[System.IO.Path]::GetTempPath()");
    expect(wrapper).toContain("Get-Content -Raw -Encoding UTF8 $profilePath");
    expect(wrapper).toContain("$captureProfile");
    expect(wrapper).toContain("--series $captureProfile.series");
    expect(wrapper).toContain("--max-markets $captureProfile.maxMarkets");
    expect(wrapper).toContain(
      "--top-of-book-throttle-ms $captureProfile.topOfBookThrottleMs",
    );
    expect(wrapper).toContain("$captureProfile.captureBtcSpot");
    expect(wrapper).toContain("$captureProfile.wsWatchdogEnabled");
    // Must not hardcode the non-canonical maxMarkets=3 workload.
    expect(wrapper).not.toMatch(/--max-markets\s+3\b/);
    expect(wrapper).not.toMatch(/--series\s+KXBTC15M\b/);
    expect(wrapper).not.toMatch(/--top-of-book-throttle-ms\s+1000\b/);
  });

  it("validates the canonical profile before capture startup", () => {
    const validationIndex = wrapper.indexOf("Canonical capture profile is invalid");
    const preflightIndex = wrapper.indexOf("--assert-no-active-capture");
    const captureIndex = wrapper.indexOf("runReconnectValidationCapture.ts");
    expect(validationIndex).toBeGreaterThan(-1);
    expect(preflightIndex).toBeGreaterThan(-1);
    expect(captureIndex).toBeGreaterThan(-1);
    expect(validationIndex).toBeLessThan(preflightIndex);
    expect(validationIndex).toBeLessThan(captureIndex);
  });

  it("invokes the restart gate via npx tsx with named flags (not npm run)", () => {
    expect(wrapper).toContain(
      "npx tsx scripts/research/evaluateCaptureRestartGate.ts",
    );
    expect(wrapper).toContain('--capture-run-dir "$runDir"');
    expect(wrapper).toContain("--expected-duration-minutes $DurationMinutes");
    // The broken Windows PowerShell shape that stripped option names.
    expect(wrapper).not.toContain("npm run research:capture-restart-gate");
    expect(wrapper).not.toMatch(
      /evaluateCaptureRestartGate\.ts\s+\$runDir\s+\$DurationMinutes/,
    );
  });

  it("identifies the exact run from stdout and never falls back to newest directory", () => {
    expect(wrapper).toContain('Where-Object { $_ -match \'"runId"\' }');
    expect(wrapper).toContain("Never fall back to");
    expect(wrapper).not.toMatch(/Get-ChildItem.*Sort-Object.*LastWriteTime/);
  });

  it("uses six fail-closed steps including exact-run restart gate and post-run preflight", () => {
    for (const step of [
      "Step 1/6",
      "Step 2/6",
      "Step 3/6",
      "Step 4/6",
      "Step 5/6",
      "Step 6/6",
    ]) {
      expect(wrapper).toContain(step);
    }
    expect(wrapper).toContain("--assert-no-active-capture");
    expect(wrapper).toContain('Join-Path $runDir "capture-run-status.json"');
    expect(wrapper).toContain('Join-Path $runDir "capture-health.json"');
    expect(wrapper).toContain('Join-Path $runDir "capture-health-audit.json"');
    expect(wrapper).toContain("Get-Content -Raw -Encoding UTF8 $statusPath");
    expect(wrapper).toContain("Get-Content -Raw -Encoding UTF8 $healthPath");
    expect(wrapper).toContain("Get-Content -Raw -Encoding UTF8 $auditPath");
    expect(wrapper).toContain("evaluateReconnectSmokeGate.ts");
    expect(wrapper).toContain("--run-id $runId");
    expect(wrapper).toContain('--run-dir "$runDir"');
    expect(wrapper).toContain("--capture-exit-code $captureExitCode");
    expect(wrapper).toContain("--audit-exit-code $auditExitCode");
    expect(wrapper).toContain("--restart-gate-exit-code $restartGateExitCode");
    expect(wrapper).toContain(
      "--post-run-preflight-exit-code $postRunPreflightExitCode",
    );
    expect(wrapper).toContain("--lock-present $lockPresentArg");
    expect(wrapper).toContain('Join-Path $captureRoot "capture.lock"');
    expect(wrapper).toContain("Test-Path $lockPath");
    expect(wrapper).toContain("RECONNECT GATE PASSED");
    expect(wrapper).toContain("RECONNECT GATE FAILED");
    expect(wrapper).toContain("exit 1");
  });

  it("runs post-run preflight and lock check in finally after capture attempt", () => {
    expect(wrapper).toContain("finally {");
    expect(wrapper).toContain("if ($captureAttempted)");
    expect(wrapper).toContain("$primaryFailure");
    expect(wrapper).toContain("capture-lifecycle.jsonl");
    expect(wrapper).not.toMatch(/Remove-Item.*capture\.lock/);
    expect(wrapper).not.toMatch(/Get-ChildItem.*Sort-Object.*LastWriteTime/);
  });

  it("audits the exact run directory and never starts an eight-hour capture", () => {
    expect(wrapper).toContain("buildCaptureHealthAudit.ts --capture-run-dir");
    expect(wrapper).toContain('--capture-run-dir "$runDir"');
    expect(wrapper).not.toMatch(/--duration-minutes\s+480/);
    expect(wrapper).toContain("Refusing to start an eight-hour capture");
    expect(wrapper).toContain("never starts an eight-hour capture");
  });
});
