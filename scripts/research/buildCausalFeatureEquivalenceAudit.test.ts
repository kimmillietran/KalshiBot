import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createCalibrationFadeForwardValidationIo } from "@/lib/data/research/calibrationFadeForwardValidation";

import { runCausalFeatureEquivalenceAuditCommand } from "./buildCausalFeatureEquivalenceAudit";

const BASE_MS = Date.parse("2026-08-04T10:00:00.000Z");
const HYPOTHESIS_CONFIG =
  "config/research/hypotheses/high-volatility-late-market-calibration-fade-v1.json";
const EVIDENCE_PATH =
  "config/research/audits/calibration-fade-causal-feature-equivalence-v1.json";

function isoAt(offsetMs: number): string {
  return new Date(BASE_MS + offsetMs).toISOString();
}

function writeCaptureRun(runDir: string, runId: string): void {
  const btcLines: string[] = [];
  for (let index = 0; index < 20 * 60; index += 1) {
    const offsetMs = index * 1000;
    const minute = Math.floor(offsetMs / 60_000);
    btcLines.push(
      JSON.stringify({
        receivedAtLocal: isoAt(offsetMs),
        exchangeTimestampMs: BASE_MS + offsetMs,
        priceUsd: 100_000 + (minute % 2 === 0 ? 1 : -1) * (1500 + minute * 20),
      }),
    );
  }
  writeFileSync(join(runDir, "btc-spot.jsonl"), btcLines.join("\n"));
  writeFileSync(
    join(runDir, "market-metadata.jsonl"),
    JSON.stringify({ marketTicker: "MKT-0", closeTime: isoAt(1_800_000) }),
  );
  writeFileSync(
    join(runDir, "top-of-book.jsonl"),
    [
      JSON.stringify({
        marketTicker: "MKT-0",
        seriesTicker: "KXBTC15M",
        receivedAtLocal: isoAt(900_000),
        exchangeTimestampMs: BASE_MS + 900_000,
        bookState: "valid",
        yesBestBidCents: 48,
        yesBestAskCents: 52,
        noBestBidCents: 46,
        noBestAskCents: 50,
      }),
      JSON.stringify({
        marketTicker: "MKT-0",
        seriesTicker: "KXBTC15M",
        receivedAtLocal: isoAt(901_000),
        exchangeTimestampMs: BASE_MS + 901_000,
        bookState: "valid",
        yesBestBidCents: 47,
        yesBestAskCents: 53,
        noBestBidCents: 45,
        noBestAskCents: 51,
      }),
    ].join("\n"),
  );
  writeFileSync(
    join(runDir, "capture-health.json"),
    JSON.stringify({
      runId,
      config: { durationSeconds: 3600 },
      connection: {
        captureEndReason: "duration-complete",
        terminalFailureReason: null,
        completedNormally: true,
      },
      orderbook: { validTopOfBookRecords: 2, reconnectCount: 0, sequenceGapCount: 0 },
    }),
  );

  const topPath = join(runDir, "top-of-book.jsonl");
  const btcPath = join(runDir, "btc-spot.jsonl");
  const topStat = statSync(topPath);
  const btcStat = statSync(btcPath);
  writeFileSync(
    join(runDir, "capture-health-audit.json"),
    JSON.stringify({
      selectedRunId: runId,
      captureRunDir: runDir,
      sourceRunIds: [runId],
      analysisVersion: "capture-health-audit-v1",
      inputArtifactIdentities: [
        {
          path: topPath,
          role: "top-of-book",
          sizeBytes: topStat.size,
          mtimeMs: topStat.mtimeMs,
          recordCount: 2,
        },
        {
          path: btcPath,
          role: "btc-spot",
          sizeBytes: btcStat.size,
          mtimeMs: btcStat.mtimeMs,
          recordCount: btcLines.length,
        },
      ],
      summary: {
        verdict: "capture-research-ready",
        recommendedNextAction: "proceed-offline-microstructure-research",
        runDurationSeconds: 3600,
        topOfBookCount: 2,
        btcSpotCount: btcLines.length,
        bookState: { validBookShare: 1, reconnectCount: 0, sequenceGapCount: 0 },
        btcJoin: { joinCoverageShare: 1 },
        continuity: { p90TopOfBookGapMs: 1000 },
      },
    }),
  );
}

