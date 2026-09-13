import { describe, expect, it } from "vitest";

import { computeRequiredSampleSize } from "../powerAnalysis/powerAnalysisMath";

import {
  assertFamilyUniverseMatchesContract,
  assertInventoryDidNotComputeOutcomes,
  assertMeanCannotReplaceMedianPostHoc,
  assertNetEdgeClaimFailsClosedWhenFeeUnbound,
  assertNoArbitraryNGate,
  assertRawCrossingsAreNotDirectEss,
  assertRawQuotesAreNotIndependentN,
  auditMomentumFeeContract,
  bindAuthoritativeMomentumFamilyDefinition,
  buildMetadataOnlyMomentumCaptureInventory,
  buildMomentumCountLadder,
  buildMomentumEvidenceDesignReport,
  buildSyntheticDiscoveryUniverse,
  classifyContinuationDirectionConsistency,
  computeMomentumEffectiveSampleSize,
  deriveMomentumRequiredEffectiveN,
  evaluateMomentumHoldout,
  evaluateMomentumValidationCandidate,
  EXPECTED_MOMENTUM_DISCOVERY_HYPOTHESIS_COUNT,
  lockHoldoutCandidateFromValidationSurvivors,
  midpointOnlyCannotAuthorizeEconomicSupport,
  MOMENTUM_DEFAULT_ALPHA,
  MOMENTUM_DEFAULT_OUTCOME_SD_CENTS,
  MOMENTUM_DEFAULT_TARGET_POWER,
  MOMENTUM_DIRECTION,
  MOMENTUM_EVIDENCE_CONTRACT_ANALYSIS_VERSION,
  MOMENTUM_MAX_SHORTLIST_K,
  MOMENTUM_RECOMMENDED_MATERIAL_EFFECT_CENTS,
  MomentumEvidenceContractError,
  PRIOR_LEAD_LAG_HOLDOUT_RUN_ID,
  PRIOR_LEAD_LAG_TRAIN_RUN_ID,
  PRIOR_LEAD_LAG_VALIDATION_RUN_ID,
  PRIOR_MICROSTRUCTURE_TRAIN_RUN_ID,
  rankAndShortlistTrainCandidates,
  rejectInventedFlatOneCentFee,
  rejectOptionalStoppingHeuristic,
  rejectReversalDirectionMutation,
  rejectSilentZeroFeeDefault,
  requireExactFamilyDefinitionIdentityForOutcomeAccess,
  requireMaterialEffectThreshold,
  requireValidMomentumStoppingRule,
  runSyntheticMomentumEvidencePipeline,
  shortlistRankingIgnoresEffectMagnitude,
  trySealMomentumResearchSplit,
  type MomentumCandidateDefinition,
  type MomentumFamilyDefinitionBinding,
} from "./index";

function baseCandidate(
  overrides: Partial<MomentumCandidateDefinition> = {},
): MomentumCandidateDefinition {
  return {
    candidateId: "mom-w5000|x2|h5000|continuation",
    hypothesisId: "mom-w5000|x2|h5000|continuation",
    discoveryRank: 0,
    lookbackWindowMs: 5_000,
    thresholdCents: 2,
    responseHorizonMs: 5_000,
    direction: MOMENTUM_DIRECTION,
    ...overrides,
  };
}

function binding(overrides: Partial<MomentumFamilyDefinitionBinding> = {}): MomentumFamilyDefinitionBinding {
  return {
    familyDefinitionIdentity: "a".repeat(64),
    familyId: "momentum",
    subfamilyId: "kalshi-tob-mid-return-threshold-continuation-v1",
    hypothesisCount: 12,
    direction: "continuation",
    lookbackWindowsMs: [5_000, 15_000],
    thresholdsCents: [2, 3],
    responseHorizonsMs: [5_000, 15_000, 30_000],
    ...overrides,
  };
}

