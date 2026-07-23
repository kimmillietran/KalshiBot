import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * M12.1G content-level regression tests for run-capture-reconnect-smoke.ps1.
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

  it("identifies the exact run from stdout and never falls back to newest directory", () => {
    expect(wrapper).toContain('Where-Object { $_ -match \'"runId"\' }');
    expect(wrapper).toContain("Never fall back to");
    expect(wrapper).not.toMatch(/Get-ChildItem.*Sort-Object.*LastWriteTime/);
  });

  it("requires reconnectCount, recovery success, and non-terminal WebSocket failure", () => {
    expect(wrapper).toContain("reconnectCount -lt 1");
    expect(wrapper).toContain("wsRecoverySuccessCount -lt 1");
    expect(wrapper).toContain("terminalWebSocketFailure -eq $true");
    expect(wrapper).toContain("authHeaderGenerationCount -lt 2");
    expect(wrapper).toContain("RECONNECT GATE PASSED");
    expect(wrapper).toContain("RECONNECT GATE FAILED");
  });

  it("audits the exact run directory from capture-health.json", () => {
    expect(wrapper).toContain('Join-Path $runDir "capture-health.json"');
    expect(wrapper).toContain("buildCaptureHealthAudit.ts --capture-run-dir");
    expect(wrapper).toContain('--capture-run-dir "$runDir"');
  });
});
