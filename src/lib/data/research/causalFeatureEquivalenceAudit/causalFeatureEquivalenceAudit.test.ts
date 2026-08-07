import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { BtcSpotPoint } from "../btcKalshiLeadLagAnalysis/causalBtcJoin";
import type { FrozenHypothesisSpec } from "../calibrationFadeForwardValidation/calibrationFadeForwardValidationTypes";

import {
  assessReconstructability,
  classifyStructuralExclusion,
  deriveEarliestFeatureEvaluableTimestampMs,
  findFirstUsableCausalBtcTimestampMs,
} from "./assessReconstructability";
import {
  attributeSourceGapClass,
  attributeVolatilityWindowRejections,
  createEmptyAttributionOpCounter,
  mapProductionReasonToAttributionClass,
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
  RECONSTRUCTABILITY_DENOMINATOR_DEFINITION,
  VOLATILITY_WINDOW_ATTRIBUTION_CLASSES,
  type CausalFeatureEquivalenceEvidenceDocument,
  type ContractComparisonResult,
  type ReconstructabilityAssessment,
  type ReferenceComparisonSummary,
  type VolatilityFeatureContract,
  type VolatilityWindowAttributionClass,
  type VolatilityWindowAttributionObservation,
  type VolatilityWindowDiagnostics,
} from "./causalFeatureEquivalenceAuditTypes";
import {
  CAUSAL_VOLATILITY_WINDOW_CONTRACT_SEMANTICS,
  describeCurrentForwardVolatilityContract,
} from "./describeCurrentForwardVolatilityContract";
import { hashVolatilityFeatureContract } from "./hashVolatilityFeatureContract";
import {
  findConflictingProvenContractFields,
  loadCausalFeatureEquivalenceEvidence,
} from "./loadCausalFeatureEquivalenceEvidence";
import { reconstructHistoricalVolatilityContract } from "./reconstructHistoricalVolatilityContract";
import { buildValidatedCausalVolatilityWindow } from "../calibrationFadeForwardValidation/buildValidatedCausalVolatilityWindow";
import { VOLATILITY_WINDOW_REJECTION_REASONS } from "../calibrationFadeForwardValidation/buildValidatedCausalVolatilityWindow";
import { serializeCausalFeatureEquivalenceAuditHtml } from "./serializeCausalFeatureEquivalenceAudit";

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
    futureSampleHandling:
      CAUSAL_VOLATILITY_WINDOW_CONTRACT_SEMANTICS.futureSampleHandling,
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

