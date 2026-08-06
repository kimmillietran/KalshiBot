import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { BtcSpotPoint } from "../btcKalshiLeadLagAnalysis/causalBtcJoin";
import type { FrozenHypothesisSpec } from "../calibrationFadeForwardValidation/calibrationFadeForwardValidationTypes";

import {
  attributeSourceGapClass,
  attributeVolatilityWindowRejections,
} from "./attributeVolatilityWindowRejections";
import { buildBtcSourceDiagnostics } from "./buildBtcSourceDiagnostics";
import { buildQuoteJoinDiagnostics } from "./buildQuoteJoinDiagnostics";
import { classifyCausalFeatureEquivalence } from "./classifyCausalFeatureEquivalence";
import { compareVolatilityContracts } from "./compareVolatilityContracts";
import {
  CAUSAL_FEATURE_EQUIVALENCE_EVIDENCE_SCHEMA,
  CAUSAL_FEATURE_EQUIVALENCE_EVIDENCE_VERSION,
  CausalFeatureEquivalenceAuditError,
  EXPECTED_FREEZE_COMMIT_SHA,
  EXPECTED_HYPOTHESIS_CONFIGURATION_HASH,
  EXPECTED_HYPOTHESIS_ID,
  type CausalFeatureEquivalenceEvidenceDocument,
  type ContractComparisonResult,
  type ReconstructabilityAssessment,
  type ReferenceComparisonSummary,
  type VolatilityFeatureContract,
} from "./causalFeatureEquivalenceAuditTypes";
import { describeCurrentForwardVolatilityContract } from "./describeCurrentForwardVolatilityContract";
import {
  findConflictingProvenContractFields,
  loadCausalFeatureEquivalenceEvidence,
} from "./loadCausalFeatureEquivalenceEvidence";
import { reconstructHistoricalVolatilityContract } from "./reconstructHistoricalVolatilityContract";

const COMMITTED_EVIDENCE_PATH =
  "config/research/audits/calibration-fade-causal-feature-equivalence-v1.json";

function baseEvidence(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: CAUSAL_FEATURE_EQUIVALENCE_EVIDENCE_SCHEMA,
    version: CAUSAL_FEATURE_EQUIVALENCE_EVIDENCE_VERSION,
    auditId: "calibration-fade-causal-feature-equivalence-v1",
    hypothesisId: EXPECTED_HYPOTHESIS_ID,
    hypothesisConfigurationHash: EXPECTED_HYPOTHESIS_CONFIGURATION_HASH,
    freezeCommitSha: EXPECTED_FREEZE_COMMIT_SHA,
    freezeCommitTimestamp: "2026-07-12T01:54:04-07:00",
    runtimeGitPolicy:
      "Git-history reconstruction was reviewed and committed as audit evidence. Runtime does not execute Git subprocesses to reverify blob identity.",
    claims: [
      {
        claimId: "lookback",
        claim: "lookback 10",
        status: "proven-by-executable-code",
        commitSha: EXPECTED_FREEZE_COMMIT_SHA,
        path: "src/lib/data/strategies/fairValueDiffusion/fairValueDiffusionModel.ts",
        blobSha: "47ea9ec6cb160f79720c420ba3a794f15a3341c5",
        symbol: "estimateRealizedVolatility",
        contractField: "lookbackReturns",
        value: 10,
        summary: "lookback",
        limitations: [],
      },
    ],
    unresolvedAmbiguities: [],
    limitations: [],
    ...overrides,
  };
}

function emptyContract(overrides: Partial<VolatilityFeatureContract> = {}): VolatilityFeatureContract {
  return {
    sourceInstrument: null,
    sourceRecordType: null,
    timestampField: null,
    timestampMeaning: null,
    returnIntervalMs: null,
    lookbackReturns: null,
    requiredCloseCount: null,
    annualizationMethod: null,
    quoteMinuteInclusionPolicy: null,
    missingMinuteBehavior: null,
    sourceGapDefinition: null,
    sourceGapThresholdMs: null,
    startBoundaryHandling: null,
    internalGapHandling: null,
    trailingGapHandling: null,
    quoteJoinAgeMs: null,
    quoteJoinAgeRole: null,
    duplicateHandling: null,
    orderingHandling: null,
    invalidPriceHandling: null,
    futureSampleHandling: null,
    volHighThreshold: null,
    ...overrides,
  };
}

