import { describe, expect, it } from "vitest";

import { deriveMicrostructureRequiredEffectiveN } from "../spreadLiquidityMicrostructureEvidenceContract";
import {
  FAMILY_HYPOTHESIS_COUNT,
  RESPONSE_MATCH_TOLERANCE_MS,
  computeTobSizeImbalance,
  deriveYesBestAskCents,
  deriveYesBestAskSize,
} from "../spreadLiquidityMicrostructureFamily";
import { computeRequiredSampleSize } from "../powerAnalysis/powerAnalysisMath";

import {
  BOUND_ALPHA,
  BOUND_MATERIAL_EFFECT_CENTS,
  BOUND_OUTCOME_SD_CENTS,
  BOUND_TARGET_POWER,
  MicrostructureGovernedDiscoveryError,
  buildMicrostructureGovernedDiscoveryReport,
  classifyMicrostructureContamination,
  computeStructuralSimplicityRank,
  createMemoryMicrostructureDiscoveryIo,
  createTrainOnlyMicrostructureDiscoveryIo,
  isDirectionConsistentWithFamily,
  parseMicrostructureDiscoveryArgv,
  sealMicrostructurePreOpenBundle,
  streamTrainMicrostructureDiscovery,
  type MicrostructureGovernedDiscoveryReport,
} from "./index";
import type { TrainStreamResult } from "./streamTrainMicrostructureDiscovery";
import type { CellAccumulator } from "./streamTrainMicrostructureDiscovery";

const TRAIN = "data/live-capture/forward-quotes/train-run";
const VAL = "data/live-capture/forward-quotes/val-run";
const HOLD = "data/live-capture/forward-quotes/hold-run";

function healthJson(durationSeconds = 28_800): string {
  return JSON.stringify({
    verdict: "ok",
    config: { durationSeconds },
  });
}

function baseDirs(): string[] {
  return [TRAIN, VAL, HOLD];
}

function baseFiles(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    [`${TRAIN}/capture-health.json`]: healthJson(),
    [`${TRAIN}/top-of-book.jsonl`]: "",
    [`${VAL}/capture-health.json`]: healthJson(),
    [`${VAL}/top-of-book.jsonl`]: "should-not-read\n",
    [`${HOLD}/capture-health.json`]: healthJson(14_400),
    [`${HOLD}/top-of-book.jsonl`]: "should-not-read\n",
    ...overrides,
  };
}

function emptyCell(partial: Partial<CellAccumulator> & {
  imbalanceThresholdAbs: number;
  responseHorizonMs: number;
  timeRemainingBin: string;
}): CellAccumulator {
  const candidateId = [
    `imb-${partial.imbalanceThresholdAbs.toFixed(2)}`,
    `h-${partial.responseHorizonMs}`,
    partial.timeRemainingBin,
    "same-direction",
  ].join("|");
  return {
    candidateId,
    hypothesisId: candidateId,
    structuralSimplicityRank: computeStructuralSimplicityRank(partial),
    rawEvents: 0,
    refractoryEpisodes: 0,
    observableResponses: 0,
    executableObservableResponses: 0,
    independentSignedExecutable: [],
    independentSignedMidpoint: [],
    independentMarketKeys: new Set(),
    independentMarketDayKeys: new Set(),
    allSignedExecutable: [],
    allSignedMidpoint: [],
    seenIndependentBlock: new Set(),
    ...partial,
  };
}

function universeCells(
  mutate?: (cell: CellAccumulator) => void,
): Map<string, CellAccumulator> {
  const cells = new Map<string, CellAccumulator>();
  for (const threshold of [0.4, 0.6]) {
    for (const horizon of [1_000, 5_000, 15_000]) {
      for (const bin of ["under-5-minutes", "5-to-15-minutes"]) {
        const cell = emptyCell({
          imbalanceThresholdAbs: threshold,
          responseHorizonMs: horizon,
          timeRemainingBin: bin,
        });
        mutate?.(cell);
        cells.set(cell.candidateId, cell);
      }
    }
  }
  return cells;
}

