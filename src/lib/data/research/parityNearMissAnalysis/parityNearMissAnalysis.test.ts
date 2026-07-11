import { describe, expect, it } from "vitest";

import { DEFAULT_STATIC_PARITY_FRICTION_CONFIG } from "../staticParityScan/staticParityScanTypes";
import { fnv1a32, stableStringify } from "@/lib/trading/config/hashConfig";

import { analyzeParityNearMissForRun } from "./analyzeParityNearMissForRun";
import { BoundedNearMissRanking } from "./boundedNearMissRanking";
import { classifyParityNearMissInterpretation } from "./classifyParityNearMissInterpretation";
import { createMemoryParityNearMissIo } from "./createParityNearMissAnalysisIo";
import {
  buildRuleConfiguration,
  createEmptyGateCounts,
  evaluateParityObservationGates,
  resolveDistanceBucket,
} from "./evaluateParityObservationGates";
import { parseParityNearMissAnalysisArgv } from "./parseParityNearMissAnalysisArgv";
import { serializeParityNearMissAnalysisHtml } from "./serializeParityNearMissAnalysisHtml";
import { validateSelectedRunDirectory } from "./loadSelectedRunContext";
import { ParityNearMissAnalysisError } from "./parityNearMissAnalysisTypes";
import { createParityNearMissAnalysisConfig } from "./parityNearMissAnalysisConfig";

const RUN_DIR = "data/live-capture/forward-quotes/run-near-miss";
const MARKET = "KXBTC15M-TEST";

function topOfBookLine(input: {
  receivedAtLocal: string;
  yesBid?: number | null;
  noBid?: number | null;
  yesBidSize?: number | null;
  noBidSize?: number | null;
  yesAsk?: number | null;
  noAsk?: number | null;
  bookState?: string;
  sequence?: number;
  exchangeTimestampMs?: number;
  isParityUsable?: boolean;
  economicBookState?: string;
}) {
  const record: Record<string, unknown> = {
    runId: "run-near-miss",
    marketTicker: MARKET,
    receivedAtLocal: input.receivedAtLocal,
    bookState: input.bookState ?? "valid",
    yesBestBidCents: input.yesBid ?? 50,
    noBestBidCents: input.noBid ?? 50,
    sequence: input.sequence,
    exchangeTimestampMs: input.exchangeTimestampMs,
  };

  if (input.yesBidSize !== undefined) {
    record.yesBestBidSize = input.yesBidSize;
  } else {
    record.yesBestBidSize = 10;
  }
  if (input.noBidSize !== undefined) {
    record.noBestBidSize = input.noBidSize;
  } else {
    record.noBestBidSize = 10;
  }
  if (input.yesAsk !== undefined) {
    record.yesBestAskCents = input.yesAsk;
  }
  if (input.noAsk !== undefined) {
    record.noBestAskCents = input.noAsk;
  }
  if (input.isParityUsable !== undefined) {
    record.isParityUsable = input.isParityUsable;
  }
  if (input.economicBookState !== undefined) {
    record.economicBookState = input.economicBookState;
  }

  return JSON.stringify(record);
}

