import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * M12.1F hotfix regression tests for run-capture-restart-smoke.ps1.
 *
 * Windows PowerShell 5.1 mangled the canonical profile when it traveled
 * through captured native stdout into ConvertFrom-Json (the opening "{" was
 * lost). The wrapper must read the profile from a temporary UTF-8 JSON file
 * written by --write-canonical-profile instead. These are content-level
 * assertions so they run on any CI host without requiring PowerShell 7.
 */
const wrapperPath = join(process.cwd(), "run-capture-restart-smoke.ps1");
const wrapper = readFileSync(wrapperPath, "utf8");

describe("run-capture-restart-smoke.ps1 canonical profile transport", () => {
  it("no longer parses --print-canonical-profile stdout with ConvertFrom-Json", () => {
    expect(wrapper).not.toContain("--print-canonical-profile");
    expect(wrapper).not.toMatch(/\$profileJson/);
  });

  it("writes the profile to a generated temporary file via --write-canonical-profile", () => {
    expect(wrapper).toContain("--write-canonical-profile");
    expect(wrapper).toContain("[System.IO.Path]::GetTempPath()");
    expect(wrapper).toContain('[guid]::NewGuid().ToString("N")');
  });

  it("reads the profile file with Get-Content -Raw as UTF-8", () => {
    expect(wrapper).toMatch(/Get-Content -Raw -Encoding UTF8 \$profilePath/);
  });

  it("removes the temporary profile file in a finally block", () => {
    expect(wrapper).toMatch(
      /finally\s*\{\s*Remove-Item \$profilePath -Force -ErrorAction SilentlyContinue\s*\}/,
    );
  });

  it("uses $captureProfile and never shadows $profile / $PROFILE", () => {
    expect(wrapper).toContain("$captureProfile");
    expect(wrapper).not.toMatch(/\$profile\b/i);
  });

  it("fails on a nonzero write exit code and a missing profile file", () => {
    expect(wrapper).toContain(
      'throw "Could not write the canonical capture profile (exit code $LASTEXITCODE)."',
    );
    expect(wrapper).toContain(
      'throw "Canonical capture profile file was not created."',
    );
  });

  it("validates required profile fields before the capture-start preflight", () => {
    const requiredFields = [
      "series",
      "maxMarkets",
      "topOfBookThrottleMs",
      "captureBtcSpot",
      "wsWatchdogEnabled",
      "priceRepresentation",
      "smokeDurationMinutesMin",
      "smokeDurationMinutesMax",
      "eightHourDurationMinutes",
    ];
    for (const field of requiredFields) {
      expect(wrapper).toContain(`$captureProfile.${field}`);
    }

    const validationIndex = wrapper.indexOf("Canonical capture profile is invalid");
    const preflightIndex = wrapper.indexOf("--assert-no-active-capture");
    const captureIndex = wrapper.indexOf("runForwardQuoteCapture.ts");
    expect(validationIndex).toBeGreaterThan(-1);
    expect(preflightIndex).toBeGreaterThan(-1);
    expect(captureIndex).toBeGreaterThan(-1);
    expect(validationIndex).toBeLessThan(preflightIndex);
    expect(validationIndex).toBeLessThan(captureIndex);
  });

  it("does not duplicate canonical profile values in PowerShell", () => {
    // The workload values must come from the TypeScript profile object, not
    // from literals in the wrapper (duration bounds included).
    expect(wrapper).not.toMatch(/KXBTC15M/);
    expect(wrapper).toContain("--series $captureProfile.series");
    expect(wrapper).toContain("--max-markets $captureProfile.maxMarkets");
    expect(wrapper).toContain(
      "--top-of-book-throttle-ms $captureProfile.topOfBookThrottleMs",
    );
    expect(wrapper).toContain("$captureProfile.smokeDurationMinutesMin");
    expect(wrapper).toContain("$captureProfile.smokeDurationMinutesMax");
  });

  it("preserves all five smoke steps, exact-run auditing, and combined failure exit", () => {
    for (const step of ["Step 1/5", "Step 2/5", "Step 3/5", "Step 4/5", "Step 5/5"]) {
      expect(wrapper).toContain(step);
    }
    expect(wrapper).toContain('--capture-run-dir "$runDir"');
    expect(wrapper).toContain("$failedSteps");
    expect(wrapper).toContain("RESTART GATE FAILED");
    expect(wrapper).toContain("exit 1");
  });

  it("identifies the exact run from stdout even when captureExitCode is nonzero", () => {
    // A finalized authentication-failure still emits runId JSON; the wrapper
    // must not throw "Could not identify the capture run" and must not fall
    // back to newest-directory selection.
    expect(wrapper).toContain('Where-Object { $_ -match \'"runId"\' }');
    expect(wrapper).toContain("capture exit code: $captureExitCode");
    expect(wrapper).toContain("if ($captureExitCode -ne 0)");
    expect(wrapper).toContain("restart will be denied");
    expect(wrapper).not.toMatch(/Get-ChildItem.*Sort-Object.*LastWriteTime/);
    expect(wrapper).toContain("Never fall back to");
    expect(wrapper).toContain('if ($captureExitCode -ne 0) { $failedSteps += "capture ($captureExitCode)" }');
  });
});