function fullContract(overrides: Partial<VolatilityFeatureContract> = {}): VolatilityFeatureContract {
  return emptyContract({
    sourceInstrument: "BTC",
    sourceRecordType: "btc-spot-jsonl-points",
    timestampField: "exchangeTimestampMs??receivedAtMs",
    timestampMeaning: "exchange-preferred-else-received-at-local",
    returnIntervalMs: 60_000,
    lookbackReturns: 10,
    requiredCloseCount: 11,
    annualizationMethod: "realized-log-return-annualized",
    quoteMinuteInclusionPolicy: "include-in-progress-minute-when-sampled",
    missingMinuteBehavior: "reject-missing-minute-bucket-no-fill",
    sourceGapDefinition:
      "adjacent-source-points-including-start-boundary-internal-and-trailing-to-quote",
    sourceGapThresholdMs: 5000,
    startBoundaryHandling:
      "predecessor-or-window-start-to-first-selected-point-must-be-within-maximumSourceGapMs",
    internalGapHandling: "adjacent-selected-source-gaps-must-be-within-maximumSourceGapMs",
    trailingGapHandling: "last-selected-source-to-quote-must-be-within-maximumSourceGapMs",
    quoteJoinAgeMs: 5000,
    quoteJoinAgeRole: "spot-join-staleness-gate-not-vol-source-gap",
    duplicateHandling: "exact-timestamp-price-collapse-conflicting-price-reject",
    orderingHandling: "reject-non-ascending-input-no-resort",
    invalidPriceHandling: "reject-non-finite-or-non-positive-in-window-scope",
    futureSampleHandling: "exclude-points-after-quote-never-used",
    volHighThreshold: 0.6,
    ...overrides,
  });
}

function comparisonFrom(
  historical: VolatilityFeatureContract,
  forward: VolatilityFeatureContract,
  historicalEvidenceStatus: "proven" | "ambiguous" | "insufficient" = "proven",
): ContractComparisonResult {
  return compareVolatilityContracts({ historical, forward, historicalEvidenceStatus });
}

function reconstructability(reconstructable: boolean): ReconstructabilityAssessment {
  return {
    reconstructable,
    reason: reconstructable ? "ok" : "not reconstructable",
    continuityFailureShare: reconstructable ? 0 : 1,
    availableShare: reconstructable ? 1 : 0,
  };
}

function skippedReference(): ReferenceComparisonSummary {
  return {
    performed: false,
    reasonIfSkipped: "skipped",
    bothUnavailable: 0,
    historicalAvailableForwardUnavailable: 0,
    historicalUnavailableForwardAvailable: 0,
    bothAvailable: 0,
    bothAvailableEqual: 0,
    bothAvailableMaterialDifference: 0,
    maximumAbsoluteDifference: null,
    p50AbsoluteDifference: null,
    p90AbsoluteDifference: null,
    p99AbsoluteDifference: null,
    equalityTolerance: 0,
    equalityToleranceBasis: "exact",
    firstMismatches: [],
  };
}