function buildFixtureFiles() {
  return {
    [`${RUN_DIR}/capture-health.json`]: JSON.stringify({
      runId: "run-near-miss",
      duration: { runDurationSeconds: 3600 },
      orderbook: { validBookShare: 0.99, sequenceGapCount: 2 },
      btcJoinCoverageShare: 1,
    }),
    [`${RUN_DIR}/market-metadata.jsonl`]: `${JSON.stringify({
      marketTicker: MARKET,
      closeTime: "2026-07-11T12:00:00.000Z",
    })}\n`,
    [`${RUN_DIR}/btc-spot.jsonl`]: `${JSON.stringify({
      receivedAtLocal: "2026-07-11T11:00:00.000Z",
      priceUsd: 100000,
    })}\n`,
    [`${RUN_DIR}/top-of-book.jsonl`]: [
      topOfBookLine({ receivedAtLocal: "2026-07-11T11:00:01.000Z", yesBid: 50, noBid: 51, sequence: 1 }),
      topOfBookLine({
        receivedAtLocal: "2026-07-11T11:00:02.000Z",
        yesBid: 53,
        noBid: 50,
        sequence: 2,
      }),
      topOfBookLine({
        receivedAtLocal: "2026-07-11T11:00:03.000Z",
        yesBid: 56,
        noBid: 50,
        yesBidSize: null,
        noBidSize: null,
        sequence: 3,
      }),
      topOfBookLine({
        receivedAtLocal: "2026-07-11T11:00:04.000Z",
        yesBid: 56,
        noBid: 50,
        sequence: 4,
      }),
      topOfBookLine({
        receivedAtLocal: "2026-07-11T11:00:05.000Z",
        yesBid: 50,
        noBid: 51,
        sequence: 5,
      }),
      topOfBookLine({
        receivedAtLocal: "2026-07-11T11:00:06.000Z",
        yesBid: 50,
        noBid: 51,
        sequence: 6,
      }),
    ].join("\n"),
    "data/research-results/capture-health-reconciliation.json": JSON.stringify({
      generatedAt: "2026-07-11T12:00:00.000Z",
      analysisScope: "selected-run",
      selectedRunId: "run-near-miss",
      sourceRunIds: ["run-near-miss"],
      summary: {
        selectedRunId: "run-near-miss",
        sequenceGapCount: 2,
        validBookShare: 0.99,
      },
    }),
    "data/research-results/bid-size-coverage-audit.json": JSON.stringify({
      comparison: {
        bidSizeCoverageShare: 0.95,
        topOfBookBidSizeCoverageShare: 0.95,
      },
    }),
  };
}

describe("evaluateParityObservationGates", () => {
  const rule = buildRuleConfiguration(
    createParityNearMissAnalysisConfig({ captureRunDir: RUN_DIR }),
  );

  it("uses positive distance as shortfall below gross threshold", () => {
    const metrics = evaluateParityObservationGates(
      {
        marketTicker: MARKET,
        receivedAtLocal: "2026-07-11T11:00:01.000Z",
        receivedAtMs: Date.parse("2026-07-11T11:00:01.000Z"),
        bookState: "valid",
        yesBestBidCents: 50,
        noBestBidCents: 51,
        yesBestBidSize: 10,
        noBestBidSize: 10,
        btcSpotPriceUsd: 100000,
      },
      rule,
    );

    expect(metrics.bidOnlyParityValue).toBe(1);
    expect(metrics.grossDistanceToQualification).toBe(1);
    expect(metrics.grossParityPass).toBe(false);
    expect(metrics.firstRejectingGate).toBe("gross-parity-shortfall");
    expect(resolveDistanceBucket(metrics.grossDistanceToQualification)).toBe("0.5-to-1-cent");
  });

  it("marks fee/buffer shortfall when gross passes but net edge is insufficient", () => {
    const metrics = evaluateParityObservationGates(
      {
        marketTicker: MARKET,
        receivedAtLocal: "2026-07-11T11:00:02.000Z",
        receivedAtMs: Date.parse("2026-07-11T11:00:02.000Z"),
        bookState: "valid",
        yesBestBidCents: 53,
        noBestBidCents: 50,
        yesBestBidSize: 10,
        noBestBidSize: 10,
        btcSpotPriceUsd: 100000,
      },
      rule,
    );

    expect(metrics.grossParityPass).toBe(true);
    expect(metrics.bufferPass).toBe(false);
    expect(metrics.allRejectingGates).toContain("buffer-adjusted-shortfall");
  });

  it("rejects missing executable size", () => {
    const metrics = evaluateParityObservationGates(
      {
        marketTicker: MARKET,
        receivedAtLocal: "2026-07-11T11:00:03.000Z",
        receivedAtMs: Date.parse("2026-07-11T11:00:03.000Z"),
        bookState: "valid",
        yesBestBidCents: 56,
        noBestBidCents: 50,
        yesBestBidSize: null,
        noBestBidSize: null,
      },
      rule,
    );

    expect(metrics.sizePass).toBe(false);
    expect(metrics.firstRejectingGate).toBe("missing-executable-size");
  });

  it("qualifies buffer-adjusted candidate when thresholds are met", () => {
    const metrics = evaluateParityObservationGates(
      {
        marketTicker: MARKET,
        receivedAtLocal: "2026-07-11T11:00:04.000Z",
        receivedAtMs: Date.parse("2026-07-11T11:00:04.000Z"),
        bookState: "valid",
        yesBestBidCents: 56,
        noBestBidCents: 50,
        yesBestBidSize: 10,
        noBestBidSize: 10,
        btcSpotPriceUsd: 100000,
      },
      rule,
    );

    expect(metrics.bufferPass).toBe(true);
    expect(metrics.bufferAdjustedDistanceToQualification).toBeLessThanOrEqual(0);
  });

  it("recomputes economic fields when legacy economicBookState labels are unknown", () => {
    const metrics = evaluateParityObservationGates(
      {
        marketTicker: MARKET,
        receivedAtLocal: "2026-07-11T11:00:07.000Z",
        receivedAtMs: Date.parse("2026-07-11T11:00:07.000Z"),
        bookState: "valid",
        yesBestBidCents: 55,
        yesBestAskCents: 54,
        noBestBidCents: 50,
        noBestAskCents: 51,
        yesBestBidSize: 10,
        noBestBidSize: 10,
        economicBookState: "crossed-yes-book",
        isParityUsable: true,
      },
      rule,
    );

    expect(metrics.bookSynchronized).toBe(false);
    expect(metrics.firstRejectingGate).toBe("unsynchronized-book");
  });
});

