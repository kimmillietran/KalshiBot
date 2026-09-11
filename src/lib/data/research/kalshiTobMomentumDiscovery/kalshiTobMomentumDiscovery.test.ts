import { describe, expect, it } from "vitest";

import { buildHypothesisId, FAMILY_HYPOTHESIS_COUNT, RESPONSE_MATCH_TOLERANCE_MS } from "../kalshiTobMomentumFamily";
import {
  assertNetEdgeClaimFailsClosedWhenFeeUnbound,
  auditMomentumFeeContract,
  computeStructuralSimplicityRank,
  deriveMomentumRequiredEffectiveN,
} from "../momentumEvidenceContract";
import { computeRequiredSampleSize } from "../powerAnalysis/powerAnalysisMath";

import {
  BOUND_ALPHA,
  BOUND_MATERIAL_EFFECT_CENTS,
  BOUND_OUTCOME_SD_CENTS,
  BOUND_TARGET_POWER,
  DEFAULT_MOMENTUM_HOLDOUT_RUN_ID,
  DEFAULT_MOMENTUM_TRAIN_RUN_ID,
  DEFAULT_MOMENTUM_VALIDATION_RUN_ID,
  MomentumGovernedDiscoveryError,
  buildMomentumGovernedDiscoveryReport,
  buildMomentumResearchSplitManifest,
  createMemoryMomentumDiscoveryIo,
  createTrainOnlyMomentumDiscoveryIo,
  isDirectionConsistentWithFamily,
  median,
  parseMomentumDiscoveryArgv,
  sealMomentumPreOpenBundle,
  streamTrainMomentumDiscovery,
  type MomentumGovernedDiscoveryReport,
} from "./index";
import type { CellAccumulator, TrainStreamResult } from "./streamTrainMomentumDiscovery";

const CAPTURE_ROOT = "data/live-capture/forward-quotes";
const TRAIN = `${CAPTURE_ROOT}/${DEFAULT_MOMENTUM_TRAIN_RUN_ID}`;
const VAL = `${CAPTURE_ROOT}/${DEFAULT_MOMENTUM_VALIDATION_RUN_ID}`;
const HOLD = `${CAPTURE_ROOT}/${DEFAULT_MOMENTUM_HOLDOUT_RUN_ID}`;

function healthJson(durationSeconds = 28_800): string {
  return JSON.stringify({
    verdict: "ok",
    config: { durationSeconds },
  });
}