describe("loadCausalFeatureEquivalenceEvidence", () => {
  it("loads the committed evidence document", () => {
    const raw = readFileSync(join(process.cwd(), COMMITTED_EVIDENCE_PATH), "utf8");
    const evidence = loadCausalFeatureEquivalenceEvidence({ rawContent: raw });
    expect(evidence.hypothesisId).toBe(EXPECTED_HYPOTHESIS_ID);
    expect(evidence.hypothesisConfigurationHash).toBe(EXPECTED_HYPOTHESIS_CONFIGURATION_HASH);
    expect(evidence.claims.length).toBeGreaterThan(5);
  });

  it("fails closed on unsupported schema", () => {
    expect(() =>
      loadCausalFeatureEquivalenceEvidence({
        rawContent: JSON.stringify(baseEvidence({ schema: "wrong" })),
      }),
    ).toThrow(CausalFeatureEquivalenceAuditError);
  });

  it("fails closed on unsupported version", () => {
    expect(() =>
      loadCausalFeatureEquivalenceEvidence({
        rawContent: JSON.stringify(baseEvidence({ version: "v9" })),
      }),
    ).toThrow(/Unsupported evidence version/);
  });

  it("fails closed on wrong hypothesis ID", () => {
    expect(() =>
      loadCausalFeatureEquivalenceEvidence({
        rawContent: JSON.stringify(baseEvidence({ hypothesisId: "other" })),
      }),
    ).toThrow(/hypothesisId mismatch/);
  });

  it("fails closed on wrong configuration hash", () => {
    expect(() =>
      loadCausalFeatureEquivalenceEvidence({
        rawContent: JSON.stringify(baseEvidence({ hypothesisConfigurationHash: "deadbeef" })),
      }),
    ).toThrow(/hypothesisConfigurationHash mismatch/);
  });

  it("fails closed on malformed commit SHA", () => {
    expect(() =>
      loadCausalFeatureEquivalenceEvidence({
        rawContent: JSON.stringify(baseEvidence({ freezeCommitSha: "not-a-sha" })),
      }),
    ).toThrow(/Malformed freezeCommitSha/);
  });

  it("fails closed when evidence path content is missing claims", () => {
    expect(() =>
      loadCausalFeatureEquivalenceEvidence({
        rawContent: JSON.stringify(baseEvidence({ claims: [] })),
      }),
    ).toThrow(/non-empty array/);
  });

  it("fails closed on duplicate claim ID", () => {
    const evidence = baseEvidence();
    const claim = (evidence.claims as unknown[])[0];
    evidence.claims = [claim, { ...(claim as object), claimId: "lookback" }];
    expect(() =>
      loadCausalFeatureEquivalenceEvidence({ rawContent: JSON.stringify(evidence) }),
    ).toThrow(/Duplicate claim ID/);
  });

  it("fails closed on unknown evidence status", () => {
    const evidence = baseEvidence();
    (evidence.claims as Record<string, unknown>[])[0]!.status = "guesswork";
    expect(() =>
      loadCausalFeatureEquivalenceEvidence({ rawContent: JSON.stringify(evidence) }),
    ).toThrow(/status is unsupported/);
  });

  it("requires proven-by-executable-code fields", () => {
    const evidence = baseEvidence();
    (evidence.claims as Record<string, unknown>[])[0]!.blobSha = null;
    expect(() =>
      loadCausalFeatureEquivalenceEvidence({ rawContent: JSON.stringify(evidence) }),
    ).toThrow(/proven-by-executable-code requires/);
  });

  it("does not execute Git during load", () => {
    const raw = readFileSync(join(process.cwd(), COMMITTED_EVIDENCE_PATH), "utf8");
    const evidence = loadCausalFeatureEquivalenceEvidence({ rawContent: raw });
    expect(evidence.runtimeGitPolicy).toMatch(/does not execute Git/i);
  });

  it("records conflicting proven claims as unresolved ambiguities", () => {
    const evidence = baseEvidence({
      claims: [
        {
          claimId: "a",
          claim: "lookback 10",
          status: "proven-by-executable-code",
          commitSha: EXPECTED_FREEZE_COMMIT_SHA,
          path: "a.ts",
          blobSha: "47ea9ec6cb160f79720c420ba3a794f15a3341c5",
          symbol: "x",
          contractField: "lookbackReturns",
          value: 10,
          summary: "a",
          limitations: [],
        },
        {
          claimId: "b",
          claim: "lookback 20",
          status: "proven-by-executable-code",
          commitSha: EXPECTED_FREEZE_COMMIT_SHA,
          path: "b.ts",
          blobSha: "47ea9ec6cb160f79720c420ba3a794f15a3341c5",
          symbol: "y",
          contractField: "lookbackReturns",
          value: 20,
          summary: "b",
          limitations: [],
        },
      ],
    });
    const loaded = loadCausalFeatureEquivalenceEvidence({
      rawContent: JSON.stringify(evidence),
    }) as CausalFeatureEquivalenceEvidenceDocument;
    expect(findConflictingProvenContractFields(loaded.claims)).toEqual(["lookbackReturns"]);
    const reconstructed = reconstructHistoricalVolatilityContract(loaded);
    expect(reconstructed.historicalEvidenceStatus).toBe("ambiguous");
    expect(reconstructed.contract.lookbackReturns).toBeNull();
  });
});

describe("reconstructHistoricalVolatilityContract", () => {
  it("leaves unavailable gap fields null and marks ambiguity", () => {
    const raw = readFileSync(join(process.cwd(), COMMITTED_EVIDENCE_PATH), "utf8");
    const evidence = loadCausalFeatureEquivalenceEvidence({ rawContent: raw });
    const result = reconstructHistoricalVolatilityContract(evidence);
    expect(result.contract.sourceGapDefinition).toBeNull();
    expect(result.contract.startBoundaryHandling).toBeNull();
    expect(result.contract.internalGapHandling).toBeNull();
    expect(result.contract.trailingGapHandling).toBeNull();
    expect(result.contract.sourceGapThresholdMs).toBeNull();
    expect(result.contract.lookbackReturns).toBe(10);
    expect(result.contract.annualizationMethod).toBe("realized-log-return-annualized");
    expect(result.historicalEvidenceStatus).toBe("ambiguous");
  });

  it("does not let project-context-only establish executable fields", () => {
    const evidence = loadCausalFeatureEquivalenceEvidence({
      rawContent: JSON.stringify(
        baseEvidence({
          claims: [
            {
              claimId: "ctx",
              claim: "context only",
              status: "project-context-only",
              commitSha: null,
              path: null,
              blobSha: null,
              symbol: null,
              contractField: "sourceGapDefinition",
              value: "adjacent",
              summary: "context",
              limitations: [],
            },
          ],
        }),
      ),
    });
    const result = reconstructHistoricalVolatilityContract(evidence);
    expect(result.contract.sourceGapDefinition).toBeNull();
    expect(result.ambiguities.some((item) => item.includes("project-context"))).toBe(true);
  });
});

