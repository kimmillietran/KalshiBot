import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { FORWARD_CAPTURE_READINESS_SCHEMA_VERSION } from "@/lib/data/research/forwardCaptureReadiness";
import { readBtcSpotCoverage } from "@/lib/data/research/strategyEvaluationReadiness/loadStrategyEvaluationInputs";
import type { StrategyEvaluationLoadedInputs } from "@/lib/data/research/strategyEvaluationReadiness/strategyEvaluationReadinessTypes";

import { runForwardCaptureReadinessCommand } from "./buildForwardCaptureReadiness";
import {
  mapCommandError,
  runStrategyEvaluationReadinessCommand,
} from "./buildStrategyEvaluationReadiness";

const GENERATED_AT = "2026-07-10T20:00:00.000Z";
const OUTPUT_PATH = "data/research-results/strategy-evaluation-readiness.json";
const HTML_PATH = "data/reports/strategy-evaluation-readiness.html";
const FCR_PATH = "data/research-results/forward-capture-readiness.json";

function createCommandIo(files: Record<string, string>) {
  const normalized = Object.fromEntries(
    Object.entries(files).map(([path, content]) => [path.replace(/\\/g, "/"), content]),
  );
  const directories = new Set<string>();
  for (const path of Object.keys(normalized)) {
    const parts = path.split("/");
    for (let index = 1; index < parts.length; index += 1) {
      directories.add(parts.slice(0, index).join("/"));
    }
  }

  let stdout = "";
  let stderr = "";

  return {
    io: {
      readFile: (path: string) => normalized[path.replace(/\\/g, "/")] ?? "",
      fileExists: (path: string) => {
        const normalizedPath = path.replace(/\\/g, "/");
        return normalizedPath in normalized || directories.has(normalizedPath);
      },
      readdir: (path: string) => {
        const prefix = `${path.replace(/\\/g, "/").replace(/\/$/, "")}/`;
        const children = new Set<string>();
        for (const filePath of Object.keys(normalized)) {
          if (!filePath.startsWith(prefix)) {
            continue;
          }
          const child = filePath.slice(prefix.length).split("/")[0];
          if (child) {
            children.add(child);
          }
        }
        return [...children];
      },
      isDirectory: (path: string) => directories.has(path.replace(/\\/g, "/")),
      writeStdout: (text: string) => {
        stdout += text;
      },
      writeStderr: (text: string) => {
        stderr += text;
      },
      writeFile: (path: string, data: string) => {
        normalized[path.replace(/\\/g, "/")] = data;
      },
      mkdirSync: () => undefined,
    },
    files: normalized,
    getStdout: () => stdout,
    getStderr: () => stderr,
  };
}

function createFsIo(_root: string) {
  return {
    readFile: (path: string) => readFileSync(path, "utf8"),
    fileExists: (path: string) => existsSync(path),
    readdir: (path: string) => {
      try {
        return readdirSync(path);
      } catch {
        return [];
      }
    },
    isDirectory: (path: string) => {
      try {
        return statSync(path).isDirectory();
      } catch {
        return false;
      }
    },
    writeStdout: (_text: string) => undefined,
    writeStderr: (_text: string) => undefined,
    writeFile: (path: string, data: string) => {
      writeFileSync(path, data, "utf8");
    },
    mkdirSync: (path: string, options?: { recursive?: boolean }) => {
      mkdirSync(path, options);
    },
  };
}

function writeCaptureRun(input: {
  quotesDir: string;
  runId: string;
  generatedAt: string;
  receivedAtLocal: string;
}) {
  const runDir = join(input.quotesDir, input.runId);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(
    join(runDir, "capture-health.json"),
    JSON.stringify({
      runId: input.runId,
      generatedAt: input.generatedAt,
      verdict: "capture-spike-success",
      config: { series: "KXBTC15M", durationSeconds: 3600, maxMarkets: 1, dryRun: false },
      marketDiscovery: { selectedMarketTickers: ["KXBTC15M-TEST"] },
      capture: { messagesReceived: 1 },
      orderbook: {
        validTopOfBookRecords: 1,
        sequenceGapCount: 0,
        reconnectCount: 0,
        marketsWithValidBook: 1,
      },
      btcSpot: { status: "enabled", recordsCaptured: 1 },
    }),
    "utf8",
  );
  writeFileSync(
    join(runDir, "top-of-book.jsonl"),
    `${JSON.stringify({
      runId: input.runId,
      marketTicker: "KXBTC15M-TEST",
      eventTicker: "KXBTC15M-TEST",
      seriesTicker: "KXBTC15M",
      receivedAtLocal: input.receivedAtLocal,
      bookState: "valid",
      yesBestBidCents: 45,
      yesBestAskCents: 47,
      noBestBidCents: 53,
      noBestAskCents: 55,
      yesSpreadCents: 2,
      noSpreadCents: 2,
      btcSpotPriceUsd: 100000,
      rawMessageType: "orderbook_snapshot",
    })}\n`,
    "utf8",
  );
  writeFileSync(join(runDir, "btc-spot.jsonl"), `${JSON.stringify({
    runId: input.runId,
    receivedAtLocal: input.receivedAtLocal,
    priceUsd: 100000,
  })}\n`, "utf8");
  writeFileSync(join(runDir, "raw-messages.jsonl"), '{"channel":"orderbook"}\n', "utf8");
}