describe("M14.0b-prep momentum evidence contract", () => {
  it("1-4. family identity required; count=12; continuation-only; reversal fails", () => {
    expect(() => requireExactFamilyDefinitionIdentityForOutcomeAccess(null)).toThrow(
      /familyDefinitionIdentity required/i,
    );
    expect(requireExactFamilyDefinitionIdentityForOutcomeAccess("abc")).toBe("abc");
    expect(EXPECTED_MOMENTUM_DISCOVERY_HYPOTHESIS_COUNT).toBe(12);
    expect(buildSyntheticDiscoveryUniverse()).toHaveLength(12);
    assertFamilyUniverseMatchesContract(binding());
    expect(() => rejectReversalDirectionMutation("reversal")).toThrow(/Reversal/i);
    expect(() =>
      assertFamilyUniverseMatchesContract(binding({ direction: "reversal" as never })),
    ).toThrow(/Continuation/i);

    const authoritative = bindAuthoritativeMomentumFamilyDefinition();
    expect(authoritative.familyDefinitionIdentity).toMatch(/^[a-f0-9]{64}$/);
    expect(authoritative.hypothesisCount).toBe(12);
    expect(authoritative.direction).toBe("continuation");
    requireExactFamilyDefinitionIdentityForOutcomeAccess(authoritative.familyDefinitionIdentity);
  });

  it("5-10. alpha/power/MDE/SD fixed; required N model-derived; fixed-n; optional stopping forbidden", () => {
    expect(MOMENTUM_DEFAULT_ALPHA).toBe(0.05);
    expect(MOMENTUM_DEFAULT_TARGET_POWER).toBe(0.8);
    expect(MOMENTUM_RECOMMENDED_MATERIAL_EFFECT_CENTS).toBe(2);
    expect(MOMENTUM_DEFAULT_OUTCOME_SD_CENTS).toBe(10);
    requireMaterialEffectThreshold(2);
    expect(() => requireMaterialEffectThreshold(null)).toThrow(/fails closed/i);

    const derived = deriveMomentumRequiredEffectiveN({
      alpha: 0.05,
      targetPower: 0.8,
      materialEffectCents: 2,
      outcomeStandardDeviationCents: 10,
    });
    const expected = computeRequiredSampleSize({
      edgeCents: 2,
      standardDeviation: 10,
      alpha: 0.05,
      targetPower: 0.8,
    });
    expect(derived.requiredEffectiveN).toBe(expected);
    expect(derived.requiredEffectiveN).toBe(155);
    expect(derived.oneTailed).toBe(true);
    expect(() => assertNoArbitraryNGate(20)).toThrow(/Arbitrary/);
    expect(
      requireValidMomentumStoppingRule({
        kind: "fixed-n",
        minimumEffectiveSampleSize: derived.requiredEffectiveN,
        interpretationIfNotReached: "inconclusive-underpowered",
      }).kind,
    ).toBe("fixed-n");
    expect(() => rejectOptionalStoppingHeuristic("keep-collecting-until-p-lt-05")).toThrow(
      /Optional stopping/i,
    );
  });

  it("12-15. quote/crossing ≠ ESS; market-day/cell cap; nested horizons note", () => {
    expect(() => assertRawQuotesAreNotIndependentN(1000, 1000)).toThrow(/quote count/i);
    expect(() => assertRawCrossingsAreNotDirectEss(50, 50)).toThrow(/crossings/i);
    const ess = computeMomentumEffectiveSampleSize([
      { marketTicker: "A", calendarDay: "2026-09-08", structuralCellId: "c1", usable: true },
      { marketTicker: "A", calendarDay: "2026-09-08", structuralCellId: "c1", usable: true },
      { marketTicker: "A", calendarDay: "2026-09-08", structuralCellId: "c2", usable: true },
      { marketTicker: "B", calendarDay: "2026-09-08", structuralCellId: "c1", usable: false },
    ]);
    expect(ess).toBe(2);
    expect(
      buildMomentumCountLadder({
        rawTobRows: 1000,
        rawThresholdCrossings: 40,
        refractoryDeduplicatedEpisodes: 20,
        observableResponses: 18,
        executableObservableResponses: 15,
        independentMarkets: 5,
        independentMarketDays: 10,
        effectiveSampleSize: 8,
      }).effectiveSampleSize,
    ).toBe(8);
  });

  it("16-20. midpoint-only blocked; executable required; median>0 frozen; zero not consistent; mean forbidden", () => {
    expect(
      midpointOnlyCannotAuthorizeEconomicSupport({
        midpointContinuationCents: 5,
        executablePnlCents: null,
        executableObservable: false,
      }).economicSupportAuthorized,
    ).toBe(false);
    expect(classifyContinuationDirectionConsistency(0)).toBe("not-continuation-consistent");
    expect(classifyContinuationDirectionConsistency(0.1)).toBe("continuation-consistent");
    expect(classifyContinuationDirectionConsistency(-1)).toBe("not-continuation-consistent");
    expect(() => assertMeanCannotReplaceMedianPostHoc("mean")).toThrow(/median/i);
  });

  it("21-26. shortlist≤3; lineage 12; not largest-effect; 0 survivors stop; tie-break; lock 0/1", () => {
    expect(MOMENTUM_MAX_SHORTLIST_K).toBe(3);
    expect(shortlistRankingIgnoresEffectMagnitude()).toBe(true);
    const pipeline = runSyntheticMomentumEvidencePipeline();
    expect(pipeline.discoveryCount).toBe(12);
    expect(pipeline.retainedLineageCount).toBe(12);
    expect(pipeline.shortlistCount).toBeLessThanOrEqual(3);
    expect(pipeline.lockedCandidateId).not.toBeNull();
    expect(pipeline.holdoutVerdict).toBe("support");

    const zero = runSyntheticMomentumEvidencePipeline({ forceZeroValidationSurvivors: true });
    expect(zero.lockedCandidateId).toBeNull();
    expect(zero.holdoutVerdict).toBeNull();
    expect(zero.validationStatuses.every((s) => s !== "validated")).toBe(true);

    const survivors = [
      {
        candidateId: "a",
        status: "validated" as const,
        rationale: [],
        candidate: baseCandidate({ candidateId: "a", hypothesisId: "a" }),
        independentEvidenceSupport: 10,
        directionalReplicationShare: 0.5,
        executableObservabilityShare: 0.8,
        effectClearsMaterialFloor: true,
        structuralSimplicityRank: 100,
      },
      {
        candidateId: "b",
        status: "validated" as const,
        rationale: [],
        candidate: baseCandidate({ candidateId: "b", hypothesisId: "b" }),
        independentEvidenceSupport: 10,
        directionalReplicationShare: 0.5,
        executableObservabilityShare: 0.8,
        effectClearsMaterialFloor: true,
        structuralSimplicityRank: 50,
      },
    ];
    const locked = lockHoldoutCandidateFromValidationSurvivors({ survivors });
    expect(locked?.candidate.candidateId).toBe("b"); // simpler structural rank
  });

  it("27-28. holdout exactly one; underpowered ≠ reject", () => {
    const candidate = baseCandidate();
    const locked = {
      candidate,
      survivorCount: 1,
      lockRationale: ["single"],
    };
    const underpowered = evaluateMomentumHoldout({
      locked,
      evaluatedCandidate: candidate,
      independentEss: 10,
      requiredEffectiveN: 155,
      captureQualityValid: true,
      executableObservableShare: 0.9,
      minExecutableObservableShare: 0.5,
      pointEstimateFavorable: true,
      evidenceInvalidReason: null,
      materialEffectThresholdCents: 2,
      observedAbsExecutableEffectCents: 5,
    });
    expect(underpowered.verdict).toBe("underpowered");
  });

  it("29-31. fee audit; no invented 1¢; net-edge fails closed when unbound", () => {
    const fee = auditMomentumFeeContract();
    expect(fee.feeContractStatus).toBe("schedule-identified-but-unbound-for-family");
    expect(fee.netEdgePromotionAuthorized).toBe(false);
    expect(fee.inventedFlatOneCentFeeForbidden).toBe(true);
    expect(fee.silentZeroFeeForbidden).toBe(true);
    expect(() => rejectInventedFlatOneCentFee()).toThrow(/1¢/i);
    expect(() => rejectSilentZeroFeeDefault()).toThrow(/zero/i);
    expect(() =>
      assertNetEdgeClaimFailsClosedWhenFeeUnbound({
        feeContractStatus: fee.feeContractStatus,
        claimingNetEdge: true,
      }),
    ).toThrow(/Net-edge/i);
  });

  it("32-38. contamination classifications; inventory metadata-only; split seal fail-closed", () => {
    const inventory = buildMetadataOnlyMomentumCaptureInventory({ sealedOnly: true });
    assertInventoryDidNotComputeOutcomes(inventory);
    expect(inventory.returnsComputed).toBe(false);
    expect(inventory.pnlComputed).toBe(false);

    const m13 = inventory.rows.find((row) => row.runId === PRIOR_MICROSTRUCTURE_TRAIN_RUN_ID)!;
    expect(m13.contaminationClassification).toBe("outcome-consumed-related-tob-price-response");
    expect(m13.eligibleRoles).not.toContain("validation");
    expect(m13.eligibleRoles).not.toContain("holdout");

    const llHoldout = inventory.rows.find((row) => row.runId === PRIOR_LEAD_LAG_HOLDOUT_RUN_ID)!;
    expect(llHoldout.contaminationClassification).toBe("ineligible-holdout");

    const llVal = inventory.rows.find((row) => row.runId === PRIOR_LEAD_LAG_VALIDATION_RUN_ID)!;
    expect(llVal.contaminationClassification).toBe("ineligible-validation");

    expect(inventory.freshCaptureRequiredBeforeValidation).toBe(true);
    expect(inventory.freshCaptureRequiredBeforeUntouchedHoldout).toBe(true);
    expect(inventory.cleanValidationCandidates).toEqual([]);
    expect(inventory.untouchedHoldoutCandidates).toEqual([]);
    expect(inventory.contaminatedExploratoryTrainCandidates).toContain(PRIOR_LEAD_LAG_TRAIN_RUN_ID);

    const sealFail = trySealMomentumResearchSplit({
      familyDefinitionIdentity: "f".repeat(64),
      evidenceContractIdentity: "e".repeat(64),
      trainRunId: PRIOR_MICROSTRUCTURE_TRAIN_RUN_ID,
      validationRunId: PRIOR_LEAD_LAG_VALIDATION_RUN_ID,
      holdoutRunId: PRIOR_LEAD_LAG_HOLDOUT_RUN_ID,
      inventory,
    });
    expect(sealFail.sealed).toBe(false);
    if (!sealFail.sealed) {
      expect(sealFail.reasons.join(" ")).toMatch(/M13 TRAIN|lead-lag HOLDOUT|VALIDATION/i);
    }

    // Synthetic clean inventory can seal.
    const cleanInventory = {
      ...inventory,
      rows: [
        {
          runId: "clean-train",
          captureRunDir: "x/clean-train",
          durationHours: 8,
          captureHealthVerdict: "ok",
          topOfBookPresent: true,
          priorResearchRoles: [] as const,
          contaminationClassification: "untouched-for-short-horizon-price-response" as const,
          eligibleRoles: ["train"] as const,
          rationale: "synthetic clean",
        },
        {
          runId: "clean-val",
          captureRunDir: "x/clean-val",
          durationHours: 8,
          captureHealthVerdict: "ok",
          topOfBookPresent: true,
          priorResearchRoles: [] as const,
          contaminationClassification: "untouched-for-short-horizon-price-response" as const,
          eligibleRoles: ["validation"] as const,
          rationale: "synthetic clean",
        },
        {
          runId: "clean-holdout",
          captureRunDir: "x/clean-holdout",
          durationHours: 8,
          captureHealthVerdict: "ok",
          topOfBookPresent: true,
          priorResearchRoles: [] as const,
          contaminationClassification: "untouched-for-short-horizon-price-response" as const,
          eligibleRoles: ["holdout"] as const,
          rationale: "synthetic clean",
        },
      ],
    };
    const sealOk = trySealMomentumResearchSplit({
      familyDefinitionIdentity: "f".repeat(64),
      evidenceContractIdentity: "e".repeat(64),
      trainRunId: "clean-train",
      validationRunId: "clean-val",
      holdoutRunId: "clean-holdout",
      inventory: cleanInventory as never,
    });
    expect(sealOk.sealed).toBe(true);
  });

  it("39-44. content-addressed identity; quarantine; no promotion/freeze/capture/orders", () => {
    const a = buildMomentumEvidenceDesignReport({
      config: {
        familyDefinitionIdentity: null,
        materialEffectThresholdCents: 2,
        alpha: 0.05,
        targetPower: 0.8,
        outcomeStandardDeviationCents: 10,
        maxShortlistK: 3,
        expectedDiscoveryHypothesisCount: 12,
        stoppingRule: {
          kind: "fixed-n",
          minimumEffectiveSampleSize: 155,
          interpretationIfNotReached: "inconclusive-underpowered",
        },
        outputPath: null,
        htmlOutputPath: null,
      },
      generatedAt: "2026-09-10T00:00:00.000Z",
      sealedInventoryOnly: true,
    });
    const b = buildMomentumEvidenceDesignReport({
      config: {
        familyDefinitionIdentity: null,
        materialEffectThresholdCents: 2,
        alpha: 0.05,
        targetPower: 0.8,
        outcomeStandardDeviationCents: 10,
        maxShortlistK: 3,
        expectedDiscoveryHypothesisCount: 12,
        stoppingRule: {
          kind: "fixed-n",
          minimumEffectiveSampleSize: 155,
          interpretationIfNotReached: "inconclusive-underpowered",
        },
        outputPath: null,
        htmlOutputPath: null,
      },
      generatedAt: "2026-09-11T00:00:00.000Z",
      sealedInventoryOnly: true,
    });
    expect(a.analysisVersion).toBe(MOMENTUM_EVIDENCE_CONTRACT_ANALYSIS_VERSION);
    expect(a.contractIdentityHash).toBe(b.contractIdentityHash);
    expect(a.contractIdentityHash).toMatch(/^[a-f0-9]{64}$/);
    expect(a.realOutcomeAccessAuthorized).toBe(false);
    expect(a.quarantine.realHistoricalMomentumOutcomesRead).toBe(false);
    expect(a.quarantine.promotionArtifactCreated).toBe(false);
    expect(a.quarantine.freezeCreated).toBe(false);
    expect(a.quarantine.captureStarted).toBe(false);
    expect(a.quarantine.liveOrdersExecuted).toBe(false);
    expect(a.powerMethodology.requiredEffectiveNWhenBound).toBe(155);
    expect(a.feeContract.netEdgePromotionAuthorized).toBe(false);
  });

  it("evidence contract identity is sensitive to authoritative fields, not generatedAt", () => {
    const baseConfig = {
      familyDefinitionIdentity:
        "764fd36d67f8152077666119ddd1049bcd6940d259f21b60ec7138fa3ad4795d",
      materialEffectThresholdCents: 2,
      alpha: 0.05,
      targetPower: 0.8,
      outcomeStandardDeviationCents: 10,
      maxShortlistK: 3,
      expectedDiscoveryHypothesisCount: 12,
      stoppingRule: {
        kind: "fixed-n" as const,
        minimumEffectiveSampleSize: 155,
        interpretationIfNotReached: "inconclusive-underpowered" as const,
      },
      outputPath: null,
      htmlOutputPath: null,
    };
    const a = buildMomentumEvidenceDesignReport({
      config: baseConfig,
      generatedAt: "2026-09-11T00:00:00.000Z",
      sealedInventoryOnly: true,
    });
    const b = buildMomentumEvidenceDesignReport({
      config: baseConfig,
      generatedAt: "2099-01-01T00:00:00.000Z",
      sealedInventoryOnly: true,
    });
    expect(a.contractIdentityHash).toBe(b.contractIdentityHash);

    const mutatedAlpha = buildMomentumEvidenceDesignReport({
      config: { ...baseConfig, alpha: 0.01 },
      generatedAt: "2026-09-11T00:00:00.000Z",
      sealedInventoryOnly: true,
    });
    expect(mutatedAlpha.contractIdentityHash).not.toBe(a.contractIdentityHash);

    const mutatedMde = buildMomentumEvidenceDesignReport({
      config: { ...baseConfig, materialEffectThresholdCents: 3 },
      generatedAt: "2026-09-11T00:00:00.000Z",
      sealedInventoryOnly: true,
    });
    expect(mutatedMde.contractIdentityHash).not.toBe(a.contractIdentityHash);

    const mutatedFamilyBinding = buildMomentumEvidenceDesignReport({
      config: {
        ...baseConfig,
        familyDefinitionIdentity: "0".repeat(64),
      },
      generatedAt: "2026-09-11T00:00:00.000Z",
      sealedInventoryOnly: true,
    });
    expect(mutatedFamilyBinding.contractIdentityHash).not.toBe(a.contractIdentityHash);
  });

  it("validation midpoint-only / underpowered paths", () => {
    const candidate = baseCandidate();
    expect(
      evaluateMomentumValidationCandidate({
        candidate,
        trainDefinition: candidate,
        onTrainShortlist: true,
        independentValidationEss: 40,
        minEssForValidation: 10,
        directionalConsistency: "continuation-consistent",
        executableObservabilityShare: 0.9,
        minExecutableObservabilityShare: 0.5,
        captureQualityValid: true,
        midpointOnly: true,
        evidenceInvalidReason: null,
      }).status,
    ).toBe("validation-failed");

    expect(
      evaluateMomentumValidationCandidate({
        candidate,
        trainDefinition: candidate,
        onTrainShortlist: true,
        independentValidationEss: 5,
        minEssForValidation: 10,
        directionalConsistency: "continuation-consistent",
        executableObservabilityShare: 0.9,
        minExecutableObservabilityShare: 0.5,
        captureQualityValid: true,
        midpointOnly: false,
        evidenceInvalidReason: null,
      }).status,
    ).toBe("underpowered-for-validation");
  });

  it("shortlist retains all 12 and caps at 3", () => {
    const universe = buildSyntheticDiscoveryUniverse();
    const scored = universe.map((candidate, index) => ({
      candidate,
      independentTrainIncidence: 20 - index,
      directionConsistentWithFamily: true,
      executableObservabilityShare: 0.9,
      executableEffectAvailable: true,
      independentMarketsTouched: 5,
      independentMarketDaysTouched: 10,
      structuralSimplicityRank: index,
    }));
    const result = rankAndShortlistTrainCandidates({
      discoveryHypothesisCount: 12,
      candidates: scored,
    });
    expect(result.retainedLineageCount).toBe(12);
    expect(result.shortlist.length).toBeLessThanOrEqual(3);
    expect(() =>
      rankAndShortlistTrainCandidates({
        discoveryHypothesisCount: 11,
        candidates: scored.slice(0, 11),
      }),
    ).toThrow(MomentumEvidenceContractError);
  });
});