function injectedStream(cells: Map<string, CellAccumulator>): TrainStreamResult {
  return {
    cells,
    tobRecordsScanned: 100,
    validBookQuotes: 80,
    economicallyValidQuotes: 70,
    bidSizeAvailableQuotes: 70,
    firstCrossingEventsTotal: [...cells.values()].reduce((s, c) => s + c.rawEvents, 0),
    refractoryEpisodesTotal: [...cells.values()].reduce((s, c) => s + c.refractoryEpisodes, 0),
    marketsTouched: new Set(["MKT-A"]),
    marketDaysTouched: new Set(["MKT-A:2026-09-08"]),
    responseObservabilityByHorizonMs: new Map([
      [1_000, { observable: 1, unobservable: 0 }],
      [5_000, { observable: 1, unobservable: 0 }],
      [15_000, { observable: 1, unobservable: 0 }],
    ]),
    maxPendingPeak: 3,
    maxQuotesRetainedHint: 3,
  };
}

describe("M13.0b microstructure TRAIN discovery", () => {
  it("1-6. seals family/evidence/power/split identities before TRAIN outcome access", () => {
    const preOpen = sealMicrostructurePreOpenBundle();
    expect(preOpen.trainOutcomesOpened).toBe(false);
    expect(preOpen.familyReport.familyId).toBe("spread-liquidity-microstructure");
    expect(preOpen.familyReport.subfamilyId).toBe(
      "tob-size-imbalance-short-horizon-repricing-v1",
    );
    expect(preOpen.familyReport.searchUniverse.hypothesisCount).toBe(12);
    expect(preOpen.familyReport.searchUniverse.directionCount).toBe(1);
    expect(preOpen.materialEffectThresholdCents).toBe(2);
    expect(preOpen.alpha).toBe(0.05);
    expect(preOpen.targetPower).toBe(0.8);
    expect(preOpen.outcomeStandardDeviationCents).toBe(10);
    expect(preOpen.familyDefinitionIdentity).toMatch(/^[a-f0-9]{64}$/);
    expect(preOpen.evidenceContractIdentity).toMatch(/^[a-f0-9]{64}$/);
    expect(preOpen.evidenceReport.familyDefinitionIdentity).toBe(
      preOpen.familyDefinitionIdentity,
    );

    const modelN = deriveMicrostructureRequiredEffectiveN({
      alpha: BOUND_ALPHA,
      targetPower: BOUND_TARGET_POWER,
      materialEffectCents: BOUND_MATERIAL_EFFECT_CENTS,
      outcomeStandardDeviationCents: BOUND_OUTCOME_SD_CENTS,
    }).requiredEffectiveN;
    const direct = computeRequiredSampleSize({
      edgeCents: 2,
      standardDeviation: 10,
      alpha: 0.05,
      targetPower: 0.8,
    });
    expect(modelN).toBe(direct);
    expect(modelN).toBe(preOpen.requiredEffectiveN);
    // Not a hardcoded literal gate in the binder path — equals model output.
    expect(preOpen.requiredEffectiveN).not.toBe(20);
    expect(preOpen.requiredEffectiveN).not.toBe(50);
    expect(preOpen.requiredEffectiveN).not.toBe(100);
  });

  it("7. contaminated TRAIN fails before outcome read", () => {
    const discoveryArtifact = JSON.stringify({
      trainRunId: "train-run",
      perCandidateResults: [{ signedExecutableMedianCents: 9 }],
    });
    const nested =
      "data/research-results/spread-liquidity-microstructure/discovery/abc123/tob-imbalance-governed-discovery.json";
    const io = createMemoryMicrostructureDiscoveryIo(
      {
        ...baseFiles({
          [nested]: discoveryArtifact,
        }),
      },
      [
        ...baseDirs(),
        "data/research-results/spread-liquidity-microstructure/discovery",
        "data/research-results/spread-liquidity-microstructure/discovery/abc123",
      ],
    );
    const contamination = classifyMicrostructureContamination({
      io,
      runId: "train-run",
    });
    expect(contamination.classification).toBe("previously-inspected");
  });

  it("8-9. VALIDATION and HOLDOUT paths are IO-quarantined", () => {
    const io = createMemoryMicrostructureDiscoveryIo(baseFiles(), baseDirs());
    const trainOnly = createTrainOnlyMicrostructureDiscoveryIo({
      baseIo: io,
      quarantinedCaptureRunDirs: [VAL, HOLD],
    });
    expect(() => trainOnly.readFile(`${VAL}/top-of-book.jsonl`)).toThrow(/quarantined/i);
    expect(() => trainOnly.readFile(`${HOLD}/top-of-book.jsonl`)).toThrow(/quarantined/i);
    expect(trainOnly.fileExists(`${TRAIN}/capture-health.json`)).toBe(true);
  });

  it("10-12. exactly 12 cells, one direction, no new grid axes", async () => {
    const cells = universeCells((cell) => {
      if (cell.imbalanceThresholdAbs === 0.4 && cell.responseHorizonMs === 1_000
        && cell.timeRemainingBin === "under-5-minutes") {
        cell.rawEvents = 5;
        cell.refractoryEpisodes = 4;
        cell.observableResponses = 4;
        cell.executableObservableResponses = 4;
        cell.independentSignedExecutable = [3, 2, 4];
        cell.independentSignedMidpoint = [1, 1, 2];
        cell.independentMarketKeys = new Set(["A", "B", "C"]);
        cell.independentMarketDayKeys = new Set(["A:d1", "B:d1", "C:d1"]);
        cell.seenIndependentBlock = new Set(["A:d1", "B:d1", "C:d1"]);
      }
    });
    const io = createMemoryMicrostructureDiscoveryIo(baseFiles(), baseDirs());
    const report = await buildMicrostructureGovernedDiscoveryReport({
      io,
      trainCaptureRunDir: TRAIN,
      validationCaptureRunDir: VAL,
      holdoutCaptureRunDir: HOLD,
      injectedTrainStream: injectedStream(cells),
      generatedAt: "2026-09-10T00:00:00.000Z",
      researchRoots: ["data/research-results-empty"],
    });
    expect(report.searchUniverse.hypothesisCount).toBe(12);
    expect(report.searchUniverse.directionCount).toBe(1);
    expect(report.perCandidateResults).toHaveLength(12);
    expect(report.perCandidateResults.every((c) => c.direction === "same-direction")).toBe(true);
    expect(report.quarantine.gridMutated).toBe(false);
    expect(report.quarantine.directionFlipped).toBe(false);
  });

  it("13-17. complement book, first-crossing, missing response unobservable, 250ms from family", async () => {
    expect(deriveYesBestAskCents(40)).toBe(60);
    expect(deriveYesBestAskSize(12)).toBe(12);
    const preOpen = sealMicrostructurePreOpenBundle();
    expect(preOpen.responseMatchToleranceMs).toBe(RESPONSE_MATCH_TOLERANCE_MS);
    expect(preOpen.responseMatchToleranceMs).toBe(250);

    const t0 = Date.parse("2026-09-08T08:00:00.000Z");
    const close = t0 + 10 * 60_000;
    const lines = [
      // balanced
      {
        marketTicker: "MKT-A",
        receivedAtLocal: new Date(t0).toISOString(),
        exchangeTimestampMs: t0,
        bookState: "valid",
        isEconomicallyValid: true,
        yesBestBidCents: 48,
        noBestBidCents: 50,
        yesBestBidSize: 10,
        noBestBidSize: 10,
      },
      // first cross 0.6
      {
        marketTicker: "MKT-A",
        receivedAtLocal: new Date(t0 + 1_000).toISOString(),
        exchangeTimestampMs: t0 + 1_000,
        bookState: "valid",
        isEconomicallyValid: true,
        yesBestBidCents: 48,
        noBestBidCents: 50,
        yesBestBidSize: 80,
        noBestBidSize: 20,
      },
      // still above threshold — not a new crossing
      {
        marketTicker: "MKT-A",
        receivedAtLocal: new Date(t0 + 1_500).toISOString(),
        exchangeTimestampMs: t0 + 1_500,
        bookState: "valid",
        isEconomicallyValid: true,
        yesBestBidCents: 49,
        noBestBidCents: 49,
        yesBestBidSize: 85,
        noBestBidSize: 15,
      },
      // response for 1s horizon at +1000ms from event (event at t0+1000 → target t0+2000)
      {
        marketTicker: "MKT-A",
        receivedAtLocal: new Date(t0 + 2_100).toISOString(),
        exchangeTimestampMs: t0 + 2_100,
        bookState: "valid",
        isEconomicallyValid: true,
        yesBestBidCents: 55,
        noBestBidCents: 44,
        yesBestBidSize: 10,
        noBestBidSize: 10,
      },
    ]
      .map((row) => JSON.stringify(row))
      .join("\n");

    const io = createMemoryMicrostructureDiscoveryIo(
      baseFiles({
        [`${TRAIN}/top-of-book.jsonl`]: lines,
        [`${TRAIN}/market-metadata.jsonl`]: JSON.stringify({
          marketTicker: "MKT-A",
          closeTime: new Date(close).toISOString(),
        }),
      }),
      baseDirs(),
    );

    const stream = await streamTrainMicrostructureDiscovery({
      io,
      trainCaptureRunDir: TRAIN,
      responseMatchToleranceMs: 250,
    });
    expect(stream.cells.size).toBe(12);
    const cell = stream.cells.get(
      "imb-0.60|h-1000|5-to-15-minutes|same-direction",
    );
    // time remaining = 9 minutes → 5-to-15
    expect(cell?.rawEvents).toBe(1);
    expect(cell?.refractoryEpisodes).toBe(1);
    expect(cell?.observableResponses).toBe(1);
    expect(computeTobSizeImbalance({ yesBestBidSize: 80, noBestBidSize: 20 }).ok).toBe(true);
  });

  it("18-22. refractory + independent unit + raw quotes never ESS", async () => {
    const cells = universeCells((cell) => {
      if (cell.candidateId.includes("imb-0.40|h-1000|under-5-minutes")) {
        cell.rawEvents = 10;
        cell.refractoryEpisodes = 4;
        cell.observableResponses = 4;
        cell.executableObservableResponses = 4;
        cell.independentSignedExecutable = [1, 2];
        cell.independentMarketKeys = new Set(["A", "B"]);
        cell.independentMarketDayKeys = new Set(["A:d", "B:d"]);
        cell.seenIndependentBlock = new Set(["A:d", "B:d"]);
      }
    });
    const io = createMemoryMicrostructureDiscoveryIo(baseFiles(), baseDirs());
    const report = await buildMicrostructureGovernedDiscoveryReport({
      io,
      trainCaptureRunDir: TRAIN,
      validationCaptureRunDir: VAL,
      holdoutCaptureRunDir: HOLD,
      injectedTrainStream: {
        ...injectedStream(cells),
        tobRecordsScanned: 50_000,
      },
      researchRoots: ["data/research-results-empty"],
      generatedAt: "2026-09-10T00:00:00.000Z",
    });
    const target = report.perCandidateResults.find((c) =>
      c.candidateId.includes("imb-0.40|h-1000|under-5-minutes"),
    )!;
    expect(target.effectiveSampleSize).toBe(2);
    expect(target.effectiveSampleSize).not.toBe(50_000);
    expect(report.trainCaptureMetrics.tobRecordsScanned).toBe(50_000);
  });

  it("23-27. executable vs midpoint; median direction rule; zero not consistent", () => {
    expect(isDirectionConsistentWithFamily(0.1)).toBe(true);
    expect(isDirectionConsistentWithFamily(0)).toBe(false);
    expect(isDirectionConsistentWithFamily(-0.1)).toBe(false);
    expect(isDirectionConsistentWithFamily(null)).toBe(false);
    // Mean cannot replace median: mean>0 but median=0 → not consistent.
    const meanPositiveMedianZero = [ -1, 0, 5 ];
    const median = [...meanPositiveMedianZero].sort((a, b) => a - b)[1]!;
    const mean =
      meanPositiveMedianZero.reduce((s, v) => s + v, 0) / meanPositiveMedianZero.length;
    expect(mean).toBeGreaterThan(0);
    expect(isDirectionConsistentWithFamily(median)).toBe(false);
  });

  it("28-32. simplicity ordering outcome-independent; shortlist ≤3; not by max effect; retain 12", async () => {
    expect(computeStructuralSimplicityRank({
      imbalanceThresholdAbs: 0.4,
      responseHorizonMs: 1_000,
      timeRemainingBin: "under-5-minutes",
    })).toBeLessThan(
      computeStructuralSimplicityRank({
        imbalanceThresholdAbs: 0.6,
        responseHorizonMs: 15_000,
        timeRemainingBin: "5-to-15-minutes",
      }),
    );

    const cells = universeCells((cell) => {
      // Make all eligible with huge effect on complex cell and small effect on simple cell.
      cell.rawEvents = 3;
      cell.refractoryEpisodes = 3;
      cell.observableResponses = 3;
      cell.executableObservableResponses = 3;
      cell.independentMarketKeys = new Set(["A", "B", "C"]);
      cell.independentMarketDayKeys = new Set(["A:d", "B:d", "C:d"]);
      cell.seenIndependentBlock = new Set(["A:d", "B:d", "C:d"]);
      if (cell.imbalanceThresholdAbs === 0.6 && cell.responseHorizonMs === 15_000) {
        cell.independentSignedExecutable = [50, 50, 50];
      } else {
        cell.independentSignedExecutable = [1, 1, 1];
      }
    });

    const io = createMemoryMicrostructureDiscoveryIo(baseFiles(), baseDirs());
    const report = await buildMicrostructureGovernedDiscoveryReport({
      io,
      trainCaptureRunDir: TRAIN,
      validationCaptureRunDir: VAL,
      holdoutCaptureRunDir: HOLD,
      injectedTrainStream: injectedStream(cells),
      researchRoots: ["data/research-results-empty"],
      generatedAt: "2026-09-10T00:00:00.000Z",
    });

    expect(report.shortlist.length).toBeLessThanOrEqual(3);
    expect(report.perCandidateResults).toHaveLength(12);
    expect(report.discoveryStatus).toBe("candidates-shortlisted");
    const largestEffect = report.perCandidateResults.reduce((best, row) =>
      (row.signedExecutableMedianCents ?? -Infinity)
        > (best.signedExecutableMedianCents ?? -Infinity)
        ? row
        : best,
    );
    expect(report.shortlist.length).toBe(3);
    expect(report.shortlist[0]?.rankingKey?.startsWith("00000003|")).toBe(true);
    // Effect magnitude is not a ranking dimension — keys are incidence/days/markets/obs/simplicity/id.
    expect(
      report.shortlist.every((row) =>
        /^[0-9]{8}\|[0-9]{8}\|[0-9]{8}\|[0-9]{8}\|[0-9]{8}\|/.test(row.rankingKey ?? ""),
      ),
    ).toBe(true);
    expect(largestEffect.signedExecutableMedianCents).toBe(50);
    // Prefer simpler cells among equal incidence: first shortlisted should be threshold 0.40.
    expect(report.shortlist[0]?.imbalanceThresholdAbs).toBe(0.4);
  });

  it("33-41. quarantine flags, no promotion/freeze/capture/live, deterministic identity, no latest", async () => {
    expect(() => parseMicrostructureDiscoveryArgv(["--latest"])).toThrow(/Forbidden authority/i);
    expect(() => parseMicrostructureDiscoveryArgv(["--validate"])).toThrow(/Forbidden authority/i);
    expect(() => parseMicrostructureDiscoveryArgv(["--holdout"])).toThrow(/Forbidden authority/i);
    expect(() => parseMicrostructureDiscoveryArgv(["--promote"])).toThrow(/Forbidden authority/i);
    expect(() => parseMicrostructureDiscoveryArgv(["--freeze"])).toThrow(/Forbidden authority/i);

    const cells = universeCells();
    const io = createMemoryMicrostructureDiscoveryIo(baseFiles(), baseDirs());
    const a = await buildMicrostructureGovernedDiscoveryReport({
      io,
      trainCaptureRunDir: TRAIN,
      validationCaptureRunDir: VAL,
      holdoutCaptureRunDir: HOLD,
      injectedTrainStream: injectedStream(cells),
      researchRoots: ["data/research-results-empty"],
      generatedAt: "2026-09-10T00:00:00.000Z",
    });
    const b = await buildMicrostructureGovernedDiscoveryReport({
      io,
      trainCaptureRunDir: TRAIN,
      validationCaptureRunDir: VAL,
      holdoutCaptureRunDir: HOLD,
      injectedTrainStream: injectedStream(cells),
      researchRoots: ["data/research-results-empty"],
      generatedAt: "2099-01-01T00:00:00.000Z",
    });
    expect(a.discoveryIdentity).toBe(b.discoveryIdentity);
    expect(a.quarantine).toMatchObject({
      validationOutcomesRead: false,
      holdoutOutcomesRead: false,
      promotionArtifactCreated: false,
      preregistrationArtifactCreated: false,
      freezeCreated: false,
      captureStarted: false,
      liveOrdersExecuted: false,
    });
    expect(a.recommendedNextAction === "proceed-to-validation"
      || a.recommendedNextAction === "no-candidates-eligible"
      || a.recommendedNextAction === "collect-more-train-incidence").toBe(true);
  });

  it("42. bounded-memory processing signal (pending peak << scanned)", async () => {
    const t0 = Date.parse("2026-09-08T08:00:00.000Z");
    const rows: string[] = [];
    for (let i = 0; i < 200; i += 1) {
      const yesSize = i % 20 === 0 ? 80 : 10;
      const noSize = i % 20 === 0 ? 20 : 10;
      // Reset threshold state periodically
      const sizes = i % 20 === 1 ? { yes: 10, no: 10 } : { yes: yesSize, no: noSize };
      rows.push(JSON.stringify({
        marketTicker: "MKT-A",
        receivedAtLocal: new Date(t0 + i * 100).toISOString(),
        exchangeTimestampMs: t0 + i * 100,
        bookState: "valid",
        isEconomicallyValid: true,
        yesBestBidCents: 48,
        noBestBidCents: 50,
        yesBestBidSize: sizes.yes,
        noBestBidSize: sizes.no,
      }));
    }
    const io = createMemoryMicrostructureDiscoveryIo(
      baseFiles({
        [`${TRAIN}/top-of-book.jsonl`]: rows.join("\n"),
        [`${TRAIN}/market-metadata.jsonl`]: JSON.stringify({
          marketTicker: "MKT-A",
          closeTime: new Date(t0 + 20 * 60_000).toISOString(),
        }),
      }),
      baseDirs(),
    );
    const stream = await streamTrainMicrostructureDiscovery({
      io,
      trainCaptureRunDir: TRAIN,
      responseMatchToleranceMs: 250,
    });
    expect(stream.tobRecordsScanned).toBe(200);
    expect(stream.maxPendingPeak).toBeLessThan(stream.tobRecordsScanned);
    expect(stream.maxQuotesRetainedHint).toBe(stream.maxPendingPeak);
  });

  it("family hypothesis count constant matches discovery lineage", () => {
    expect(FAMILY_HYPOTHESIS_COUNT).toBe(12);
    expect(() => {
      throw new MicrostructureGovernedDiscoveryError("x");
    }).toThrow(MicrostructureGovernedDiscoveryError);
  });
});

// type-only usage to keep report type imported for tooling
export type _Report = MicrostructureGovernedDiscoveryReport;