describe("BoundedNearMissRanking", () => {
  it("keeps only the closest positive distances", () => {
    const ranking = new BoundedNearMissRanking(2, "gross");
    ranking.consider({
      marketTicker: MARKET,
      timestamp: "a",
      timeRemainingMs: null,
      yesBidCents: 50,
      noBidCents: 51,
      yesBidSize: 1,
      noBidSize: 1,
      distance: 5,
      firstRejectingGate: "gross-parity-shortfall",
      allRejectingGates: ["gross-parity-shortfall"],
      integrityCaveat: null,
    });
    ranking.consider({
      marketTicker: MARKET,
      timestamp: "b",
      timeRemainingMs: null,
      yesBidCents: 50,
      noBidCents: 51,
      yesBidSize: 1,
      noBidSize: 1,
      distance: 1,
      firstRejectingGate: "gross-parity-shortfall",
      allRejectingGates: ["gross-parity-shortfall"],
      integrityCaveat: null,
    });
    ranking.consider({
      marketTicker: MARKET,
      timestamp: "c",
      timeRemainingMs: null,
      yesBidCents: 50,
      noBidCents: 51,
      yesBidSize: 1,
      noBidSize: 1,
      distance: 2,
      firstRejectingGate: "gross-parity-shortfall",
      allRejectingGates: ["gross-parity-shortfall"],
      integrityCaveat: null,
    });

    expect(ranking.toRankedEntries().map((entry) => entry.timestamp)).toEqual(["b", "c"]);
  });
});

