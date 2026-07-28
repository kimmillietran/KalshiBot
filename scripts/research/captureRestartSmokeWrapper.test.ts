import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * M12.1I: PowerShell launchers are thin wrappers over TypeScript SSoT.
 * Content-level assertions remain host-agnostic (no PowerShell runtime).
 */
const restartWrapper = readFileSync(
  join(process.cwd(), "run-capture-restart-smoke.ps1"),
  "utf8",
);
const reconnectWrapper = readFileSync(
  join(process.cwd(), "run-capture-reconnect-smoke.ps1"),
  "utf8",
);
const restartTs = readFileSync(
  join(process.cwd(), "scripts/operator/runCaptureRestartSmoke.ts"),
  "utf8",
);
const reconnectTs = readFileSync(
  join(process.cwd(), "scripts/operator/runCaptureReconnectSmoke.ts"),
  "utf8",
);

describe("run-capture-restart-smoke.ps1 thin launcher", () => {
  it("delegates to TypeScript operator CLI", () => {
    expect(restartWrapper).toContain(
      "scripts/operator/runCaptureRestartSmoke.ts",
    );
    expect(restartWrapper).toContain("npx tsx");
    expect(restartWrapper).toContain("exit $LASTEXITCODE");
    expect(restartWrapper).not.toContain("Start-Job");
    expect(restartWrapper).not.toContain("Get-ChildItem");
  });
});

describe("runCaptureRestartSmoke.ts preserves M12.1F gate contracts", () => {
  it("uses canonical profile fields and five smoke steps", () => {
    expect(restartTs).toContain("loadCanonicalCaptureProfile");
    expect(restartTs).toContain("Step 1/5");
    expect(restartTs).toContain("Step 5/5");
    expect(restartTs).toContain("runForwardQuoteCapture.ts");
    expect(restartTs).toContain("buildCaptureHealthAudit.ts");
    expect(restartTs).toContain("buildBidSizeCoverageAudit.ts");
    expect(restartTs).toContain("buildCaptureHealthReconciliation.ts");
    expect(restartTs).toContain("evaluateCaptureRestartGate.ts");
    expect(restartTs).toContain("parseExactRunIdentityFromOutput");
    expect(restartTs).toContain("Never fall back");
    expect(restartTs).not.toMatch(/newest directory|LastWriteTime/i);
    expect(restartTs).toContain("RESTART GATE FAILED");
    expect(restartTs).toContain("FORBIDDEN_SKIP_GATE_FLAGS");
  });

  it("does not duplicate canonical workload literals in capture argv builder usage", () => {
    expect(restartTs).toContain("buildCanonicalCaptureArgv(profile, durationMinutes)");
    expect(restartTs).not.toMatch(/--series",\s*"KXBTC15M"/);
  });
});

describe("run-capture-reconnect-smoke.ps1 thin launcher", () => {
  it("delegates to TypeScript operator CLI", () => {
    expect(reconnectWrapper).toContain(
      "scripts/operator/runCaptureReconnectSmoke.ts",
    );
    expect(reconnectWrapper).toContain("npx tsx");
    expect(reconnectWrapper).toContain("exit $LASTEXITCODE");
  });
});

describe("runCaptureReconnectSmoke.ts preserves M12.1H / PR #41 contracts", () => {
  it("keeps reconnect validation path and fail-closed finally preflight", () => {
    expect(reconnectTs).toContain("runReconnectValidationCapture.ts");
    expect(reconnectTs).not.toContain("runForwardQuoteCapture.ts");
    expect(reconnectTs).toContain("RECONNECT_SMOKE_DURATION_MIN");
    expect(reconnectTs).toContain("RECONNECT_SMOKE_DURATION_MAX");
    expect(reconnectTs).toContain("Refusing to start an eight-hour capture");
    expect(reconnectTs).toContain("Step 1/6");
    expect(reconnectTs).toContain("Step 6/6");
    expect(reconnectTs).toContain("evaluateExactRunReconnectSmokeAcceptance");
    expect(reconnectTs).toContain("issueReconnectSmokeAuthorization");
    expect(reconnectTs).not.toContain("evaluateReconnectSmokeGate.ts");
    expect(reconnectTs).not.toContain("--write-authorization");
    expect(reconnectTs).toContain("finally");
    expect(reconnectTs).toContain("captureAttempted");
    expect(reconnectTs).not.toMatch(/Remove-Item.*capture\.lock|unlinkSync\(.*capture\.lock/);
    expect(reconnectTs).not.toMatch(/newest directory|LastWriteTime/i);
  });
});