describe("buildCausalFeatureEquivalenceAudit CLI", () => {
  it("requires --capture-run-dir", async () => {
    let stderr = "";
    const exitCode = await runCausalFeatureEquivalenceAuditCommand([], {
      writeStdout: () => undefined,
      writeStderr: (text) => {
        stderr += text;
      },
      writeFile: () => undefined,
      mkdirSync: () => undefined,
      fileExists: () => false,
      unlinkFile: () => undefined,
      renameFile: () => undefined,
    });
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/Missing required --capture-run-dir/);
  });

  it("runs acceptance against a synthetic selected run and publishes JSON+HTML", async () => {
    const root = mkdtempSync(join(tmpdir(), "cfea-cli-"));
    try {
      const runId = "2026-08-04T10-33-33-601Z-synthetic";
      const runDir = join(root, runId);
      const outDir = join(root, "out");
      mkdirSync(runDir, { recursive: true });
      mkdirSync(outDir, { recursive: true });
      writeCaptureRun(runDir, runId);

      const outputPath = join(outDir, "causal-feature-equivalence-audit.json");
      const htmlOutputPath = join(outDir, "causal-feature-equivalence-audit.html");

      let stdout = "";
      let stderr = "";
      const exitCode = await runCausalFeatureEquivalenceAuditCommand(
        [
          "--capture-run-dir",
          runDir,
          "--hypothesis-config",
          HYPOTHESIS_CONFIG,
          "--evidence",
          EVIDENCE_PATH,
          "--output",
          outputPath,
          "--html-output",
          htmlOutputPath,
        ],
        {
          writeStdout: (text) => {
            stdout += text;
          },
          writeStderr: (text) => {
            stderr += text;
          },
          writeFile: (path, data) => writeFileSync(path, data, "utf8"),
          mkdirSync: (path, options) => mkdirSync(path, options),
          fileExists: (path) => existsSync(path),
          unlinkFile: (path) => unlinkSync(path),
          renameFile: (from, to) => renameSync(from, to),
        },
        {
          generatedAt: "2026-08-05T12:00:00.000Z",
          auditIo: createCalibrationFadeForwardValidationIo(),
        },
      );

      expect(stderr).toBe("");
      expect(exitCode).toBe(0);
      expect(existsSync(outputPath)).toBe(true);
      expect(existsSync(htmlOutputPath)).toBe(true);
      const summary = JSON.parse(stdout) as {
        selectedRunId: string;
        verdict: string;
        recommendedNextAction: string;
      };
      expect(summary.selectedRunId).toBe(runId);
      // Evidence-driven: resolved historical no-gap-gate vs forward adjacent-gap enforcement.
      expect(summary.verdict).toBe("forward-validator-semantics-mismatch");
      expect(summary.recommendedNextAction).toBe(
        "correct-forward-validator-to-frozen-semantics",
      );

      const report = JSON.parse(readFileSync(outputPath, "utf8")) as {
        analysisScope: string;
        selectedRunId: string;
        verdict: string;
        historicalEvidenceStatus: string;
        nonClaims: string[];
      };
      expect(report.analysisScope).toBe("selected-run");
      expect(report.selectedRunId).toBe(runId);
      expect(report.historicalEvidenceStatus).toBe("proven");
      expect(report.verdict).toBe("forward-validator-semantics-mismatch");
      expect(report.nonClaims.join(" ")).toMatch(/No settlement/);
      expect(readFileSync(htmlOutputPath, "utf8")).toContain("Executive verdict");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("restores prior artifacts on controlled publication failure", async () => {
    const root = mkdtempSync(join(tmpdir(), "cfea-pubfail-"));
    try {
      const runId = "pub-fail-run";
      const runDir = join(root, runId);
      const outDir = join(root, "out");
      mkdirSync(runDir, { recursive: true });
      mkdirSync(outDir, { recursive: true });
      writeCaptureRun(runDir, runId);

      const outputPath = join(outDir, "causal-feature-equivalence-audit.json");
      const htmlOutputPath = join(outDir, "causal-feature-equivalence-audit.html");
      writeFileSync(outputPath, JSON.stringify({ prior: true }));
      writeFileSync(htmlOutputPath, "<html>prior</html>");

      let renameCount = 0;
      const exitCode = await runCausalFeatureEquivalenceAuditCommand(
        [
          "--capture-run-dir",
          runDir,
          "--hypothesis-config",
          HYPOTHESIS_CONFIG,
          "--evidence",
          EVIDENCE_PATH,
          "--output",
          outputPath,
          "--html-output",
          htmlOutputPath,
        ],
        {
          writeStdout: () => undefined,
          writeStderr: () => undefined,
          writeFile: (path, data) => writeFileSync(path, data, "utf8"),
          mkdirSync: (path, options) => mkdirSync(path, options),
          fileExists: (path) => existsSync(path),
          unlinkFile: (path) => unlinkSync(path),
          renameFile: (from, to) => {
            renameCount += 1;
            // Fail while committing the second final artifact so the publisher rolls back.
            if (renameCount === 4) {
              throw new Error("controlled publication failure");
            }
            renameSync(from, to);
          },
        },
        {
          generatedAt: "2026-08-05T12:00:00.000Z",
          auditIo: createCalibrationFadeForwardValidationIo(),
        },
      );

      expect(exitCode).toBe(1);
      expect(JSON.parse(readFileSync(outputPath, "utf8"))).toEqual({ prior: true });
      expect(readFileSync(htmlOutputPath, "utf8")).toBe("<html>prior</html>");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