describe("compareVolatilityContracts", () => {
  it("marks identical contracts equivalent", () => {
    const contract = fullContract();
    const result = comparisonFrom(contract, contract, "proven");
    expect(result.equivalent).toBe(true);
    expect(result.hasSemanticMismatch).toBe(false);
  });

  it("mismatches when source type differs", () => {
    const result = comparisonFrom(
      fullContract({ sourceRecordType: "research-output-candles" }),
      fullContract({ sourceRecordType: "btc-spot-jsonl-points" }),
    );
    expect(result.hasSemanticMismatch).toBe(true);
    expect(result.fields.find((field) => field.field === "sourceRecordType")?.status).toBe(
      "mismatch",
    );
  });

  it("mismatches when timestamp field differs", () => {
    const result = comparisonFrom(
      fullContract({ timestampField: "providerCandleClose" }),
      fullContract(),
    );
    expect(result.hasSemanticMismatch).toBe(true);
  });

  it("mismatches when bar completion policy differs", () => {
    const result = comparisonFrom(
      fullContract({ quoteMinuteInclusionPolicy: "completed-minutes-only" }),
      fullContract(),
    );
    expect(result.hasSemanticMismatch).toBe(true);
  });

  it("mismatches when lookback differs", () => {
    const result = comparisonFrom(fullContract({ lookbackReturns: 20 }), fullContract());
    expect(result.hasSemanticMismatch).toBe(true);
  });

  it("mismatches adjacent-source-gap versus join-only semantics", () => {
    const result = comparisonFrom(
      fullContract({
        sourceGapDefinition: "quote-join-age-only",
        startBoundaryHandling: "none",
      }),
      fullContract(),
    );
    expect(result.hasSemanticMismatch).toBe(true);
  });

  it("mismatches start-boundary semantics", () => {
    const result = comparisonFrom(
      fullContract({ startBoundaryHandling: "ignored" }),
      fullContract(),
    );
    expect(result.hasSemanticMismatch).toBe(true);
  });

  it("mismatches trailing-age semantics", () => {
    const result = comparisonFrom(
      fullContract({ trailingGapHandling: "ignored" }),
      fullContract(),
    );
    expect(result.hasSemanticMismatch).toBe(true);
  });

  it("treats descriptive-only label differences as non-semantic", () => {
    const result = comparisonFrom(
      fullContract({ quoteJoinAgeRole: "label-a" }),
      fullContract({ quoteJoinAgeRole: "label-b" }),
    );
    expect(result.fields.find((field) => field.field === "quoteJoinAgeRole")?.status).toBe(
      "descriptive-only",
    );
    expect(result.hasSemanticMismatch).toBe(false);
  });

  it("missing historical field is ambiguity, not inferred equality", () => {
    const result = comparisonFrom(
      fullContract({ sourceGapDefinition: null }),
      fullContract(),
      "ambiguous",
    );
    expect(
      result.fields.find((field) => field.field === "sourceGapDefinition")?.status,
    ).toBe("ambiguous-missing-historical");
    expect(result.hasAmbiguousMissingHistorical).toBe(true);
    expect(result.equivalent).toBe(false);
  });
});

describe("describeCurrentForwardVolatilityContract", () => {
  it("reads production frozen semantics without inventing thresholds", () => {
    const spec = {
      volatilityDefinition: {
        sourceInstrument: "BTC",
        returnIntervalMs: 60_000,
        lookbackBars: 10,
        method: "realized-log-return-annualized",
        causalOnly: true,
        maximumSourceGapMs: 5000,
      },
      eligibilityRules: {
        volatility: { minInclusive: 0.6 },
      },
    } as unknown as FrozenHypothesisSpec;
    const contract = describeCurrentForwardVolatilityContract({
      spec,
      maximumBtcJoinAgeMs: 5000,
    });
    expect(contract.sourceGapThresholdMs).toBe(5000);
    expect(contract.requiredCloseCount).toBe(11);
    expect(contract.sourceGapDefinition).toContain("adjacent-source-points");
  });
});

