import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildExecutableConfirmationDesignReport } from "./buildExecutableConfirmationDesignReport";
import { evaluateExecutableConfirmationReadiness } from "./evaluateExecutableConfirmationReadiness";
import { loadExecutableConfirmationArtifacts } from "./loadExecutableConfirmationArtifacts";
import { serializeExecutableConfirmationDesignHtml } from "./serializeExecutableConfirmationDesignHtml";
import { serializeExecutableConfirmationDesignReport } from "./serializeExecutableConfirmationDesignReport";
import {
  DEFAULT_EXECUTABLE_CONFIRMATION_DESIGN_INPUT_PATHS,
  EXECUTABLE_CONFIRMATION_DESIGN_DISCLAIMER,
  FORBIDDEN_EXECUTABLE_CONFIRMATION_IMPORT_PREFIXES,
} from "./executableConfirmationDesignTypes";
import type { StaticParityCandidateSample } from "@/lib/data/research/staticParityScan/staticParityScanTypes";

const GENERATED_AT = "2026-07-10T12:00:00.000Z";
const OUTPUT_PATH = "data/research-results/executable-confirmation-design.json";
const HTML_PATH = "data/reports/executable-confirmation-design.html";

function buildMemoryIo(files: Record<string, string>) {
  return {
    readFile: (path: string) => files[path] ?? "",
    fileExists: (path: string) => path in files,
  };
}

function createCandidateSample(
  overrides: Partial<StaticParityCandidateSample> = {},
): StaticParityCandidateSample {
  return {
    timestamp: "2026-07-10T11:59:58.000Z",
    runId: "run-1",
    marketTicker: "KXBTC15M-26JUL101200-00",
    eventTicker: "KXBTC15M-26JUL101200",
    yesBidCents: 52,
    yesAskCents: null,
    noBidCents: 51,
    noAskCents: null,
    yesAskPlusNoAskCents: null,
    yesBidPlusNoBidCents: 103,
    bidSumCents: 103,
    bidOnlyEdgeCents: 3,
    grossEdgeCents: 3,
    estimatedNetEdgeCents: -1,
    availableSize: 5,
    minBidSizeContracts: 5,
    classification: "bid-only-buffer-adjusted-candidate",
    reason: "Bid sum exceeds parity threshold.",
    requiresExecutableConfirmation: true,
    ...overrides,
  };
}

function createStaticParityScanArtifact(
  candidates: StaticParityCandidateSample[],
  feeBufferCents = 4,
): string {
  return JSON.stringify({
    generatedAt: GENERATED_AT,
    friction: { feeBufferCents },
    candidateSamples: candidates,
  });
}