describe("analyzeParityNearMissForRun", () => {
  it("fails clearly for unknown run directories", () => {
    const io = createMemoryParityNearMissIo({});
    expect(() => validateSelectedRunDirectory(io, "missing/run")).toThrow(ParityNearMissAnalysisError);
  });

  it("returns shared JSONL stream summary fields from memory IO", async () => {
    const io = createMemoryParityNearMissIo({
      "run/events.jsonl": `${JSON.stringify({ ok: true })}\n\nnot-json\n${JSON.stringify({ ok: true })}`,
    });

    const summary = await io.iterateJsonl("run/events.jsonl", {
      onLine: (line) => {
        try {
          JSON.parse(line);
          return "continue";
        } catch {
          return "skip";
        }
      },
    });

    expect(summary).toEqual({
      linesRead: 4,
      blankLinesSkipped: 1,
      invalidLineCount: 1,
      recordsHandled: 2,
      truncated: false,
    });
  });

  it("requires explicit --capture-run-dir and does not default to latest", () => {
    expect(() => parseParityNearMissAnalysisArgv([])).toThrow(
      "Missing required --capture-run-dir.",
    );
  });

  it("produces selected-run scoped report with funnel, rankings, and rule hash", async () => {
    const io = createMemoryParityNearMissIo(buildFixtureFiles());
    const report = await analyzeParityNearMissForRun({
      generatedAt: "2026-07-11T12:00:00.000Z",
      outputPath: "data/research-results/parity-near-miss-analysis.json",
      htmlOutputPath: "data/reports/parity-near-miss-analysis.html",
      config: createParityNearMissAnalysisConfig({
        captureRunDir: RUN_DIR,
        nearMissLimit: 5,
      }),
      io,
    });

    expect(report.analysisScope).toBe("selected-run");
    expect(report.selectedRunId).toBe("run-near-miss");
    expect(report.sourceRunIds).toEqual(["run-near-miss"]);
    expect(report.recordsScanned).toBe(6);
    expect(report.qualificationFunnel.recordsLoaded).toBe(6);
    expect(report.qualificationFunnel.finalCandidates).toBe(1);
    expect(report.gateCounts.allRejectionsByGate["missing-executable-size"]).toBeGreaterThan(0);
    expect(report.gateCounts.allRejectionsByGate["buffer-adjusted-shortfall"]).toBeGreaterThan(0);
    expect(report.nearMissRankings.gross.length).toBeGreaterThan(0);
    expect(report.nearMissRankings.gross[0]?.distance).toBe(1);
    expect(report.nearMissRankings.bufferEpisodes.length).toBeGreaterThan(0);
    expect(report.nearMissRankings.bufferEpisodes[0]?.distanceKind).toBe("buffer-adjusted");
    expect(report.ruleConfiguration.pricingModel).toBe("bid-only");
    expect(report.ruleConfiguration.feeBufferCents).toBe(
      DEFAULT_STATIC_PARITY_FRICTION_CONFIG.feeBufferCents,
    );
    expect(report.ruleConfigurationHash).toMatch(/^parity-near-miss-v1-/);
    expect(report.selectedRunQuality.sequenceGapCount).toBe(2);
    expect(report.selectedRunQuality.bidSizeCoverageShare).toBe(0.95);
    expect(serializeParityNearMissAnalysisHtml(report)).toContain("Interpretation guardrails");
  });

  it("uses bid-size audit comparison coverage when classifying selected-run quality", async () => {
    const files = buildFixtureFiles();
    files[`${RUN_DIR}/top-of-book.jsonl`] = [
      topOfBookLine({ receivedAtLocal: "2026-07-11T11:00:01.000Z", yesBid: 50, noBid: 51, sequence: 1 }),
      topOfBookLine({ receivedAtLocal: "2026-07-11T11:00:02.000Z", yesBid: 50, noBid: 51, sequence: 2 }),
    ].join("\n");
    files["data/research-results/bid-size-coverage-audit.json"] = JSON.stringify({
      summary: {
        bidPairWithSizeCount: 1,
        bidPairWithoutSizeCount: 9,
      },
      comparison: {
        bidSizeCoverageShare: 0.1,
        topOfBookBidSizeCoverageShare: 0.1,
      },
    });

    const report = await analyzeParityNearMissForRun({
      generatedAt: "2026-07-11T12:00:00.000Z",
      outputPath: "data/research-results/parity-near-miss-analysis.json",
      htmlOutputPath: "data/reports/parity-near-miss-analysis.html",
      config: createParityNearMissAnalysisConfig({ captureRunDir: RUN_DIR }),
      io: createMemoryParityNearMissIo(files),
    });

    expect(report.selectedRunQuality.bidSizeCoverageShare).toBe(0.1);
    expect(report.summary.interpretationClassification).toBe("observation-quality-inconclusive");
    expect(report.summary.recommendedNextAction).toBe("investigate-observation-integrity");
  });

  it("excludes stale/unsynchronized observations from rankings and final candidate counts", async () => {
    const files = buildFixtureFiles();
    files[`${RUN_DIR}/top-of-book.jsonl`] = [
      topOfBookLine({
        receivedAtLocal: "2026-07-11T11:00:01.000Z",
        yesBid: 52,
        noBid: 50,
        yesAsk: 51,
        noAsk: 51,
        isParityUsable: true,
        sequence: 1,
      }),
      topOfBookLine({
        receivedAtLocal: "2026-07-11T11:00:02.000Z",
        yesBid: 51,
        noBid: 50,
        exchangeTimestampMs: Date.parse("2026-07-11T11:00:02.000Z") - 120_000,
        sequence: 2,
      }),
      topOfBookLine({
        receivedAtLocal: "2026-07-11T11:00:03.000Z",
        yesBid: 51,
        noBid: 50,
        exchangeTimestampMs: Date.parse("2026-07-11T11:00:03.000Z"),
        sequence: 3,
      }),
      topOfBookLine({
        receivedAtLocal: "2026-07-11T11:00:04.000Z",
        yesBid: 56,
        noBid: 50,
        exchangeTimestampMs: Date.parse("2026-07-11T11:00:04.000Z") - 120_000,
        sequence: 4,
      }),
    ].join("\n");

    const report = await analyzeParityNearMissForRun({
      generatedAt: "2026-07-11T12:00:00.000Z",
      outputPath: "data/research-results/parity-near-miss-analysis.json",
      htmlOutputPath: "data/reports/parity-near-miss-analysis.html",
      config: createParityNearMissAnalysisConfig({
        captureRunDir: RUN_DIR,
        friction: {
          minGrossEdgeCents: 3,
        },
      }),
      io: createMemoryParityNearMissIo(files),
    });

    expect(report.nearMissRankings.gross).toHaveLength(1);
    expect(report.nearMissRankings.gross[0]?.timestamp).toBe("2026-07-11T11:00:03.000Z");
    expect(report.perMarketBreakdown[MARKET]?.closestGrossNearMissCents).toBe(2);
    expect(report.qualificationFunnel.bufferPass).toBe(1);
    expect(report.qualificationFunnel.finalCandidates).toBe(0);
    expect(report.summary.candidateCount).toBe(0);
  });

  it("keeps rule configuration hash stable for unchanged defaults", () => {
    const config = createParityNearMissAnalysisConfig({ captureRunDir: RUN_DIR });
    const hashA = `parity-near-miss-v1-${fnv1a32(stableStringify(buildRuleConfiguration(config)))}`;
    const hashB = `parity-near-miss-v1-${fnv1a32(stableStringify(buildRuleConfiguration(config)))}`;
    expect(hashA).toBe(hashB);
  });

  it("classifies zero-candidate clean runs with narrow near misses", () => {
    const gateCounts = createEmptyGateCounts();
    gateCounts.allRejectionsByGate["gross-parity-shortfall"] = 3;

    const summary = classifyParityNearMissInterpretation({
      recordsScanned: 100,
      recordsEligible: 95,
      qualificationFunnel: {
        bufferPass: 0,
        grossPass: 0,
        persistentPass: 0,
        sizedBidPairs: 90,
      },
      gateCounts,
      closestGrossNearMiss: 0.5,
      closestBufferNearMiss: null,
      selectedRunQuality: {
        selectedRunId: "run",
        runDurationSeconds: 3600,
        validBookShare: 0.99,
        btcJoinCoverageShare: 1,
        bidSizeCoverageShare: 0.95,
        reconnectCount: 0,
        suspectedSystemSleepSeconds: 0,
        sequenceGapCount: 10,
      },
    });

    expect(summary.interpretationClassification).toBe("no-signal-with-narrow-near-misses");
  });

  it("warns when reconciliation artifact run identity mismatches", async () => {
    const files = buildFixtureFiles();
    files["data/research-results/capture-health-reconciliation.json"] = JSON.stringify({
      analysisScope: "selected-run",
      selectedRunId: "other-run",
      sourceRunIds: ["other-run"],
      summary: { selectedRunId: "other-run" },
    });

    const report = await analyzeParityNearMissForRun({
      generatedAt: "2026-07-11T12:00:00.000Z",
      outputPath: "data/research-results/parity-near-miss-analysis.json",
      htmlOutputPath: "data/reports/parity-near-miss-analysis.html",
      config: createParityNearMissAnalysisConfig({ captureRunDir: RUN_DIR }),
      io: createMemoryParityNearMissIo(files),
    });

    expect(report.warnings.some((warning) => warning.includes("selectedRunId"))).toBe(true);
  });
});