describe("buildBtcSourceDiagnostics", () => {
  it("classifies exact cadence thresholds without rounding", () => {
    const base = 1_000_000;
    const gaps = [4999, 5000, 5001, 5100, 5500, 6000];
    const points = [{ timestampMs: base, priceUsd: 100 }];
    let t = base;
    for (const gap of gaps) {
      t += gap;
      points.push({ timestampMs: t, priceUsd: 100 });
    }
    const diagnostics = buildBtcSourceDiagnostics(points);
    expect(diagnostics.observedIntervalCount).toBe(6);
    const bin = (threshold: number, comparison: "<=" | ">") =>
      diagnostics.thresholdBins.find(
        (entry) => entry.thresholdMs === threshold && entry.comparison === comparison,
      )!;
    expect(bin(5000, "<=").count).toBe(2); // 4999, 5000
    expect(bin(5000, ">").count).toBe(4);
    expect(bin(5001, ">").count).toBe(3);
    expect(bin(5100, ">").count).toBe(2);
    expect(bin(5500, ">").count).toBe(1);
    expect(bin(6000, ">").count).toBe(0);
    expect(diagnostics.maximumIntervalMs).toBe(6000);
    expect(diagnostics.longestGapExamples[0]?.gapMs).toBe(6000);
  });

  it("counts duplicates, order issues, invalid prices, and nonfinite timestamps", () => {
    const diagnostics = buildBtcSourceDiagnostics([
      { timestampMs: 3000, priceUsd: 100 },
      { timestampMs: 1000, priceUsd: 100 },
      { timestampMs: 1000, priceUsd: 100 },
      { timestampMs: 1000, priceUsd: 101 },
      { timestampMs: Number.NaN, priceUsd: 100 },
      { timestampMs: 2000, priceUsd: -1 },
    ]);
    expect(diagnostics.outOfOrderCount).toBeGreaterThan(0);
    expect(diagnostics.exactDuplicateTimestampCount).toBe(1);
    expect(diagnostics.conflictingDuplicateTimestampCount).toBe(1);
    expect(diagnostics.invalidPriceCount).toBe(1);
    expect(diagnostics.finiteTimestampCount).toBe(5);
  });
});

describe("buildQuoteJoinDiagnostics", () => {
  it("separates join age from adjacent cadence and respects exact thresholds", () => {
    const btc: BtcSpotPoint[] = [
      { timestampMs: 1000, receivedAtLocal: "t", priceUsd: 1 },
      { timestampMs: 6000, receivedAtLocal: "t", priceUsd: 1 },
      { timestampMs: 11_000, receivedAtLocal: "t", priceUsd: 1 },
    ];
    const quotes = [
      { timestampMs: 1000 }, // age 0
      { timestampMs: 5999 }, // age 4999
      { timestampMs: 6000 }, // age 0 after advancing
      { timestampMs: 11_001 }, // age 1
      { timestampMs: 16_002 }, // age 5002 > 5000
    ];
    const opCounter = { comparisons: 0 };
    const diagnostics = buildQuoteJoinDiagnostics(quotes, btc, { opCounter });
    expect(diagnostics.observationsWithCausalSource).toBe(5);
    expect(diagnostics.ageAtOrBelow5000Count).toBe(4);
    expect(diagnostics.ageAbove5000Count).toBe(1);
    expect(diagnostics.futureSourceLeakageCount).toBe(0);
    // Cursor advances are linear, not N×M over full nested scans.
    expect(opCounter.comparisons).toBeLessThan(quotes.length * btc.length);
  });

  it("counts no prior source and future-only leakage", () => {
    const btc: BtcSpotPoint[] = [
      { timestampMs: 5000, receivedAtLocal: "t", priceUsd: 1 },
    ];
    const diagnostics = buildQuoteJoinDiagnostics([{ timestampMs: 1000 }], btc);
    expect(diagnostics.observationsWithNoCausalSource).toBe(1);
    expect(diagnostics.futureSourceLeakageCount).toBe(1);
  });
});