describe("executableConfirmationDesign", () => {
  it("returns unsupported/no-candidates when no candidates exist", () => {
    const report = buildExecutableConfirmationDesignReport({
      generatedAt: GENERATED_AT,
      outputPath: OUTPUT_PATH,
      htmlOutputPath: HTML_PATH,
      inputPaths: DEFAULT_EXECUTABLE_CONFIRMATION_DESIGN_INPUT_PATHS,
      io: buildMemoryIo({}),
    });

    expect(report.summary.confirmationStatus).toBe("no-candidates");
    expect(report.summary.confirmationSupported).toBe(false);
    expect(report.summary.recommendedNextFix).toBe("collect-more-candidates");
    expect(report.confirmationRecords).toHaveLength(0);
  });

  it("marks candidate missing size as insufficient-depth", () => {
    const evaluation = evaluateExecutableConfirmationReadiness({
      generatedAt: GENERATED_AT,
      artifacts: {
        staticParityCandidates: [
          {
            candidateId: "c1",
            timestamp: GENERATED_AT,
            marketTicker: "MKT",
            sourceArtifact: "static-parity-scan",
            yesBidCents: 52,
            noBidCents: 51,
            yesBidSize: null,
            noBidSize: null,
            bidSumCents: 103,
            bidOnlyEdgeCents: 3,
            minBidSizeContracts: null,
            feeBufferCents: 4,
            receivedAtMs: Date.parse(GENERATED_AT),
            requiresExecutableConfirmation: true,
          },
        ],
        lifecycleCandidates: [],
        forwardCaptureReadinessPresent: false,
      },
    });

    expect(evaluation.confirmationRecords[0]?.confirmationStatus).toBe("insufficient-depth");
  });

  it("marks candidate missing fee model as missing-fee-model", () => {
    const evaluation = evaluateExecutableConfirmationReadiness({
      generatedAt: GENERATED_AT,
      artifacts: {
        staticParityCandidates: [
          {
            candidateId: "c1",
            timestamp: GENERATED_AT,
            marketTicker: "MKT",
            sourceArtifact: "static-parity-scan",
            yesBidCents: 52,
            noBidCents: 51,
            yesBidSize: 10,
            noBidSize: 8,
            bidSumCents: 103,
            bidOnlyEdgeCents: 3,
            minBidSizeContracts: 8,
            feeBufferCents: null,
            receivedAtMs: Date.parse(GENERATED_AT),
            requiresExecutableConfirmation: true,
          },
        ],
        lifecycleCandidates: [],
        forwardCaptureReadinessPresent: false,
      },
    });

    expect(evaluation.confirmationRecords[0]?.confirmationStatus).toBe("missing-fee-model");
  });

  it("marks stale candidate as stale-book", () => {
    const evaluation = evaluateExecutableConfirmationReadiness({
      generatedAt: GENERATED_AT,
      config: { feeBufferCents: 4, minSizeContracts: 1, stalenessBoundMs: 1_000 },
      artifacts: {
        staticParityCandidates: [
          {
            candidateId: "c1",
            timestamp: "2026-07-10T11:00:00.000Z",
            marketTicker: "MKT",
            sourceArtifact: "static-parity-scan",
            yesBidCents: 52,
            noBidCents: 51,
            yesBidSize: 10,
            noBidSize: 8,
            bidSumCents: 103,
            bidOnlyEdgeCents: 3,
            minBidSizeContracts: 8,
            feeBufferCents: 4,
            receivedAtMs: Date.parse("2026-07-10T11:00:00.000Z"),
            requiresExecutableConfirmation: true,
          },
        ],
        lifecycleCandidates: [],
        forwardCaptureReadinessPresent: false,
      },
    });

    expect(evaluation.confirmationRecords[0]?.confirmationStatus).toBe("stale-book");
  });

  it("marks candidate with capture fields as confirmed-executable-looking (research only)", () => {
    const evaluation = evaluateExecutableConfirmationReadiness({
      generatedAt: GENERATED_AT,
      config: { feeBufferCents: 4, minSizeContracts: 1, stalenessBoundMs: 60_000 },
      artifacts: {
        staticParityCandidates: [
          {
            candidateId: "c1",
            timestamp: GENERATED_AT,
            marketTicker: "MKT",
            sourceArtifact: "static-parity-scan",
            yesBidCents: 52,
            noBidCents: 51,
            yesBidSize: 10,
            noBidSize: 8,
            bidSumCents: 103,
            bidOnlyEdgeCents: 3,
            minBidSizeContracts: 8,
            feeBufferCents: 4,
            receivedAtMs: Date.parse(GENERATED_AT),
            requiresExecutableConfirmation: true,
          },
        ],
        lifecycleCandidates: [],
        forwardCaptureReadinessPresent: false,
      },
    });

    expect(evaluation.confirmationRecords[0]?.confirmationStatus).toBe(
      "confirmed-executable-looking",
    );
    expect(evaluation.summary.confirmationSupported).toBe(false);
    expect(evaluation.summary.actionabilityBlockers.length).toBeGreaterThan(0);
  });

  it("serializes deterministic JSON and HTML", () => {
    const report = buildExecutableConfirmationDesignReport({
      generatedAt: GENERATED_AT,
      outputPath: OUTPUT_PATH,
      htmlOutputPath: HTML_PATH,
      inputPaths: DEFAULT_EXECUTABLE_CONFIRMATION_DESIGN_INPUT_PATHS,
      io: buildMemoryIo({
        [DEFAULT_EXECUTABLE_CONFIRMATION_DESIGN_INPUT_PATHS.staticParityScanPath]:
          createStaticParityScanArtifact([createCandidateSample()]),
      }),
    });

    const json = serializeExecutableConfirmationDesignReport(report);
    const html = serializeExecutableConfirmationDesignHtml(report);

    expect(json).toBe(serializeExecutableConfirmationDesignReport(report));
    expect(html).toContain("Executable Confirmation Design Harness");
    expect(html).toContain(EXECUTABLE_CONFIRMATION_DESIGN_DISCLAIMER);
    expect(html).not.toContain("placeOrder");
    expect(json).toContain('"confirmationSupported":false');
  });

  it("does not crash when upstream artifacts are missing", () => {
    const loaded = loadExecutableConfirmationArtifacts({
      inputPaths: DEFAULT_EXECUTABLE_CONFIRMATION_DESIGN_INPUT_PATHS,
      io: buildMemoryIo({}),
    });

    expect(loaded.staticParityScanPresent).toBe(false);
    expect(loaded.bidOnlyCandidateLifecyclePresent).toBe(false);
    expect(loaded.artifacts.staticParityCandidates).toHaveLength(0);
  });

  it("loads candidates from static parity scan artifact when present", () => {
    const loaded = loadExecutableConfirmationArtifacts({
      inputPaths: DEFAULT_EXECUTABLE_CONFIRMATION_DESIGN_INPUT_PATHS,
      io: buildMemoryIo({
        [DEFAULT_EXECUTABLE_CONFIRMATION_DESIGN_INPUT_PATHS.staticParityScanPath]:
          createStaticParityScanArtifact([
            createCandidateSample(),
            createCandidateSample({ classification: "bid-only-no-signal" }),
          ]),
      }),
    });

    expect(loaded.staticParityScanPresent).toBe(true);
    expect(loaded.artifacts.staticParityCandidates).toHaveLength(1);
  });

  it("does not import order placement modules", () => {
    const moduleDir = join(process.cwd(), "src/lib/data/research/executableConfirmationDesign");
    const files = [
      "index.ts",
      "buildExecutableConfirmationDesignReport.ts",
      "evaluateExecutableConfirmationReadiness.ts",
      "loadExecutableConfirmationArtifacts.ts",
      "serializeExecutableConfirmationDesignHtml.ts",
      "serializeExecutableConfirmationDesignReport.ts",
      "parseExecutableConfirmationDesignArgv.ts",
      "executableConfirmationDesignTypes.ts",
    ];

    for (const file of files) {
      const content = readFileSync(join(moduleDir, file), "utf8");
      for (const forbidden of FORBIDDEN_EXECUTABLE_CONFIRMATION_IMPORT_PREFIXES) {
        const escaped = forbidden.replaceAll("/", "\\/");
        expect(content).not.toMatch(new RegExp(`from ["']${escaped}`));
      }
      expect(content).not.toMatch(/placeOrder|submitOrder|createOrder/i);
    }
  });

  it("reports episodesAssessed separately from candidate counts", () => {
    const lifecycleArtifact = JSON.stringify({
      generatedAt: GENERATED_AT,
      episodes: [
        {
          episodeId: "ep-1",
          marketTicker: "MKT-1",
          episodeClassification: "gross-candidate-episode",
          startedAt: GENERATED_AT,
          minBidSizeContracts: 5,
          maxBidOnlyEdgeCents: 3,
          firstBidSumCents: 103,
          requiresExecutableConfirmation: true,
        },
        {
          episodeId: "ep-2",
          marketTicker: "MKT-2",
          episodeClassification: "no-candidate",
          startedAt: GENERATED_AT,
        },
      ],
      config: { feeBufferCents: 4 },
    });

    const report = buildExecutableConfirmationDesignReport({
      generatedAt: GENERATED_AT,
      outputPath: OUTPUT_PATH,
      htmlOutputPath: HTML_PATH,
      inputPaths: {
        ...DEFAULT_EXECUTABLE_CONFIRMATION_DESIGN_INPUT_PATHS,
        bidOnlyCandidateLifecyclePath: "data/research-results/bid-only-candidate-lifecycle.json",
      },
      io: buildMemoryIo({
        "data/research-results/bid-only-candidate-lifecycle.json": lifecycleArtifact,
      }),
    });

    expect(report.summary.episodesAssessed).toBe(2);
    expect(report.summary.candidateEpisodesAssessed).toBe(1);
    expect(report.summary.candidateCountAssessed).toBe(1);
  });

  it("rejects aggregate artifacts in selected-run mode", () => {
    const report = buildExecutableConfirmationDesignReport({
      generatedAt: GENERATED_AT,
      outputPath: OUTPUT_PATH,
      htmlOutputPath: HTML_PATH,
      inputPaths: {
        ...DEFAULT_EXECUTABLE_CONFIRMATION_DESIGN_INPUT_PATHS,
        captureRunDir: "data/live-capture/forward-quotes/run-a",
        staticParityScanPath: "data/research-results/static-parity-scan.json",
      },
      io: buildMemoryIo({
        "data/research-results/static-parity-scan.json": JSON.stringify({
          generatedAt: GENERATED_AT,
          analysisScope: "aggregate",
          sourceRunIds: ["run-a", "run-b"],
          friction: { feeBufferCents: 4 },
          candidateSamples: [],
        }),
      }),
    });

    expect(report.analysisScope).toBe("selected-run");
    expect(report.scope.mismatchedArtifacts).toContain(
      "data/research-results/static-parity-scan.json",
    );
    expect(report.confirmationRecords).toHaveLength(0);
  });

  it("does not count aggregate forward-capture readiness as present in selected-run mode", () => {
    const report = buildExecutableConfirmationDesignReport({
      generatedAt: GENERATED_AT,
      outputPath: OUTPUT_PATH,
      htmlOutputPath: HTML_PATH,
      inputPaths: {
        ...DEFAULT_EXECUTABLE_CONFIRMATION_DESIGN_INPUT_PATHS,
        captureRunDir: "data/live-capture/forward-quotes/run-a",
        forwardCaptureReadinessPath: "data/research-results/forward-capture-readiness.json",
      },
      io: buildMemoryIo({
        "data/research-results/forward-capture-readiness.json": JSON.stringify({
          generatedAt: GENERATED_AT,
          analysisScope: "aggregate",
          sourceRunIds: ["run-b"],
          aggregates: { runCount: 2 },
        }),
      }),
    });

    expect(report.dataAssessment.forwardCaptureReadinessPresent).toBe(false);
    expect(report.scope.mismatchedArtifacts).toContain(
      "data/research-results/forward-capture-readiness.json",
    );
  });
});