function baseDirs(): string[] {
  return [CAPTURE_ROOT, TRAIN, VAL, HOLD];
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
  lookbackWindowMs: number;
  thresholdCents: number;
  responseHorizonMs: number;
}): CellAccumulator {
  const hypothesisId = buildHypothesisId({
    backwardWindowMs: partial.lookbackWindowMs,
    returnThresholdCents: partial.thresholdCents,
    forwardHorizonMs: partial.responseHorizonMs,
  });
  return {
    candidateId: hypothesisId,
    hypothesisId,
    structuralSimplicityRank: computeStructuralSimplicityRank({
      candidateId: hypothesisId,
      hypothesisId,
      lookbackWindowMs: partial.lookbackWindowMs,
      thresholdCents: partial.thresholdCents,
      responseHorizonMs: partial.responseHorizonMs,
      direction: "continuation",
      discoveryRank: null,
    }),
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
  for (const lookbackWindowMs of [5_000, 15_000]) {
    for (const thresholdCents of [2, 3]) {
      for (const responseHorizonMs of [5_000, 15_000, 30_000]) {
        const cell = emptyCell({ lookbackWindowMs, thresholdCents, responseHorizonMs });
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
    anchorResolvableQuotes: 60,
    firstCrossingEventsTotal: [...cells.values()].reduce((s, c) => s + c.rawEvents, 0),
    refractoryEpisodesTotal: [...cells.values()].reduce((s, c) => s + c.refractoryEpisodes, 0),
    marketsTouched: new Set(["MKT-A"]),
    marketDaysTouched: new Set(["MKT-A:2026-09-08"]),
    responseObservabilityByHorizonMs: new Map([
      [5_000, { observable: 1, unobservable: 0 }],
      [15_000, { observable: 1, unobservable: 0 }],
      [30_000, { observable: 1, unobservable: 0 }],
    ]),
    maxPendingPeak: 3,
    maxQuotesRetainedHint: 3,
  };
}

describe("M14.0b momentum TRAIN discovery", () => {
  it("seals family/evidence/power before TRAIN outcome access", () => {
    const preOpen = sealMomentumPreOpenBundle();
    expect(preOpen.trainOutcomesOpened).toBe(false);
    expect(preOpen.familyReport.familyId).toBe("momentum");
    expect(preOpen.familyReport.subfamilyId).toBe(
      "kalshi-tob-mid-return-threshold-continuation-v1",
    );
    expect(preOpen.familyReport.searchUniverse.hypothesisCount).toBe(12);
    expect(preOpen.materialEffectThresholdCents).toBe(2);
    expect(preOpen.alpha).toBe(0.05);
    expect(preOpen.targetPower).toBe(0.8);
    expect(preOpen.outcomeStandardDeviationCents).toBe(10);
    expect(preOpen.familyDefinitionIdentity).toMatch(/^[a-f0-9]{64}$/);

    const modelN = deriveMomentumRequiredEffectiveN({
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
  });

  it("declares contaminated exploratory TRAIN and quarantines val/holdout", () => {
    const io = createMemoryMomentumDiscoveryIo(baseFiles(), baseDirs());
    const preOpen = sealMomentumPreOpenBundle();
    const manifest = buildMomentumResearchSplitManifest({
      io,
      trainCaptureRunDir: TRAIN,
      validationCaptureRunDir: VAL,
      holdoutCaptureRunDir: HOLD,
      familyDefinitionIdentity: preOpen.familyDefinitionIdentity,
      evidenceContractIdentity: preOpen.evidenceContractIdentity,
      captureRoot: CAPTURE_ROOT,
    });
    expect(manifest.train.contaminationClassification).toBe(
      "outcome-consumed-related-tob-price-response",
    );
    expect(manifest.train.eligibleForRole).toBe(true);
    expect(manifest.validation.quarantinedForOutcomeScoring).toBe(true);
    expect(manifest.holdout.quarantinedForOutcomeScoring).toBe(true);
    expect(manifest.validation.contaminationClassification).toBe("ineligible-validation");
    expect(manifest.holdout.contaminationClassification).toBe("ineligible-holdout");
  });

  it("IO-quarantines VALIDATION and HOLDOUT capture paths", () => {
    const io = createMemoryMomentumDiscoveryIo(baseFiles(), baseDirs());
    const trainOnly = createTrainOnlyMomentumDiscoveryIo({
      baseIo: io,
      quarantinedCaptureRunDirs: [VAL, HOLD],
    });
    expect(() => trainOnly.readFile(`${VAL}/top-of-book.jsonl`)).toThrow(/quarantined/i);
    expect(() => trainOnly.readFile(`${HOLD}/top-of-book.jsonl`)).toThrow(/quarantined/i);
    expect(trainOnly.fileExists(`${TRAIN}/capture-health.json`)).toBe(true);
  });

  it("retains all 12 canonical hypothesis cells", async () => {
    const cells = universeCells((cell) => {
      if (
        cell.lookbackWindowMs === 5_000
        && cell.thresholdCents === 2
        && cell.responseHorizonMs === 5_000
      ) {
        cell.rawEvents = 5;
        cell.refractoryEpisodes = 4;
        cell.observableResponses = 4;
        cell.executableObservableResponses = 4;
        cell.independentSignedExecutable = [3, 2, 4];
        cell.independentSignedMidpoint = [1, 1, 2];
        cell.independentMarketKeys = new Set(["A", "B", "C"]);
        cell.independentMarketDayKeys = new Set(["A:d1", "B:d1", "C:d1"]);
        cell.seenIndependentBlock.add(`${cell.candidateId}:A:d1`);
        cell.seenIndependentBlock.add(`${cell.candidateId}:B:d1`);
        cell.seenIndependentBlock.add(`${cell.candidateId}:C:d1`);
      }
    });
    const io = createMemoryMomentumDiscoveryIo(baseFiles(), baseDirs());
    const report = await buildMomentumGovernedDiscoveryReport({
      io,
      trainCaptureRunDir: TRAIN,
      validationCaptureRunDir: VAL,
      holdoutCaptureRunDir: HOLD,
      captureRoot: CAPTURE_ROOT,
      injectedTrainStream: injectedStream(cells),
      generatedAt: "2026-09-10T00:00:00.000Z",
    });
    expect(report.searchUniverse.hypothesisCount).toBe(12);
    expect(report.perCandidateResults).toHaveLength(12);
    expect(report.perCandidateResults.every((c) => c.direction === "continuation")).toBe(true);
    expect(report.perCandidateResults.every((c) => c.candidateId === c.hypothesisId)).toBe(true);
    expect(report.perCandidateResults.every((c) => c.hypothesisId.includes("|continuation"))).toBe(
      true,
    );
  });

  it("shortlists ≤3 and halts validation access when K>0", async () => {
    const cells = universeCells((cell) => {
      cell.rawEvents = 3;
      cell.refractoryEpisodes = 3;
      cell.observableResponses = 3;
      cell.executableObservableResponses = 3;
      cell.independentMarketKeys = new Set(["A", "B", "C"]);
      cell.independentMarketDayKeys = new Set(["A:d", "B:d", "C:d"]);
      cell.independentSignedExecutable = [1, 1, 1];
      cell.seenIndependentBlock.add(`${cell.candidateId}:block`);
    });
    const io = createMemoryMomentumDiscoveryIo(baseFiles(), baseDirs());
    const report = await buildMomentumGovernedDiscoveryReport({
      io,
      trainCaptureRunDir: TRAIN,
      validationCaptureRunDir: VAL,
      holdoutCaptureRunDir: HOLD,
      captureRoot: CAPTURE_ROOT,
      injectedTrainStream: injectedStream(cells),
      generatedAt: "2026-09-10T00:00:00.000Z",
    });
    expect(report.shortlist.length).toBeLessThanOrEqual(3);
    expect(report.discoveryStatus).toBe("train-shortlist-produced");
    expect(report.recommendedNextAction).toBe("train-shortlist-produced-halt-no-validation-access");
    expect(report.quarantine.validationAccess).toBe(false);
    expect(report.quarantine.holdoutAccess).toBe(false);
  });

  it("K=0 stops with no-candidates-eligible", async () => {
    const cells = universeCells((cell) => {
      cell.rawEvents = 2;
      cell.refractoryEpisodes = 2;
      cell.observableResponses = 2;
      cell.executableObservableResponses = 2;
      cell.independentSignedExecutable = [-1, -2];
      cell.independentMarketKeys = new Set(["A", "B"]);
      cell.independentMarketDayKeys = new Set(["A:d", "B:d"]);
      cell.seenIndependentBlock.add(`${cell.candidateId}:block`);
    });
    const io = createMemoryMomentumDiscoveryIo(baseFiles(), baseDirs());
    const report = await buildMomentumGovernedDiscoveryReport({
      io,
      trainCaptureRunDir: TRAIN,
      validationCaptureRunDir: VAL,
      holdoutCaptureRunDir: HOLD,
      captureRoot: CAPTURE_ROOT,
      injectedTrainStream: injectedStream(cells),
      generatedAt: "2026-09-10T00:00:00.000Z",
    });
    expect(report.shortlist.length).toBe(0);
    expect(report.discoveryStatus).toBe("no-candidates-eligible");
    expect(report.recommendedNextAction).toBe("stop-no-validation");
  });

  it("median>0 direction rule; zero is not consistent", () => {
    expect(isDirectionConsistentWithFamily(0.1)).toBe(true);
    expect(isDirectionConsistentWithFamily(0)).toBe(false);
    expect(isDirectionConsistentWithFamily(-0.1)).toBe(false);
    expect(median([-1, 0, 5])).toBe(0);
    expect(isDirectionConsistentWithFamily(median([-1, 0, 5]))).toBe(false);
  });

  it("fee fail-closed blocks net-edge claims", () => {
    const fee = auditMomentumFeeContract();
    expect(fee.netEdgePromotionAuthorized).toBe(false);
    expect(() =>
      assertNetEdgeClaimFailsClosedWhenFeeUnbound({
        feeContractStatus: fee.feeContractStatus,
        claimingNetEdge: true,
      }),
    ).toThrow(/fails closed/i);
  });

  it("streams first-crossing with response eligibility skip and anchor fail-closed reset", async () => {
    expect(RESPONSE_MATCH_TOLERANCE_MS).toBe(250);
    const t0 = Date.parse("2026-09-08T08:00:00.000Z");
    const eventT = t0 + 10_000;
    const close = eventT + 12 * 60_000;
    const responseT = eventT + 5_000 + 100;

    const lines = [
      {
        marketTicker: "MKT-A",
        receivedAtLocal: new Date(t0).toISOString(),
        exchangeTimestampMs: t0,
        bookState: "valid",
        isEconomicallyValid: true,
        yesBestBidCents: 46,
        noBestBidCents: 52,
        yesBestBidSize: 10,
        noBestBidSize: 10,
      },
      {
        marketTicker: "MKT-A",
        receivedAtLocal: new Date(t0 + 5_000).toISOString(),
        exchangeTimestampMs: t0 + 5_000,
        bookState: "valid",
        isEconomicallyValid: true,
        yesBestBidCents: 46,
        noBestBidCents: 52,
        yesBestBidSize: 10,
        noBestBidSize: 10,
      },
      {
        marketTicker: "MKT-A",
        receivedAtLocal: new Date(t0 + 9_900).toISOString(),
        exchangeTimestampMs: t0 + 9_900,
        bookState: "valid",
        isEconomicallyValid: true,
        yesBestBidCents: 46,
        noBestBidCents: 52,
        yesBestBidSize: 10,
        noBestBidSize: 10,
      },
      {
        marketTicker: "MKT-A",
        receivedAtLocal: new Date(eventT).toISOString(),
        exchangeTimestampMs: eventT,
        bookState: "valid",
        isEconomicallyValid: true,
        yesBestBidCents: 55,
        noBestBidCents: 43,
        yesBestBidSize: 10,
        noBestBidSize: 10,
      },
      {
        marketTicker: "MKT-A",
        receivedAtLocal: new Date(responseT).toISOString(),
        exchangeTimestampMs: responseT,
        bookState: "awaiting-snapshot",
        isEconomicallyValid: false,
        yesBestBidCents: 56,
        noBestBidCents: 42,
        yesBestBidSize: 10,
        noBestBidSize: 10,
      },
      {
        marketTicker: "MKT-A",
        receivedAtLocal: new Date(responseT + 50).toISOString(),
        exchangeTimestampMs: responseT + 50,
        bookState: "valid",
        isEconomicallyValid: true,
        yesBestBidCents: 57,
        noBestBidCents: 41,
        yesBestBidSize: 10,
        noBestBidSize: 10,
      },
    ]
      .map((row) => JSON.stringify(row))
      .join("\n");

    const io = createMemoryMomentumDiscoveryIo(
      baseFiles({
        [`${TRAIN}/top-of-book.jsonl`]: lines,
        [`${TRAIN}/market-metadata.jsonl`]: JSON.stringify({
          marketTicker: "MKT-A",
          closeTime: new Date(close).toISOString(),
        }),
      }),
      baseDirs(),
    );

    const stream = await streamTrainMomentumDiscovery({
      io,
      trainCaptureRunDir: TRAIN,
      responseMatchToleranceMs: 250,
    });
    expect(stream.cells.size).toBe(12);
    const cell = stream.cells.get(
      buildHypothesisId({
        backwardWindowMs: 5_000,
        returnThresholdCents: 2,
        forwardHorizonMs: 5_000,
      }),
    );
    expect(cell?.rawEvents).toBeGreaterThanOrEqual(1);
    expect(cell?.observableResponses).toBeGreaterThanOrEqual(1);
  });

  it("rejects forbidden argv overrides and sealed-science flags", () => {
    expect(() => parseMomentumDiscoveryArgv(["--validate"])).toThrow(/Forbidden authority/i);
    expect(() => parseMomentumDiscoveryArgv(["--holdout"])).toThrow(/Forbidden authority/i);
    expect(() => parseMomentumDiscoveryArgv(["--alpha", "0.01"])).toThrow(/Forbidden authority/i);
    const parsed = parseMomentumDiscoveryArgv(["--capture-root", CAPTURE_ROOT]);
    expect(parsed.trainCaptureRunDir).toBe(TRAIN);
  });

  it("bounded-memory processing signal (pending peak << scanned)", async () => {
    const t0 = Date.parse("2026-09-08T08:00:00.000Z");
    const close = t0 + 30 * 60_000;
    const rows: string[] = [];
    for (let i = 0; i < 200; i += 1) {
      const ts = t0 + i * 1_000;
      const mid = 48 + (i % 10);
      rows.push(JSON.stringify({
        marketTicker: "MKT-A",
        receivedAtLocal: new Date(ts).toISOString(),
        exchangeTimestampMs: ts,
        bookState: "valid",
        isEconomicallyValid: true,
        yesBestBidCents: mid,
        noBestBidCents: 100 - mid - 2,
        yesBestBidSize: 10,
        noBestBidSize: 10,
      }));
    }
    const io = createMemoryMomentumDiscoveryIo(
      baseFiles({
        [`${TRAIN}/top-of-book.jsonl`]: rows.join("\n"),
        [`${TRAIN}/market-metadata.jsonl`]: JSON.stringify({
          marketTicker: "MKT-A",
          closeTime: new Date(close).toISOString(),
        }),
      }),
      baseDirs(),
    );
    const stream = await streamTrainMomentumDiscovery({
      io,
      trainCaptureRunDir: TRAIN,
      responseMatchToleranceMs: 250,
    });
    expect(stream.tobRecordsScanned).toBe(200);
    expect(stream.maxPendingPeak).toBeLessThan(stream.tobRecordsScanned);
  });

  it("deterministic discovery identity and family hypothesis count", async () => {
    const cells = universeCells();
    const io = createMemoryMomentumDiscoveryIo(baseFiles(), baseDirs());
    const a = await buildMomentumGovernedDiscoveryReport({
      io,
      trainCaptureRunDir: TRAIN,
      validationCaptureRunDir: VAL,
      holdoutCaptureRunDir: HOLD,
      captureRoot: CAPTURE_ROOT,
      injectedTrainStream: injectedStream(cells),
      generatedAt: "2026-09-10T00:00:00.000Z",
    });
    const b = await buildMomentumGovernedDiscoveryReport({
      io,
      trainCaptureRunDir: TRAIN,
      validationCaptureRunDir: VAL,
      holdoutCaptureRunDir: HOLD,
      captureRoot: CAPTURE_ROOT,
      injectedTrainStream: injectedStream(cells),
      generatedAt: "2099-01-01T00:00:00.000Z",
    });
    expect(a.discoveryIdentity).toBe(b.discoveryIdentity);
    expect(FAMILY_HYPOTHESIS_COUNT).toBe(12);
    expect(() => {
      throw new MomentumGovernedDiscoveryError("x");
    }).toThrow(MomentumGovernedDiscoveryError);
  });
});

export type _Report = MomentumGovernedDiscoveryReport;