function reconstructability(
  reconstructable: boolean,
  overrides: Partial<ReconstructabilityAssessment> = {},
): ReconstructabilityAssessment {
  return {
    reconstructable,
    denominatorDefinition: RECONSTRUCTABILITY_DENOMINATOR_DEFINITION,
    observedTotal: reconstructable ? 1 : 1,
    structurallyExcludedCount: 0,
    featureEvaluableCount: reconstructable ? 1 : 1,
    availableCount: reconstructable ? 1 : 0,
    reconstructionFailureCount: reconstructable ? 0 : 1,
    structuralExclusionCountsByReason: {},
    reconstructionFailureCountsByReason: reconstructable
      ? {}
      : { "internal-source-gap-exceeded": 1 },
    earliestFeatureEvaluableTimestampMs: 0,
    firstUsableCausalBtcTimestampMs: 0,
    availableShareOfEvaluable: reconstructable ? 1 : 0,
    continuityFailureShareOfEvaluable: reconstructable ? 0 : 1,
    reason: reconstructable ? "ok" : "not reconstructable",
    ...overrides,
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
    expect(diagnostics.thresholdCountSemantics).toBe("cumulative-overlapping");
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

  it("counts a 6001ms gap toward every applicable cumulative exceedance row", () => {
    const points = [
      { timestampMs: 0, priceUsd: 100 },
      { timestampMs: 6001, priceUsd: 100 },
    ];
    const diagnostics = buildBtcSourceDiagnostics(points);
    expect(diagnostics.thresholdCountSemantics).toBe("cumulative-overlapping");
    const bin = (threshold: number, comparison: "<=" | ">") =>
      diagnostics.thresholdBins.find(
        (entry) => entry.thresholdMs === threshold && entry.comparison === comparison,
      )!;
    expect(bin(5000, "<=").count).toBe(0);
    expect(bin(5000, ">").count).toBe(1);
    expect(bin(5001, ">").count).toBe(1);
    expect(bin(5100, ">").count).toBe(1);
    expect(bin(5500, ">").count).toBe(1);
    expect(bin(6000, ">").count).toBe(1);
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

describe("loadCausalFeatureEquivalenceEvidence unknown-key rejection", () => {
  it("rejects unknown top-level fields", () => {
    expect(() =>
      loadCausalFeatureEquivalenceEvidence({
        rawContent: JSON.stringify(baseEvidence({ extraTop: true })),
      }),
    ).toThrow(/Unknown evidence field: extraTop/);
  });

  it("rejects unknown claim fields including misspellings", () => {
    const evidence = baseEvidence();
    (evidence.claims as Record<string, unknown>[])[0]!.contractFiled = "lookbackReturns";
    expect(() =>
      loadCausalFeatureEquivalenceEvidence({ rawContent: JSON.stringify(evidence) }),
    ).toThrow(/Unknown evidence field: claims\[0\]\.contractFiled/);
  });

  it("rejects nested objects in claim value", () => {
    const evidence = baseEvidence();
    (evidence.claims as Record<string, unknown>[])[0]!.value = { nested: true };
    expect(() =>
      loadCausalFeatureEquivalenceEvidence({ rawContent: JSON.stringify(evidence) }),
    ).toThrow(/claims\[0\]\.value/);
  });

  it("rejects empty-string symbol on proven claims", () => {
    const evidence = baseEvidence();
    (evidence.claims as Record<string, unknown>[])[0]!.symbol = "";
    expect(() =>
      loadCausalFeatureEquivalenceEvidence({ rawContent: JSON.stringify(evidence) }),
    ).toThrow(/symbol must be null/);
  });

  it("loads valid committed evidence and blocks publication on invalid", () => {
    const raw = readFileSync(join(process.cwd(), COMMITTED_EVIDENCE_PATH), "utf8");
    expect(() => loadCausalFeatureEquivalenceEvidence({ rawContent: raw })).not.toThrow();
    const invalid = JSON.parse(raw) as Record<string, unknown>;
    invalid.unexpected = 1;
    expect(() =>
      loadCausalFeatureEquivalenceEvidence({ rawContent: JSON.stringify(invalid) }),
    ).toThrow(/Unknown evidence field: unexpected/);
  });
});

describe("split gap evidence claims", () => {
  it("keeps declared max gap separate from inferred unused call-chain status", () => {
    const raw = readFileSync(join(process.cwd(), COMMITTED_EVIDENCE_PATH), "utf8");
    const evidence = loadCausalFeatureEquivalenceEvidence({ rawContent: raw });
    const declared = evidence.claims.find(
      (claim) => claim.claimId === "maximum-source-gap-declared-value",
    );
    const unused = evidence.claims.find(
      (claim) => claim.claimId === "maximum-source-gap-unused-at-freeze",
    );
    expect(declared?.status).toBe("declared-by-frozen-config");
    expect(declared?.value).toBe(5000);
    expect(unused?.status).toBe("inferred-from-call-chain");
    expect(unused?.status).not.toBe("unavailable");
    expect(unused?.path).toBeTruthy();
    expect(unused?.commitSha).toBe(EXPECTED_FREEZE_COMMIT_SHA);
    const reconstructed = reconstructHistoricalVolatilityContract(evidence);
    expect(reconstructed.contract.sourceGapThresholdMs).toBeNull();
    expect(reconstructed.historicalEvidenceStatus).toBe("ambiguous");
  });
});

describe("hashVolatilityFeatureContract", () => {
  it("is stable for same semantics and changes when governed fields change", () => {
    const a = hashVolatilityFeatureContract(fullContract());
    const b = hashVolatilityFeatureContract(fullContract());
    expect(a).toBe(b);
    expect(hashVolatilityFeatureContract(fullContract({ lookbackReturns: 11 }))).not.toBe(a);
  });

  it("does not depend on generatedAt-like metadata outside the contract", () => {
    const contract = fullContract();
    const first = hashVolatilityFeatureContract(contract);
    const second = hashVolatilityFeatureContract({ ...contract });
    expect(first).toBe(second);
  });
});

describe("describeCurrentForwardVolatilityContract lockstep", () => {
  it("consumes immutable production semantic constants", () => {
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
    expect(contract.quoteMinuteInclusionPolicy).toBe(
      CAUSAL_VOLATILITY_WINDOW_CONTRACT_SEMANTICS.quoteMinuteInclusionPolicy,
    );
    expect(contract.missingMinuteBehavior).toBe(
      CAUSAL_VOLATILITY_WINDOW_CONTRACT_SEMANTICS.missingMinuteBehavior,
    );
    expect(contract.duplicateHandling).toBe(
      CAUSAL_VOLATILITY_WINDOW_CONTRACT_SEMANTICS.duplicateHandling,
    );
    expect(contract.orderingHandling).toBe(
      CAUSAL_VOLATILITY_WINDOW_CONTRACT_SEMANTICS.orderingHandling,
    );
    expect(contract.invalidPriceHandling).toBe(
      CAUSAL_VOLATILITY_WINDOW_CONTRACT_SEMANTICS.invalidPriceHandling,
    );
    expect(contract.futureSampleHandling).toBe(
      CAUSAL_VOLATILITY_WINDOW_CONTRACT_SEMANTICS.futureSampleHandling,
    );
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

  function production(points: readonly BtcSpotPoint[], timestampMs: number) {
    return buildValidatedCausalVolatilityWindow({
      points,
      timestampMs,
      barIntervalMs,
      lookbackBars,
      maximumSourceGapMs,
    });
  }

  function classCount(
    result: ReturnType<typeof attributeVolatilityWindowRejections>,
    className: string,
  ): number {
    return result.classes.find((entry) => entry.class === className)?.observationCount ?? 0;
  }

  it("documents pre-fix bug then agrees with production for early conflicting duplicate", () => {
    // LRM HIGH-1 fixture: early conflicting duplicate outside the trailing window,
    // dense valid trailing history, and a quote after that window.
    const quoteTs = 1_700_000_000_000;
    const points = densePoints(quoteTs, 1000);
    const lookbackHorizonMs =
      (lookbackBars + 2) * barIntervalMs + maximumSourceGapMs * 4;
    const earlyBase = quoteTs - lookbackHorizonMs - 120_000;
    // Insert conflicting duplicate far outside the old audit's trimmed horizon.
    points.unshift(
      {
        timestampMs: earlyBase,
        receivedAtLocal: "t",
        priceUsd: 90_000,
      },
      {
        timestampMs: earlyBase,
        receivedAtLocal: "t",
        priceUsd: 90_001,
      },
      {
        timestampMs: earlyBase + 1000,
        receivedAtLocal: "t",
        priceUsd: 90_002,
      },
    );

    const prod = production(points, quoteTs);
    expect(prod.available).toBe(false);
    expect(prod.rejectionReason).toBe("conflicting-duplicate-timestamp");

    // Pre-fix behavior (trimmed trailing window) incorrectly reported available.
    const startMs = quoteTs - lookbackHorizonMs;
    const trimmed = points.filter((point) => point.timestampMs >= startMs - 1);
    const trimmedProd = production(trimmed, quoteTs);
    expect(trimmedProd.available).toBe(true);

    const result = attributeVolatilityWindowRejections(
      [{ marketTicker: "M", timestampMs: quoteTs }],
      points,
      { barIntervalMs, lookbackBars, maximumSourceGapMs },
    );
    expect(classCount(result, "available")).toBe(0);
    expect(classCount(result, "conflicting-duplicate-source")).toBe(1);
    expect(result.productionRejectionReasonCounts["conflicting-duplicate-timestamp"]).toBe(1);
  });

  it("attributes early non-ascending on the full series like production", () => {
    const quoteTs = 1_700_000_000_000;
    const points = densePoints(quoteTs, 1000);
    const a = points[4]!;
    const b = points[5]!;
    points[4] = b;
    points[5] = a;
    const prod = production(points, quoteTs);
    expect(prod.rejectionReason).toBe("non-ascending-timestamps");
    const result = attributeVolatilityWindowRejections(
      [{ marketTicker: "M", timestampMs: quoteTs }],
      points,
      { barIntervalMs, lookbackBars, maximumSourceGapMs },
    );
    expect(classCount(result, "non-ascending-source")).toBe(1);
    expect(classCount(result, "available")).toBe(0);
  });

  it("collapses exact duplicate same price and matches production availability", () => {
    const quoteTs = 1_700_000_000_000;
    const points = densePoints(quoteTs, 1000);
    points.splice(20, 0, { ...points[20]! });
    const prod = production(points, quoteTs);
    expect(prod.available).toBe(true);
    const result = attributeVolatilityWindowRejections(
      [{ marketTicker: "M", timestampMs: quoteTs }],
      points,
      { barIntervalMs, lookbackBars, maximumSourceGapMs },
    );
    expect(classCount(result, "available")).toBe(1);
  });

  it("ignores invalid early prices outside window scope like M12.3", () => {
    const quoteTs = 1_700_000_000_000;
    const points = densePoints(quoteTs, 1000);
    points[0] = { ...points[0]!, priceUsd: 0 };
    points[1] = { ...points[1]!, priceUsd: Number.NaN };
    expect(production(points, quoteTs).available).toBe(true);
    const result = attributeVolatilityWindowRejections(
      [{ marketTicker: "M", timestampMs: quoteTs }],
      points,
      { barIntervalMs, lookbackBars, maximumSourceGapMs },
    );
    expect(classCount(result, "available")).toBe(1);
  });

  it("attributes conflicting duplicate inside the trailing window", () => {
    const quoteTs = 1_700_000_000_000;
    const points = densePoints(quoteTs, 1000);
    points.splice(points.length - 10, 0, {
      timestampMs: points[points.length - 10]!.timestampMs,
      receivedAtLocal: "t",
      priceUsd: points[points.length - 10]!.priceUsd + 1,
    });
    expect(production(points, quoteTs).rejectionReason).toBe("conflicting-duplicate-timestamp");
    const result = attributeVolatilityWindowRejections(
      [{ marketTicker: "M", timestampMs: quoteTs }],
      points,
      { barIntervalMs, lookbackBars, maximumSourceGapMs },
    );
    expect(classCount(result, "conflicting-duplicate-source")).toBe(1);
  });

  it("attributes available for dense causal series and ignores future points", () => {
    const quoteTs = 1_700_000_000_000;
    const points = [
      ...densePoints(quoteTs, 1000),
      {
        timestampMs: quoteTs + 60_000,
        receivedAtLocal: "t",
        priceUsd: 999_999,
      },
    ];
    expect(production(points, quoteTs).available).toBe(true);
    const result = attributeVolatilityWindowRejections(
      [{ marketTicker: "M", timestampMs: quoteTs }],
      points,
      { barIntervalMs, lookbackBars, maximumSourceGapMs },
    );
    expect(classCount(result, "available")).toBe(1);
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
    expect(classCount(result, "future-only-source")).toBe(1);
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
    expect(classCount(result, "insufficient-source-points")).toBe(1);
  });

  it("attributes start-boundary-gap-exceeded", () => {
    const quoteTs = 1_700_000_000_000;
    const windowStart = Math.floor(quoteTs / barIntervalMs) * barIntervalMs - 10 * barIntervalMs;
    const points: BtcSpotPoint[] = [];
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
    expect(classCount(result, "start-boundary-gap-exceeded")).toBe(1);
  });

  it("attributes exactly one internal-source-gap-exceeded for a single-cause 5001ms fixture", () => {
    const quoteTs = 2_000_000_000_000;
    const quoteMinute = Math.floor(quoteTs / barIntervalMs) * barIntervalMs;
    const windowStart = quoteMinute - 10 * barIntervalMs;
    const points: BtcSpotPoint[] = [];
    // Predecessor within 5000ms of window start (start boundary passes).
    points.push({
      timestampMs: windowStart - 1000,
      receivedAtLocal: "t",
      priceUsd: 100_000,
    });
    let insertedInternalGap = false;
    for (let minuteIndex = 0; minuteIndex <= 10; minuteIndex += 1) {
      const minuteStart = windowStart + minuteIndex * barIntervalMs;
      for (let offset = 0; offset < barIntervalMs; offset += 1000) {
        let ts = minuteStart + offset;
        if (ts > quoteTs) {
          break;
        }
        // Single internal adjacent gap of exactly 5001ms inside the selected window.
        if (!insertedInternalGap && minuteIndex === 5 && offset === 2000) {
          ts += 4001; // prior sample at +1000 → gap 5001
          insertedInternalGap = true;
        }
        if (insertedInternalGap && minuteIndex === 5 && offset > 2000) {
          ts += 4001;
        }
        if (insertedInternalGap && minuteIndex > 5) {
          ts += 4001;
        }
        points.push({
          timestampMs: ts,
          receivedAtLocal: "t",
          priceUsd: 100_000 + (minuteIndex % 2 === 0 ? 700 : -700),
        });
      }
    }
    // Trailing age must pass: ensure last sample is within 5000ms of quote.
    const last = points[points.length - 1]!;
    if (quoteTs - last.timestampMs > 5000) {
      points.push({
        timestampMs: quoteTs - 1000,
        receivedAtLocal: "t",
        priceUsd: 100_100,
      });
    }

    const prod = production(points, quoteTs);
    expect(prod.available).toBe(false);
    expect(prod.rejectionReason).toBe("source-gap-exceeded");

    const result = attributeVolatilityWindowRejections(
      [{ marketTicker: "M", timestampMs: quoteTs }],
      points,
      { barIntervalMs, lookbackBars, maximumSourceGapMs },
    );
    expect(classCount(result, "internal-source-gap-exceeded")).toBe(1);
    expect(classCount(result, "available")).toBe(0);
    expect(classCount(result, "start-boundary-gap-exceeded")).toBe(0);
    expect(classCount(result, "trailing-source-age-exceeded")).toBe(0);
  });

  it("keeps adjacent 5000ms internal gap available", () => {
    const quoteTs = 2_100_000_000_000;
    const points = densePoints(quoteTs, 5000);
    expect(production(points, quoteTs).available).toBe(true);
    const result = attributeVolatilityWindowRejections(
      [{ marketTicker: "M", timestampMs: quoteTs }],
      points,
      { barIntervalMs, lookbackBars, maximumSourceGapMs },
    );
    expect(classCount(result, "available")).toBe(1);
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
    expect(classCount(result, "trailing-source-age-exceeded")).toBe(1);
  });

  it("attributes missing-minute-bucket when a minute is absent inside the window", () => {
    const quoteMinute = Math.floor(4_000_000_000_000 / barIntervalMs) * barIntervalMs;
    const quoteTs = quoteMinute + 30_000;
    const points: BtcSpotPoint[] = [];
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
    expect(classCount(result, "missing-minute-bucket")).toBe(1);
    expect(result.productionRejectionReasonCounts["missing-minute-bucket"]).toBe(1);
  });

  it("attributes insufficient-bars when priced samples cannot form 11 consecutive minutes", () => {
    const quoteTs = 5_000_000_000_000;
    const points: BtcSpotPoint[] = [];
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
    expect(classCount(result, "insufficient-bars")).toBe(1);
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
    expect(classCount(result, "invalid-source-price")).toBe(1);
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

  it("maps production reasons exhaustively without guessing", () => {
    for (const reason of VOLATILITY_WINDOW_REJECTION_REASONS) {
      if (
        reason === "invalid-quote-timestamp"
        || reason === "invalid-bar-interval"
        || reason === "invalid-lookback"
        || reason === "invalid-maximum-source-gap"
      ) {
        expect(() => mapProductionReasonToAttributionClass(reason)).toThrow(
          CausalFeatureEquivalenceAuditError,
        );
        continue;
      }
      if (reason === "source-gap-exceeded") {
        expect(mapProductionReasonToAttributionClass(reason)).toBe("source-gap-exceeded");
        continue;
      }
      expect(typeof mapProductionReasonToAttributionClass(reason)).toBe("string");
    }
  });

  it("table-driven differential vs production helper on full series", () => {
    const quoteTs = 1_800_000_000_000;
    const dense = densePoints(quoteTs, 1000);
    const earlyConflict = densePoints(quoteTs, 1000);
    const earlyBase =
      quoteTs - ((lookbackBars + 2) * barIntervalMs + maximumSourceGapMs * 4) - 60_000;
    earlyConflict.unshift(
      { timestampMs: earlyBase, receivedAtLocal: "t", priceUsd: 1 },
      { timestampMs: earlyBase, receivedAtLocal: "t", priceUsd: 2 },
    );    const exactDup = densePoints(quoteTs, 1000);
    exactDup.splice(15, 0, { ...exactDup[15]! });
    const futureOnly: BtcSpotPoint[] = [
      { timestampMs: quoteTs + 5000, receivedAtLocal: "t", priceUsd: 1 },
    ];
    const trailing = densePoints(quoteTs - 5001, 1000);

    const cases: { name: string; points: BtcSpotPoint[]; quote: number }[] = [
      { name: "dense", points: dense, quote: quoteTs },
      { name: "early-conflict", points: earlyConflict, quote: quoteTs },
      { name: "exact-dup", points: exactDup, quote: quoteTs },
      { name: "future-only", points: futureOnly, quote: quoteTs },
      { name: "trailing", points: trailing, quote: quoteTs },
      { name: "future-ignored", points: [...dense, { timestampMs: quoteTs + 1, receivedAtLocal: "t", priceUsd: 1 }], quote: quoteTs },
    ];

    for (const testCase of cases) {
      const prod = production(testCase.points, testCase.quote);
      const audit = attributeVolatilityWindowRejections(
        [{ marketTicker: "M", timestampMs: testCase.quote }],
        testCase.points,
        { barIntervalMs, lookbackBars, maximumSourceGapMs },
      );
      const available = classCount(audit, "available") === 1;
      expect(available, testCase.name).toBe(prod.available);
      if (!prod.available && prod.rejectionReason && prod.rejectionReason !== "source-gap-exceeded") {
        const mapped = mapProductionReasonToAttributionClass(prod.rejectionReason);
        expect(classCount(audit, mapped as string), testCase.name).toBe(1);
      }
    }
  });
});

describe("earliestFeatureEvaluableTimestampMs derivation", () => {
  const returnIntervalMs = 60_000;
  const requiredCloseCount = 11;

  it("aligns to first minute bucket, not naive firstBTC+10min for mid-minute starts", () => {
    expect(
      deriveEarliestFeatureEvaluableTimestampMs({
        firstUsableCausalBtcTimestampMs: 30_000,
        returnIntervalMs,
        requiredCloseCount,
      }),
    ).toBe(600_000);
    expect(
      deriveEarliestFeatureEvaluableTimestampMs({
        firstUsableCausalBtcTimestampMs: 0,
        returnIntervalMs,
        requiredCloseCount,
      }),
    ).toBe(600_000);
    expect(
      deriveEarliestFeatureEvaluableTimestampMs({
        firstUsableCausalBtcTimestampMs: 60_000,
        returnIntervalMs,
        requiredCloseCount,
      }),
    ).toBe(660_000);
  });

  it("matches production availability at ±1ms around the boundary", () => {
    const firstBtc = 0;
    const earliest = deriveEarliestFeatureEvaluableTimestampMs({
      firstUsableCausalBtcTimestampMs: firstBtc,
      returnIntervalMs,
      requiredCloseCount,
    })!;
    const pointsBefore = Array.from({ length: Math.floor(earliest / 1000) }, (_, index) => ({
      timestampMs: index * 1000,
      receivedAtLocal: "t",
      priceUsd: 100_000 + (index % 2 === 0 ? 10 : -10),
    }));
    const pointsAt = [
      ...pointsBefore,
      {
        timestampMs: earliest,
        receivedAtLocal: "t",
        priceUsd: 100_000,
      },
    ];

    const before = buildValidatedCausalVolatilityWindow({
      points: pointsBefore,
      timestampMs: earliest - 1,
      barIntervalMs: returnIntervalMs,
      lookbackBars: 10,
      maximumSourceGapMs: 5000,
    });
    expect(before.available).toBe(false);
    expect(before.rejectionReason).toMatch(/insufficient/);

    const at = buildValidatedCausalVolatilityWindow({
      points: pointsAt,
      timestampMs: earliest,
      barIntervalMs: returnIntervalMs,
      lookbackBars: 10,
      maximumSourceGapMs: 5000,
    });
    expect(at.available).toBe(true);
  });
});

describe("assessReconstructability (Domain A feature-evaluable denominator)", () => {
  const returnIntervalMs = 60_000;
  const requiredCloseCount = 11;
  const firstUsable = 0;
  const earliest = 600_000;

  function observation(
    timestampMs: number,
    attributionClass: VolatilityWindowAttributionClass,
    productionRejectionReason: VolatilityWindowAttributionObservation["productionRejectionReason"] = null,
  ): VolatilityWindowAttributionObservation {
    return {
      marketTicker: "M",
      timestampMs,
      attributionClass,
      productionRejectionReason:
        productionRejectionReason
        ?? (attributionClass === "available"
          ? null
          : attributionClass === "insufficient-bars"
            ? "insufficient-bars"
            : attributionClass === "insufficient-source-points"
              ? "insufficient-source-points"
              : attributionClass === "future-only-source"
                ? "future-only-source"
                : attributionClass === "missing-minute-bucket"
                  ? "missing-minute-bucket"
                  : attributionClass === "invalid-source-price"
                    ? "invalid-source-price"
                    : attributionClass === "internal-source-gap-exceeded"
                      ? "source-gap-exceeded"
                      : "insufficient-bars"),
      failingGapMs: null,
    };
  }

  function diagnosticsFromObservations(
    observations: VolatilityWindowAttributionObservation[],
  ): VolatilityWindowDiagnostics {
    const counts: Partial<Record<VolatilityWindowAttributionClass, number>> = {};
    for (const obs of observations) {
      counts[obs.attributionClass] = (counts[obs.attributionClass] ?? 0) + 1;
    }
    const total = observations.length;
    return {
      observationsAttempted: total,
      classes: VOLATILITY_WINDOW_ATTRIBUTION_CLASSES.map((attributionClass) => ({
        class: attributionClass,
        observationCount: counts[attributionClass] ?? 0,
        observationShare: total > 0 ? (counts[attributionClass] ?? 0) / total : null,
        affectedMarketCount: (counts[attributionClass] ?? 0) > 0 ? 1 : 0,
        representativeExamples: [],
        minimumFailingGapMs: null,
        maximumFailingGapMs: null,
        p50FailingGapMs: null,
        p90FailingGapMs: null,
      })),
      productionRejectionReasonCounts: {},
      observations,
    };
  }

  function assess(
    observations: VolatilityWindowAttributionObservation[],
    contractEquivalent = true,
    historicalAmbiguous = false,
    firstUsableCausalBtcTimestampMs: number | null = firstUsable,
  ) {
    return assessReconstructability(
      diagnosticsFromObservations(observations),
      contractEquivalent,
      historicalAmbiguous,
      {
        firstUsableCausalBtcTimestampMs,
        returnIntervalMs,
        requiredCloseCount,
      },
    );
  }

  it("1. pure warm-up only → structurally excluded, not reconstructable, no capture defect claim", () => {
    const assessment = assess([
      observation(100_000, "insufficient-source-points"),
      observation(200_000, "insufficient-bars"),
      observation(earliest - 1, "insufficient-bars"),
    ]);
    expect(assessment.structurallyExcludedCount).toBe(3);
    expect(assessment.featureEvaluableCount).toBe(0);
    expect(assessment.reconstructionFailureCount).toBe(0);
    expect(assessment.reconstructable).toBe(false);
    expect(assessment.reason).toContain("insufficient-evaluable-forward-duration");
    expect(assessment.denominatorDefinition).toContain("Domain A");

    const classified = classifyCausalFeatureEquivalence({
      contractComparison: comparisonFrom(fullContract(), fullContract(), "proven"),
      reconstructability: assessment,
      referenceComparison: skippedReference(),
    });
    expect(classified.verdict).toBe("exactly-equivalent-and-reconstructable");
    expect(classified.verdict).not.toBe("frozen-feature-not-reconstructable-from-current-capture");
  });

  it("2. warm-up + healthy evaluable → reconstructable", () => {
    const assessment = assess([
      ...Array.from({ length: 5 }, (_, index) =>
        observation(index * 60_000, "insufficient-bars"),
      ),
      ...Array.from({ length: 100 }, (_, index) =>
        observation(earliest + index * 1000, "available"),
      ),
    ]);
    expect(assessment.structurallyExcludedCount).toBe(5);
    expect(assessment.featureEvaluableCount).toBe(100);
    expect(assessment.availableCount).toBe(100);
    expect(assessment.reconstructionFailureCount).toBe(0);
    expect(assessment.reconstructable).toBe(true);
    expect(assessment.availableShareOfEvaluable).toBe(1);
  });

  it("3. warm-up + missing-minute in evaluable → failure", () => {
    const assessment = assess([
      observation(100_000, "insufficient-bars"),
      observation(earliest + 1_000, "available"),
      observation(earliest + 2_000, "missing-minute-bucket"),
    ]);
    expect(assessment.structurallyExcludedCount).toBe(1);
    expect(assessment.featureEvaluableCount).toBe(2);
    expect(assessment.reconstructionFailureCount).toBe(1);
    expect(assessment.reconstructable).toBe(false);
    expect(assessment.reconstructionFailureCountsByReason["missing-minute-bucket"]).toBe(1);
  });

  it("4. warm-up + source-gap in evaluable → failure", () => {
    const assessment = assess([
      observation(50_000, "insufficient-source-points"),
      observation(earliest + 5_000, "internal-source-gap-exceeded"),
    ]);
    expect(assessment.reconstructionFailureCount).toBe(1);
    expect(assessment.reconstructable).toBe(false);
    expect(assessment.continuityFailureShareOfEvaluable).toBe(1);
  });

  it("5. warm-up + invalid price in evaluable → failure", () => {
    const assessment = assess([
      observation(10_000, "insufficient-bars"),
      observation(earliest + 1, "invalid-source-price"),
    ]);
    expect(assessment.reconstructionFailureCount).toBe(1);
    expect(assessment.reconstructable).toBe(false);
  });

  it("6. late insufficient-bars outage (after boundary) → real failure", () => {
    const assessment = assess([
      observation(earliest + 3_600_000, "insufficient-bars"),
    ]);
    expect(assessment.structurallyExcludedCount).toBe(0);
    expect(assessment.reconstructionFailureCount).toBe(1);
    expect(assessment.reconstructable).toBe(false);
    expect(
      classifyStructuralExclusion({
        observation: observation(earliest + 3_600_000, "insufficient-bars"),
        firstUsableCausalBtcTimestampMs: firstUsable,
        earliestFeatureEvaluableTimestampMs: earliest,
      }),
    ).toBeNull();
  });

  it("7. pre-first-causal-source is structural", () => {
    const assessment = assess(
      [
        observation(-5_000, "future-only-source"),
        observation(-1, "insufficient-source-points"),
      ],
      true,
      false,
      0,
    );
    expect(assessment.structuralExclusionCountsByReason["pre-first-causal-source"]).toBe(2);
    expect(assessment.featureEvaluableCount).toBe(0);
    expect(assessment.reconstructionFailureCount).toBe(0);
  });

  it("8. future-only after coverage begun → reconstruction failure", () => {
    const assessment = assess([
      observation(earliest + 10_000, "future-only-source"),
    ]);
    expect(assessment.structurallyExcludedCount).toBe(0);
    expect(assessment.reconstructionFailureCount).toBe(1);
    expect(assessment.reconstructable).toBe(false);
  });

  it("9. all available → reconstructable", () => {
    const assessment = assess([
      observation(earliest, "available"),
      observation(earliest + 1_000, "available"),
    ]);
    expect(assessment.reconstructable).toBe(true);
    expect(assessment.observedTotal).toBe(2);
    expect(assessment.featureEvaluableCount).toBe(2);
  });

  it("10. zero observations → not reconstructable, zero evaluable", () => {
    const assessment = assess([]);
    expect(assessment.observedTotal).toBe(0);
    expect(assessment.featureEvaluableCount).toBe(0);
    expect(assessment.reconstructable).toBe(false);
    expect(assessment.reason).toContain("insufficient-evaluable-forward-duration");
  });

  it("11. zero evaluable + nonzero warm-up → insufficient-evaluable-forward-duration", () => {
    const assessment = assess([
      observation(0, "insufficient-source-points"),
      observation(earliest - 1, "insufficient-bars"),
    ]);
    expect(assessment.structurallyExcludedCount).toBe(2);
    expect(assessment.featureEvaluableCount).toBe(0);
    expect(assessment.reconstructable).toBe(false);
    expect(assessment.reason).toContain("insufficient-evaluable-forward-duration");
  });

  it("12. ambiguity + perfect windows still not reconstructable; verdict ambiguous", () => {
    const assessment = assess(
      [observation(earliest, "available"), observation(earliest + 1, "available")],
      true,
      true,
    );
    expect(assessment.reconstructable).toBe(false);
    expect(assessment.reason).toContain("ambiguous");
    expect(assessment.featureEvaluableCount).toBe(2);
    const classified = classifyCausalFeatureEquivalence({
      contractComparison: comparisonFrom(
        fullContract({ sourceGapDefinition: null }),
        fullContract(),
        "ambiguous",
      ),
      reconstructability: assessment,
      referenceComparison: skippedReference(),
    });
    expect(classified.verdict).toBe("historical-feature-definition-ambiguous");
  });

  it("13. mismatch + perfect windows → semantics mismatch verdict", () => {
    const assessment = assess(
      [observation(earliest, "available")],
      false,
      false,
    );
    expect(assessment.reconstructable).toBe(false);
    const classified = classifyCausalFeatureEquivalence({
      contractComparison: comparisonFrom(
        fullContract({ lookbackReturns: 20, requiredCloseCount: 21 }),
        fullContract(),
        "proven",
      ),
      reconstructability: assessment,
      referenceComparison: skippedReference(),
    });
    expect(classified.verdict).toBe("forward-validator-semantics-mismatch");
  });

  it("14. equivalent + warm-up + perfect → exactly-equivalent-and-reconstructable", () => {
    const assessment = assess([
      observation(100_000, "insufficient-bars"),
      observation(earliest, "available"),
      observation(earliest + 1_000, "available"),
    ]);
    expect(assessment.reconstructable).toBe(true);
    const classified = classifyCausalFeatureEquivalence({
      contractComparison: comparisonFrom(fullContract(), fullContract(), "proven"),
      reconstructability: assessment,
      referenceComparison: skippedReference(),
    });
    expect(classified.verdict).toBe("exactly-equivalent-and-reconstructable");
  });

  it("15. equivalent + warm-up + one failure → frozen-feature-not-reconstructable", () => {
    const assessment = assess([
      observation(100_000, "insufficient-bars"),
      observation(earliest, "available"),
      observation(earliest + 1_000, "missing-minute-bucket"),
    ]);
    expect(assessment.reconstructable).toBe(false);
    expect(assessment.reconstructionFailureCount).toBe(1);
    const classified = classifyCausalFeatureEquivalence({
      contractComparison: comparisonFrom(fullContract(), fullContract(), "proven"),
      reconstructability: assessment,
      referenceComparison: skippedReference(),
    });
    expect(classified.verdict).toBe("frozen-feature-not-reconstructable-from-current-capture");
  });

  it("16. candidate/settlement/high-vol counts do not affect reconstructability or verdict", () => {
    const assessment = assess([observation(earliest, "available")]);
    const classified = classifyCausalFeatureEquivalence({
      contractComparison: comparisonFrom(fullContract(), fullContract(), "proven"),
      reconstructability: assessment,
      referenceComparison: skippedReference(),
      candidateMarketCount: 0,
      highVolatilityCount: 99,
      settlementCoverageShare: null,
      volatilityAvailableCount: 0,
    });
    expect(classified.verdict).toBe("exactly-equivalent-and-reconstructable");
  });

  it("17. missing-minute during warm-up window is still a real failure (not structural)", () => {
    const assessment = assess([
      observation(earliest - 30_000, "missing-minute-bucket"),
    ]);
    expect(assessment.structurallyExcludedCount).toBe(0);
    expect(assessment.reconstructionFailureCount).toBe(1);
  });

  it("18. ±1ms boundary: before=structural history insufficiency; at=evaluable", () => {
    const before = assess([observation(earliest - 1, "insufficient-bars")]);
    expect(before.structurallyExcludedCount).toBe(1);
    expect(before.featureEvaluableCount).toBe(0);

    const at = assess([observation(earliest, "insufficient-bars")]);
    expect(at.structurallyExcludedCount).toBe(0);
    expect(at.reconstructionFailureCount).toBe(1);
  });

  it("HTML/JSON surface denominators and structural warm-up text; future capture absent for warm-up-only", () => {
    const assessment = assess([
      observation(50_000, "insufficient-bars"),
      observation(100_000, "insufficient-source-points"),
    ]);
    expect(assessment.featureEvaluableCount).toBe(0);
    const classified = classifyCausalFeatureEquivalence({
      contractComparison: comparisonFrom(fullContract(), fullContract(), "proven"),
      reconstructability: assessment,
      referenceComparison: skippedReference(),
    });
    expect(classified.verdict).not.toBe("frozen-feature-not-reconstructable-from-current-capture");

    const html = serializeCausalFeatureEquivalenceAuditHtml({
      analysisVersion: "calibration-fade-causal-feature-equivalence-v1",
      generatedAt: "2026-08-06T00:00:00.000Z",
      analysisScope: "selected-run",
      selectedRunId: "synthetic",
      captureRunDir: "/tmp/x",
      outputPath: "/tmp/out.json",
      htmlOutputPath: "/tmp/out.html",
      inputFingerprints: [],
      hypothesisId: EXPECTED_HYPOTHESIS_ID,
      hypothesisConfigurationHash: EXPECTED_HYPOTHESIS_CONFIGURATION_HASH,
      auditEvidencePath: "evidence.json",
      auditEvidenceHash: "abc",
      historicalContractSemanticHash: "h",
      currentForwardContractSemanticHash: "f",
      historicalEvidenceStatus: "proven",
      historicalContract: fullContract(),
      currentForwardContract: fullContract(),
      contractComparison: comparisonFrom(fullContract(), fullContract(), "proven"),
      btcSourceDiagnostics: {
        sourceRecordCount: 0,
        firstTimestampMs: null,
        lastTimestampMs: null,
        durationMs: null,
        finiteTimestampCount: 0,
        finitePositivePriceCount: 0,
        invalidPriceCount: 0,
        outOfOrderCount: 0,
        exactDuplicateTimestampCount: 0,
        conflictingDuplicateTimestampCount: 0,
        observedIntervalCount: 0,
        minimumIntervalMs: null,
        maximumIntervalMs: null,
        meanIntervalMs: null,
        p50IntervalMs: null,
        p75IntervalMs: null,
        p90IntervalMs: null,
        p95IntervalMs: null,
        p99IntervalMs: null,
        thresholdCountSemantics: "cumulative-overlapping",
        thresholdBins: [],
        longestGapExamples: [],
        runStartBoundaryCoverageMs: null,
        runEndBoundaryCoverageMs: null,
      },
      quoteJoinDiagnostics: {
        observationsScanned: 0,
        observationsWithCausalSource: 0,
        observationsWithNoCausalSource: 0,
        ageMinMs: null,
        ageMaxMs: null,
        ageMeanMs: null,
        ageP50Ms: null,
        ageP90Ms: null,
        ageP95Ms: null,
        ageP99Ms: null,
        ageAtOrBelow5000Count: 0,
        ageAtOrBelow5000Share: null,
        ageAbove5000Count: 0,
        ageAbove5000Share: null,
        negativeAgeCount: 0,
        futureSourceLeakageCount: 0,
        sourceTimestampField: "t",
        quoteTimestampField: "t",
        clockDomainCaveat: "caveat",
      },
      volatilityWindowDiagnostics: diagnosticsFromObservations([
        observation(50_000, "insufficient-bars"),
      ]),
      referenceComparison: skippedReference(),
      reconstructability: assessment,
      futureCaptureRequirements: {
        emitted: false,
        requiredSourceRecordType: null,
        requiredTimestampField: null,
        requiredTimestampClockDomain: null,
        requiredMaximumSourceGapMs: null,
        requiredNominalCadenceMs: null,
        requiredSchedulingSafetyMarginMs: null,
        requiredCaptureFields: [],
        requiredDuplicateOrderGuarantees: null,
        requiredPreRollDurationMs: null,
        requiredMinimumBarWarmup: null,
        requiredRunStartBehavior: null,
        requiredMonitoringMetric: null,
        acceptanceTest: null,
        note: "not emitted",
      },
      verdict: classified.verdict,
      recommendedNextAction: classified.recommendedNextAction,
      limitations: [],
      warnings: [],
      nonClaims: [],
    });
    expect(html).toContain("Structural warm-up");
    expect(html).toContain("not treated as failures");
    expect(html).toContain("featureEvaluable=");
    expect(html).toContain("&quot;emitted&quot;: false");
    expect(JSON.stringify(assessment)).toContain("featureEvaluableCount");
    expect(JSON.stringify(assessment)).toContain("structurallyExcludedCount");
  });

  it("findFirstUsableCausalBtcTimestampMs skips invalid prices", () => {
    expect(
      findFirstUsableCausalBtcTimestampMs([
        { timestampMs: 10, priceUsd: 0 },
        { timestampMs: 20, priceUsd: Number.NaN },
        { timestampMs: 30, priceUsd: 100 },
      ]),
    ).toBe(30);
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
  it("quote join + attribution avoid quadratic full scans and stay within C1*M + C2*N*logM + C3*N*W", () => {
    const m = 5_000;
    const n = 800;
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

    const attrOps = createEmptyAttributionOpCounter();
    attributeVolatilityWindowRejections(quotes, btc, {
      barIntervalMs: 60_000,
      lookbackBars: 10,
      maximumSourceGapMs: 5000,
      opCounter: attrOps,
    });

    // Prefix examined once (~M). No per-quote full-prefix copies after preprocess.
    expect(attrOps.prefixPointsExamined).toBe(m);
    expect(attrOps.fullPrefixCopiesOrScans).toBe(0);
    expect(attrOps.productionHelperInvocations).toBeLessThanOrEqual(n);

    const windowBound = 12 * 60; // ~lookbackBars+1 minutes at 1s cadence
    const logM = Math.ceil(Math.log2(m + 1));
    const ops =
      attrOps.prefixPointsExamined
      + attrOps.causalEndComparisons
      + attrOps.windowPointsExamined;
    const bound = 2 * m + 8 * n * logM + 8 * n * windowBound;
    expect(ops).toBeLessThanOrEqual(bound);

    // Doubling N roughly doubles quote work, not ×M.
    const attrOps2 = createEmptyAttributionOpCounter();
    attributeVolatilityWindowRejections(quotes.slice(0, Math.floor(n / 2)), btc, {
      barIntervalMs: 60_000,
      lookbackBars: 10,
      maximumSourceGapMs: 5000,
      opCounter: attrOps2,
    });
    const halfQuoteWork =
      attrOps2.causalEndComparisons + attrOps2.windowPointsExamined;
    const fullQuoteWork =
      attrOps.causalEndComparisons + attrOps.windowPointsExamined;
    expect(fullQuoteWork).toBeLessThan(halfQuoteWork * 2.6 + m);
    expect(fullQuoteWork).toBeGreaterThan(halfQuoteWork * 1.4);
  });
});