function buildLoadedInputsFromArtifact(
  artifact: Record<string, unknown>,
  captureFallback: StrategyEvaluationLoadedInputs["captureFallback"] = null,
): StrategyEvaluationLoadedInputs {
  return {
    forwardCaptureReadiness: {
      path: FCR_PATH,
      generatedAt: typeof artifact.generatedAt === "string" ? artifact.generatedAt : null,
      parsed: artifact,
      malformed: false,
    },
    staticParityScan: null,
    bidSizeCoverageAudit: null,
    bidOnlyCandidateLifecycle: null,
    captureQualityValidation: null,
    validBookCoverageInvestigation: null,
    captureFallback,
    warnings: [],
    artifactValidation: {
      identities: [],
      staleArtifacts: [],
      mismatchedArtifacts: [],
      malformedArtifacts: [],
      missingArtifacts: [],
      warnings: [],
      usablePaths: [FCR_PATH],
    },
  };
}

describe("runStrategyEvaluationReadinessCommand", () => {
  it("normalizes argv, consumes forward-capture-readiness, and writes outputs", () => {
    const harness = createCommandIo({
      [FCR_PATH]: JSON.stringify({
        schemaVersion: FORWARD_CAPTURE_READINESS_SCHEMA_VERSION,
        generatedAt: GENERATED_AT,
        analysisScope: "aggregate",
        aggregates: {
          runCount: 2,
          totalDurationMinutes: 600,
          daysCovered: 2,
          marketCount: 4,
          topOfBookRecordCount: 10_000,
          btcSpotJoinCoverageShare: 1,
          btcSpotCoverageShare: 1,
        },
        summary: {
          overallVerdict: "partially-ready",
          recommendedNextAction: "keep-capturing",
          familyReadiness: [],
        },
      }),
    });

    const exitCode = runStrategyEvaluationReadinessCommand(
      ["--output", OUTPUT_PATH, "--html-output", HTML_PATH],
      harness.io,
      { generatedAt: GENERATED_AT, evaluatedAt: GENERATED_AT },
    );

    expect(exitCode).toBe(0);
    expect(harness.files[OUTPUT_PATH]).toBeDefined();
    expect(harness.files[HTML_PATH]).toContain("Strategy Evaluation");
    const payload = JSON.parse(harness.getStdout()) as {
      overallVerdict: string;
      inputArtifactsUsed: string[];
    };
    expect(payload.inputArtifactsUsed).toContain(FCR_PATH);
    expect(typeof payload.overallVerdict).toBe("string");
  });

  it("produces fail-closed report with exit 0 for missing selected-run path", () => {
    const harness = createCommandIo({});
    const exitCode = runStrategyEvaluationReadinessCommand(
      [
        "--capture-run-dir",
        "data/live-capture/forward-quotes/missing-run",
        "--output",
        OUTPUT_PATH,
        "--html-output",
        HTML_PATH,
      ],
      harness.io,
      { generatedAt: GENERATED_AT, evaluatedAt: GENERATED_AT },
    );

    expect(exitCode).toBe(0);
    expect(harness.getStderr()).toBe("");
    expect(harness.files[OUTPUT_PATH]).toBeDefined();
    expect(harness.files[HTML_PATH]).toBeDefined();
    const report = JSON.parse(harness.files[OUTPUT_PATH]!) as {
      summary: { overallVerdict: string };
    };
    expect(report.summary.overallVerdict).toBe("not-ready-no-capture");
    const stdout = JSON.parse(harness.getStdout()) as { overallVerdict: string };
    expect(stdout.overallVerdict).toBe("not-ready-no-capture");
  });

  it("maps IO write failures to exit 1 with stderr", () => {
    const harness = createCommandIo({
      [FCR_PATH]: JSON.stringify({
        schemaVersion: FORWARD_CAPTURE_READINESS_SCHEMA_VERSION,
        generatedAt: GENERATED_AT,
        aggregates: { runCount: 0, daysCovered: 0, totalDurationMinutes: 0 },
        summary: { overallVerdict: "not-ready-no-data", familyReadiness: [] },
      }),
    });
    harness.io.writeFile = () => {
      throw new Error("disk full");
    };

    const exitCode = runStrategyEvaluationReadinessCommand(
      ["--output", OUTPUT_PATH, "--html-output", HTML_PATH],
      harness.io,
      { generatedAt: GENERATED_AT, evaluatedAt: GENERATED_AT },
    );

    expect(exitCode).toBe(1);
    expect(harness.getStderr()).toContain("disk full");
    expect(harness.files[OUTPUT_PATH]).toBeUndefined();
  });

  it("mapCommandError returns Error.message", () => {
    expect(mapCommandError(new Error("boom"))).toBe("boom");
    expect(mapCommandError("x")).toBe("Strategy evaluation readiness gate failed.");
  });

  it("uses explicit join coverage, not conflicting cadence or legacy alias values", () => {
    const harness = createCommandIo({
      [FCR_PATH]: JSON.stringify({
        schemaVersion: FORWARD_CAPTURE_READINESS_SCHEMA_VERSION,
        generatedAt: GENERATED_AT,
        analysisScope: "aggregate",
        aggregates: {
          runCount: 2,
          totalDurationMinutes: 600,
          daysCovered: 2,
          marketCount: 4,
          topOfBookRecordCount: 100_000,
          btcSpotJoinCoverageShare: 1,
          btcSpotCoverageShare: 0.094,
          btcSpotStreamCadenceRatio: 0.094,
        },
        summary: {
          overallVerdict: "partially-ready",
          recommendedNextAction: "keep-capturing",
          familyReadiness: [],
        },
      }),
    });

    const exitCode = runStrategyEvaluationReadinessCommand(
      ["--output", OUTPUT_PATH, "--html-output", HTML_PATH],
      harness.io,
      { generatedAt: GENERATED_AT, evaluatedAt: GENERATED_AT },
    );

    expect(exitCode).toBe(0);
    const report = JSON.parse(harness.files[OUTPUT_PATH]!) as {
      dimensions: Array<{ id: string; value: number | null; rationale: string }>;
    };
    const btcDimension = report.dimensions.find((entry) => entry.id === "btcSpotCoverage");
    expect(btcDimension).toBeDefined();
    expect(btcDimension?.value).toBe(1);
    expect(btcDimension?.rationale).toMatch(/100%/);
    expect(btcDimension?.value).not.toBe(0.094);
  });
});