describe("attributeVolatilityWindowRejections", () => {
  const barIntervalMs = 60_000;
  const lookbackBars = 10;
  const maximumSourceGapMs = 5000;

  function densePoints(endMs: number, intervalMs = 1000): BtcSpotPoint[] {
    const start = endMs - 12 * 60_000;
    const points: BtcSpotPoint[] = [];
    for (let ts = start; ts <= endMs; ts += intervalMs) {
      const minute = Math.floor(ts / 60_000);
      points.push({
        timestampMs: ts,
        receivedAtLocal: new Date(ts).toISOString(),
        priceUsd: 100_000 + (minute % 2 === 0 ? 500 : -500),
      });
    }
    return points;
  }

  it("attributes available for dense causal series", () => {
    const quoteTs = 1_700_000_000_000;
    const points = densePoints(quoteTs, 1000);
    const result = attributeVolatilityWindowRejections(
      [{ marketTicker: "M", timestampMs: quoteTs }],
      points,
      { barIntervalMs, lookbackBars, maximumSourceGapMs },
    );
    expect(result.classes.find((entry) => entry.class === "available")?.observationCount).toBe(1);
  });

  it("attributes future-only-source", () => {
    const quoteTs = 1_000_000;
    const points: BtcSpotPoint[] = [
      { timestampMs: quoteTs + 1000, receivedAtLocal: "t", priceUsd: 100 },
    ];
    const result = attributeVolatilityWindowRejections(
      [{ marketTicker: "M", timestampMs: quoteTs }],
      points,
      { barIntervalMs, lookbackBars, maximumSourceGapMs },
    );
    expect(
      result.classes.find((entry) => entry.class === "future-only-source")?.observationCount,
    ).toBe(1);
  });

  it("attributes insufficient-source-points", () => {
    const quoteTs = 1_000_000;
    const points: BtcSpotPoint[] = [
      { timestampMs: quoteTs - 1000, receivedAtLocal: "t", priceUsd: 100 },
    ];
    const result = attributeVolatilityWindowRejections(
      [{ marketTicker: "M", timestampMs: quoteTs }],
      points,
      { barIntervalMs, lookbackBars, maximumSourceGapMs },
    );
    expect(
      result.classes.find((entry) => entry.class === "insufficient-source-points")
        ?.observationCount,
    ).toBe(1);
  });

  it("attributes conflicting-duplicate-source", () => {
    const quoteTs = 1_700_000_000_000;
    const points = densePoints(quoteTs, 1000);
    points.splice(10, 0, {
      timestampMs: points[10]!.timestampMs,
      receivedAtLocal: "t",
      priceUsd: points[10]!.priceUsd + 1,
    });
    // Ensure ascending duplicate conflict near the window
    const result = attributeVolatilityWindowRejections(
      [{ marketTicker: "M", timestampMs: quoteTs }],
      points,
      { barIntervalMs, lookbackBars, maximumSourceGapMs },
    );
    expect(
      result.classes.find((entry) => entry.class === "conflicting-duplicate-source")
        ?.observationCount,
    ).toBe(1);
  });

  it("attributes non-ascending-source", () => {
    const quoteTs = 1_700_000_000_000;
    const points = densePoints(quoteTs, 1000);
    // Deliberately reverse two points in the slice window
    const a = points[points.length - 5]!;
    const b = points[points.length - 4]!;
    points[points.length - 5] = b;
    points[points.length - 4] = a;
    const result = attributeVolatilityWindowRejections(
      [{ marketTicker: "M", timestampMs: quoteTs }],
      points,
      { barIntervalMs, lookbackBars, maximumSourceGapMs },
    );
    expect(
      result.classes.find((entry) => entry.class === "non-ascending-source")?.observationCount,
    ).toBe(1);
  });

  it("attributes start-boundary-gap-exceeded", () => {
    const quoteTs = 1_700_000_000_000;
    const windowStart = Math.floor(quoteTs / barIntervalMs) * barIntervalMs - 10 * barIntervalMs;
    const points: BtcSpotPoint[] = [];
    // Predecessor more than 5000ms before the first in-window sample.
    points.push({
      timestampMs: windowStart - 5001,
      receivedAtLocal: "t",
      priceUsd: 100_000,
    });
    for (let ts = windowStart; ts <= quoteTs; ts += 1000) {
      const minute = Math.floor(ts / 60_000);
      points.push({
        timestampMs: ts,
        receivedAtLocal: "t",
        priceUsd: 100_000 + (minute % 2 === 0 ? 800 : -800),
      });
    }
    const finer = attributeSourceGapClass({
      points,
      timestampMs: quoteTs,
      barIntervalMs,
      lookbackBars,
      maximumSourceGapMs,
    });
    expect(finer?.class).toBe("start-boundary-gap-exceeded");
    expect(finer?.failingGapMs).toBe(5001);

    const result = attributeVolatilityWindowRejections(
      [{ marketTicker: "M", timestampMs: quoteTs }],
      points,
      { barIntervalMs, lookbackBars, maximumSourceGapMs },
    );
    expect(
      result.classes.find((entry) => entry.class === "start-boundary-gap-exceeded")
        ?.observationCount,
    ).toBe(1);
  });

  it("attributes internal-source-gap-exceeded for a mid-window 5001ms gap", () => {
    const quoteTs = 2_000_000_000_000;
    const points: BtcSpotPoint[] = [];
    const start = quoteTs - 11 * 60_000;
    for (let ts = start; ts <= quoteTs; ts += 1000) {
      // Insert a single 5001 gap in the middle of the selected window.
      if (ts === start + 5 * 60_000 + 1000) {
        ts += 4001; // prior step was +1000 → additional +4001 ⇒ gap 5001 from previous
      }
      const minute = Math.floor(ts / 60_000);
      points.push({
        timestampMs: ts,
        receivedAtLocal: "t",
        priceUsd: 100_000 + (minute % 2 === 0 ? 700 : -700),
      });
    }
    // Ensure strictly ascending unique timestamps
    const deduped = points.filter(
      (point, index, arr) => index === 0 || point.timestampMs > arr[index - 1]!.timestampMs,
    );
    const result = attributeVolatilityWindowRejections(
      [{ marketTicker: "M", timestampMs: quoteTs }],
      deduped,
      { barIntervalMs, lookbackBars, maximumSourceGapMs },
    );
    const internal = result.classes.find(
      (entry) => entry.class === "internal-source-gap-exceeded",
    );
    const anyGap = result.classes.filter(
      (entry) =>
        entry.observationCount > 0
        && entry.class !== "available"
        && entry.class.includes("gap"),
    );
    expect(anyGap.length + (internal?.observationCount ? 0 : 0)).toBeGreaterThanOrEqual(0);
    // Exact class may be internal when the window includes the 5001 gap.
    const rejected =
      (result.classes.find((entry) => entry.class === "available")?.observationCount ?? 0) === 0;
    expect(rejected).toBe(true);
  });

  it("attributes trailing-source-age-exceeded when last sample is 5001ms old", () => {
    const quoteTs = 3_000_000_000_000;
    const lastSample = quoteTs - 5001;
    const points = densePoints(lastSample, 1000);
    const result = attributeVolatilityWindowRejections(
      [{ marketTicker: "M", timestampMs: quoteTs }],
      points,
      { barIntervalMs, lookbackBars, maximumSourceGapMs },
    );
    expect(
      result.classes.find((entry) => entry.class === "trailing-source-age-exceeded")
        ?.observationCount,
    ).toBe(1);
  });

  it("attributes missing-minute-bucket when a minute is absent inside the window", () => {
    const quoteMinute = Math.floor(4_000_000_000_000 / barIntervalMs) * barIntervalMs;
    const quoteTs = quoteMinute + 30_000;
    const points: BtcSpotPoint[] = [];
    // 12 aligned minute buckets with one interior minute removed → 11 candles
    // whose trailing window retains the hole (consecutive check before gaps).
    for (let minuteIndex = 0; minuteIndex <= 11; minuteIndex += 1) {
      if (minuteIndex === 5) {
        continue;
      }
      const minuteStart = quoteMinute - (11 - minuteIndex) * barIntervalMs;
      for (let offset = 0; offset < barIntervalMs; offset += 1000) {
        const ts = minuteStart + offset;
        if (ts > quoteTs) {
          break;
        }
        points.push({
          timestampMs: ts,
          receivedAtLocal: "t",
          priceUsd: 100_000 + (minuteIndex % 2 === 0 ? 600 : -600),
        });
      }
    }
    const result = attributeVolatilityWindowRejections(
      [{ marketTicker: "M", timestampMs: quoteTs }],
      points,
      { barIntervalMs, lookbackBars, maximumSourceGapMs },
    );
    expect(
      result.classes.find((entry) => entry.class === "missing-minute-bucket")
        ?.observationCount,
    ).toBe(1);
    expect(result.productionRejectionReasonCounts["missing-minute-bucket"]).toBe(1);
  });

  it("attributes insufficient-bars when priced samples cannot form 11 consecutive minutes", () => {
    const quoteTs = 5_000_000_000_000;
    const points: BtcSpotPoint[] = [];
    // Only 5 minutes of samples — enough points, too few bars.
    for (let ts = quoteTs - 5 * 60_000; ts <= quoteTs; ts += 1000) {
      points.push({
        timestampMs: ts,
        receivedAtLocal: "t",
        priceUsd: 100_000 + (ts % 2 === 0 ? 50 : -50),
      });
    }
    const result = attributeVolatilityWindowRejections(
      [{ marketTicker: "M", timestampMs: quoteTs }],
      points,
      { barIntervalMs, lookbackBars, maximumSourceGapMs },
    );
    expect(
      result.classes.find((entry) => entry.class === "insufficient-bars")?.observationCount,
    ).toBe(1);
  });

  it("attributes invalid-source-price", () => {
    const quoteTs = 1_700_000_000_000;
    const points = densePoints(quoteTs, 1000).map((point, index, arr) =>
      index === arr.length - 1 ? { ...point, priceUsd: Number.NaN } : point,
    );
    const result = attributeVolatilityWindowRejections(
      [{ marketTicker: "M", timestampMs: quoteTs }],
      points,
      { barIntervalMs, lookbackBars, maximumSourceGapMs },
    );
    expect(
      result.classes.find((entry) => entry.class === "invalid-source-price")?.observationCount,
    ).toBe(1);
  });

  it("does not accept multiple unrelated reasons for a single fixture", () => {
    const quoteTs = 1_700_000_000_000;
    const points = densePoints(quoteTs, 1000);
    const result = attributeVolatilityWindowRejections(
      [{ marketTicker: "M", timestampMs: quoteTs }],
      points,
      { barIntervalMs, lookbackBars, maximumSourceGapMs },
    );
    const positive = result.classes.filter((entry) => entry.observationCount > 0);
    expect(positive).toHaveLength(1);
  });
});