describe("readBtcSpotCoverage legacy alias fail-closed", () => {
  it("uses explicit join coverage when present", () => {
    const coverage = readBtcSpotCoverage(
      buildLoadedInputsFromArtifact({
        schemaVersion: FORWARD_CAPTURE_READINESS_SCHEMA_VERSION,
        aggregates: {
          btcSpotJoinCoverageShare: 1,
          btcSpotCoverageShare: 0.094,
          btcSpotStreamCadenceRatio: 0.094,
        },
      }),
    );
    expect(coverage).toBe(1);
  });

  it("does not treat legacy alias-only cadence as join coverage", () => {
    const coverage = readBtcSpotCoverage(
      buildLoadedInputsFromArtifact({
        generatedAt: "2026-06-01T00:00:00.000Z",
        aggregates: {
          btcSpotCoverageShare: 0.95,
        },
      }),
    );
    expect(coverage).toBeNull();
  });

  it("recomputes join coverage from capture fallback when legacy alias is ambiguous", () => {
    const coverage = readBtcSpotCoverage(
      buildLoadedInputsFromArtifact(
        {
          aggregates: { btcSpotCoverageShare: 0.095 },
        },
        {
          runCount: 1,
          totalDurationMinutes: 60,
          daysCovered: 1,
          marketCount: 1,
          topOfBookRecordCount: 100,
          btcSpotCoverageShare: 1,
          bidPairWithSizeShare: null,
          bidSizeCoverageShare: null,
        },
      ),
    );
    expect(coverage).toBe(1);
  });

  it("fails closed when legacy alias has no capture fallback", () => {
    const coverage = readBtcSpotCoverage(
      buildLoadedInputsFromArtifact({
        aggregates: { btcSpotCoverageShare: 0.95 },
      }),
    );
    expect(coverage).toBeNull();
  });
});