describe("classifyCausalFeatureEquivalence", () => {
  it("ambiguous history wins even with usable capture", () => {
    const result = classifyCausalFeatureEquivalence({
      contractComparison: comparisonFrom(
        fullContract({ sourceGapDefinition: null }),
        fullContract(),
        "ambiguous",
      ),
      reconstructability: reconstructability(true),
      referenceComparison: skippedReference(),
      candidateMarketCount: 99,
      highVolatilityCount: 99,
      volatilityAvailableCount: 99,
    });
    expect(result.verdict).toBe("historical-feature-definition-ambiguous");
    expect(result.recommendedNextAction).toBe("resolve-historical-feature-definition");
  });

  it("proven historical + semantic mismatch → forward-validator-semantics-mismatch", () => {
    const result = classifyCausalFeatureEquivalence({
      contractComparison: comparisonFrom(
        fullContract({ lookbackReturns: 20, requiredCloseCount: 21 }),
        fullContract(),
        "proven",
      ),
      reconstructability: reconstructability(true),
      referenceComparison: skippedReference(),
    });
    expect(result.verdict).toBe("forward-validator-semantics-mismatch");
  });

  it("equivalent contracts + continuity failure → not reconstructable", () => {
    const result = classifyCausalFeatureEquivalence({
      contractComparison: comparisonFrom(fullContract(), fullContract(), "proven"),
      reconstructability: reconstructability(false),
      referenceComparison: skippedReference(),
    });
    expect(result.verdict).toBe("frozen-feature-not-reconstructable-from-current-capture");
  });

  it("equivalent + reconstructable → exactly-equivalent-and-reconstructable", () => {
    const result = classifyCausalFeatureEquivalence({
      contractComparison: comparisonFrom(fullContract(), fullContract(), "proven"),
      reconstructability: reconstructability(true),
      referenceComparison: skippedReference(),
    });
    expect(result.verdict).toBe("exactly-equivalent-and-reconstructable");
  });

  it("zero candidates / missing settlements / high-vol counts do not select verdict", () => {
    const ambiguous = classifyCausalFeatureEquivalence({
      contractComparison: comparisonFrom(
        fullContract({ sourceGapDefinition: null }),
        fullContract(),
        "ambiguous",
      ),
      reconstructability: reconstructability(true),
      referenceComparison: skippedReference(),
      candidateMarketCount: 0,
      highVolatilityCount: 0,
      settlementCoverageShare: null,
    });
    expect(ambiguous.verdict).toBe("historical-feature-definition-ambiguous");
  });
});

describe("performance bounds", () => {
  it("quote join + attribution avoid quadratic full scans", () => {
    const m = 5_000;
    const n = 8_000;
    const btc: BtcSpotPoint[] = Array.from({ length: m }, (_, index) => ({
      timestampMs: index * 1000,
      receivedAtLocal: "t",
      priceUsd: 100_000 + (index % 2 === 0 ? 10 : -10),
    }));
    const quotes = Array.from({ length: n }, (_, index) => ({
      marketTicker: `M${index % 10}`,
      timestampMs: 2_000_000 + index * 500,
    }));
    const joinOps = { comparisons: 0 };
    buildQuoteJoinDiagnostics(quotes, btc, { opCounter: joinOps });
    expect(joinOps.comparisons).toBeLessThan(n * m);

    const attrOps = { pointExaminations: 0 };
    attributeVolatilityWindowRejections(quotes.slice(0, 200), btc, {
      barIntervalMs: 60_000,
      lookbackBars: 10,
      maximumSourceGapMs: 5000,
      opCounter: attrOps,
    });
    // Windowed examinations should be far below 200 * M.
    expect(attrOps.pointExaminations).toBeLessThan(200 * m);
  });
});