describe("same-pass shared filesystem producer/consumer", () => {
  it("strategy readiness consumes regenerated forward-readiness from the same path", () => {
    const root = mkdtempSync(join(tmpdir(), "m12-2-same-pass-"));
    try {
      const researchDir = join(root, "data", "research-results");
      const reportsDir = join(root, "data", "reports");
      const quotesDir = join(root, "data", "live-capture", "forward-quotes");
      mkdirSync(researchDir, { recursive: true });
      mkdirSync(reportsDir, { recursive: true });
      mkdirSync(quotesDir, { recursive: true });

      const fcrPath = join(researchDir, "forward-capture-readiness.json");
      const strategyPath = join(researchDir, "strategy-evaluation-readiness.json");
      const strategyHtmlPath = join(reportsDir, "strategy-evaluation-readiness.html");
      const forwardHtmlPath = join(reportsDir, "forward-capture-readiness.html");
      const io = createFsIo(root);

      writeFileSync(
        fcrPath,
        JSON.stringify({
          generatedAt: "2026-07-01T00:00:00.000Z",
          aggregates: {
            daysCovered: 1,
            runCount: 1,
            totalDurationMinutes: 60,
            marketCount: 1,
            topOfBookRecordCount: 10,
            btcSpotCoverageShare: 0.09,
          },
          summary: {
            overallVerdict: "not-ready-too-short",
            recommendedNextAction: "keep-capturing",
            familyReadiness: [],
          },
        }),
        "utf8",
      );

      writeCaptureRun({
        quotesDir,
        runId: "day-one-run",
        generatedAt: "2026-07-09T08:00:00.000Z",
        receivedAtLocal: "2026-07-09T08:00:00.000Z",
      });
      writeCaptureRun({
        quotesDir,
        runId: "day-two-run",
        generatedAt: "2026-07-10T08:00:00.000Z",
        receivedAtLocal: "2026-07-10T08:00:00.000Z",
      });

      const forwardExit = runForwardCaptureReadinessCommand(
        [
          "--forward-quotes-dir",
          quotesDir,
          "--output",
          fcrPath,
          "--html-output",
          forwardHtmlPath,
        ],
        io,
        { generatedAt: "2026-07-10T12:45:00.000Z" },
      );
      expect(forwardExit).toBe(0);

      const regenerated = JSON.parse(readFileSync(fcrPath, "utf8")) as {
        schemaVersion: string;
        generatedAt: string;
        aggregates: {
          daysCovered: number;
          btcSpotJoinCoverageShare: number | null;
          btcSpotStreamCadenceRatio: number | null;
        };
      };
      expect(regenerated.schemaVersion).toBe(FORWARD_CAPTURE_READINESS_SCHEMA_VERSION);
      expect(regenerated.generatedAt).toBe("2026-07-10T12:45:00.000Z");
      expect(regenerated.aggregates.daysCovered).toBe(2);
      expect(regenerated.aggregates.btcSpotJoinCoverageShare).toBe(1);

      const strategyExit = runStrategyEvaluationReadinessCommand(
        [
          "--forward-quotes-dir",
          quotesDir,
          "--forward-capture-readiness",
          fcrPath,
          "--output",
          strategyPath,
          "--html-output",
          strategyHtmlPath,
        ],
        io,
        { generatedAt: "2026-07-10T12:46:00.000Z", evaluatedAt: "2026-07-10T12:46:00.000Z" },
      );
      expect(strategyExit).toBe(0);

      const strategyReport = JSON.parse(readFileSync(strategyPath, "utf8")) as {
        dimensions: Array<{ id: string; value: number | null }>;
        summary: { inputArtifactsUsed: string[] };
      };
      const days = strategyReport.dimensions.find((entry) => entry.id === "captureDays");
      const btc = strategyReport.dimensions.find((entry) => entry.id === "btcSpotCoverage");
      expect(days?.value).toBe(2);
      expect(btc?.value).toBe(1);
      const used = strategyReport.summary.inputArtifactsUsed.map((path) =>
        path.replace(/\\/g, "/"),
      );
      expect(used).toContain(fcrPath.replace(/\\/g, "/"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
