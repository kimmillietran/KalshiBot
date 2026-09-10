import { describe, expect, it } from "vitest";

import {
  assertAtMostOneIndependentContributionPerMarketDayCell,
  assertCandidateDefinitionImmutable,
  assertCaptureQualityOrInvalidate,
  assertDirectionCannotFlip,
  assertMicrostructureFeatureAllowed,
  assertNoArbitraryNGate,
  assertRawQuotesAreNotIndependentN,
  buildCountLadder,
  buildMicrostructureEvidenceDesignReport,
  buildMicrostructureMultiplicityDesign,
  buildSyntheticDiscoveryUniverse,
  classifyResponseObservability,
  coerceMissingResponseToZeroCents,
  computeMicrostructureEffectiveSampleSize,
  deduplicateCrossingsToEpisodes,
  deriveMicrostructureRequiredEffectiveN,
  evaluateMicrostructureHoldout,
  evaluateMicrostructureValidationCandidate,
  insufficientPowerCannotSupportPromotion,
  lockHoldoutCandidateFromValidationSurvivors,
  midpointOnlyCannotAuthorizeEconomicSupport,
  MICROSTRUCTURE_DEFAULT_ALPHA,
  MICROSTRUCTURE_DEFAULT_TARGET_POWER,
  MICROSTRUCTURE_EVIDENCE_CONTRACT_ANALYSIS_VERSION,
  MICROSTRUCTURE_MAX_SHORTLIST_K,
  rankAndShortlistTrainCandidates,
  rejectBtcConditionedCandidate,
  rejectOptionalStoppingHeuristic,
  rejectUnsupportedDepthOrCancelFeatures,
  requireMaterialEffectThreshold,
  requireValidMicrostructureStoppingRule,
  runSyntheticMicrostructureEvidencePipeline,
  validateMicrostructureStoppingRule,
} from "./index";

function baseCandidate(overrides?: Partial<ReturnType<typeof buildSyntheticDiscoveryUniverse>[number]>) {
  const [first] = buildSyntheticDiscoveryUniverse();
  return { ...first!, ...overrides };
}

describe("M13.0b-prep microstructure evidence contract", () => {
  it("1. raw quote count cannot be independent N", () => {
    expect(() => assertRawQuotesAreNotIndependentN(500, 500)).toThrow(/Raw TOB quote count/);
    expect(() =>
      buildCountLadder({
        rawTobRows: 1000,
        rawQualifyingEvents: 50,
        refractoryDeduplicatedEpisodes: 20,
        independentMarketDays: 10,
        effectiveSampleSize: 1000,
      }),
    ).toThrow();
  });

  it("2. repeated same-market/day episode cannot inflate ESS", () => {
    const ess = computeMicrostructureEffectiveSampleSize([
      { marketTicker: "M1", calendarDay: "2026-09-01", structuralCellId: "c1", usable: true },
      { marketTicker: "M1", calendarDay: "2026-09-01", structuralCellId: "c1", usable: true },
      { marketTicker: "M1", calendarDay: "2026-09-01", structuralCellId: "c1", usable: true },
    ]);
    expect(ess).toBe(1);
  });

  it("3. overlapping response episodes do not become independent", () => {
    const episodes = deduplicateCrossingsToEpisodes([
      {
        marketTicker: "M1",
        calendarDay: "2026-09-01",
        structuralCellId: "c1",
        crossingTsMs: 1_000,
        responseHorizonMs: 5_000,
      },
      {
        marketTicker: "M1",
        calendarDay: "2026-09-01",
        structuralCellId: "c1",
        crossingTsMs: 2_000,
        responseHorizonMs: 5_000,
      },
      {
        marketTicker: "M1",
        calendarDay: "2026-09-01",
        structuralCellId: "c1",
        crossingTsMs: 10_000,
        responseHorizonMs: 5_000,
      },
    ]);
    expect(episodes).toHaveLength(2);
    assertAtMostOneIndependentContributionPerMarketDayCell(episodes);
    const ess = computeMicrostructureEffectiveSampleSize(
      episodes.map((episode) => ({
        marketTicker: episode.marketTicker,
        calendarDay: episode.calendarDay,
        structuralCellId: episode.structuralCellId,
        usable: true,
      })),
    );
    expect(ess).toBe(1);
  });

  it("4. midpoint-only evidence cannot authorize economic support", () => {
    const result = midpointOnlyCannotAuthorizeEconomicSupport({
      midpointResponseCents: 3,
      executableResponseCents: null,
      executableObservable: false,
    });
    expect(result.economicSupportAuthorized).toBe(false);
  });

  it("5. executable evidence is separately required", () => {
    const result = midpointOnlyCannotAuthorizeEconomicSupport({
      midpointResponseCents: 3,
      executableResponseCents: 2,
      executableObservable: true,
    });
    expect(result.economicSupportAuthorized).toBe(true);
  });

  it("6. missing response is unobservable, not zero", () => {
    expect(classifyResponseObservability(false)).toBe("unobservable");
    expect(() => coerceMissingResponseToZeroCents(true)).toThrow(/unobservable/);
  });

  it("7. insufficient power cannot support promotion", () => {
    const required = deriveMicrostructureRequiredEffectiveN({
      alpha: 0.05,
      targetPower: 0.8,
      materialEffectCents: 2,
      outcomeStandardDeviationCents: 10,
    });
    const gate = insufficientPowerCannotSupportPromotion({
      effectiveSampleSize: 3,
      requiredEffectiveN: required.requiredEffectiveN,
    });
    expect(gate.promotionSupportAllowed).toBe(false);
  });

  it("8. material-effect threshold missing fails closed", () => {
    expect(() => requireMaterialEffectThreshold(null)).toThrow(/fails closed/);
    expect(() =>
      evaluateMicrostructureHoldout({
        locked: {
          candidate: baseCandidate(),
          lockRationale: [],
          survivorCount: 1,
        },
        evaluatedCandidate: baseCandidate(),
        independentEss: 200,
        requiredEffectiveN: 100,
        captureQualityValid: true,
        executableObservableShare: 1,
        minExecutableObservableShare: 0.5,
        pointEstimateFavorable: true,
        evidenceInvalidReason: null,
        materialEffectThresholdCents: null,
        observedAbsExecutableEffectCents: 3,
      }),
    ).toThrow(/fails closed/);
  });

  it("9. no arbitrary n=20/50/100 rule", () => {
    expect(() => assertNoArbitraryNGate(20)).toThrow(/Arbitrary/);
    expect(() => assertNoArbitraryNGate(50)).toThrow(/Arbitrary/);
    expect(() => assertNoArbitraryNGate(100)).toThrow(/Arbitrary/);
    const required = deriveMicrostructureRequiredEffectiveN({
      alpha: MICROSTRUCTURE_DEFAULT_ALPHA,
      targetPower: MICROSTRUCTURE_DEFAULT_TARGET_POWER,
      materialEffectCents: 2,
      outcomeStandardDeviationCents: 10,
    });
    expect(required.requiredEffectiveN).not.toBe(20);
    expect(required.requiredEffectiveN).not.toBe(50);
    expect(required.requiredEffectiveN).not.toBe(100);
    expect(required.reusedFunction).toBe("powerAnalysis.computeRequiredSampleSize");
  });

  it("10. discovery lineage retains 12 hypotheses", () => {
    expect(buildSyntheticDiscoveryUniverse()).toHaveLength(12);
    expect(buildMicrostructureMultiplicityDesign().discoveryHypothesisCount).toBe(12);
  });

  it("11. shortlist cannot exceed 3", () => {
    const universe = buildSyntheticDiscoveryUniverse();
    expect(() =>
      rankAndShortlistTrainCandidates({
        discoveryHypothesisCount: 12,
        candidates: universe.map((candidate, index) => ({
          candidate,
          independentTrainIncidence: 10,
          directionConsistentWithFamily: true,
          executableObservabilityShare: 0.9,
          executableEffectAvailable: true,
          independentMarketsTouched: 3,
          independentMarketDaysTouched: 5,
          structuralSimplicityRank: index,
        })),
        maxK: 4,
      }),
    ).toThrow(/cannot exceed/);
    const { shortlist } = rankAndShortlistTrainCandidates({
      discoveryHypothesisCount: 12,
      candidates: universe.map((candidate, index) => ({
        candidate,
        independentTrainIncidence: 10,
        directionConsistentWithFamily: true,
        executableObservabilityShare: 0.9,
        executableEffectAvailable: true,
        independentMarketsTouched: 3,
        independentMarketDaysTouched: 5,
        structuralSimplicityRank: index,
      })),
      maxK: MICROSTRUCTURE_MAX_SHORTLIST_K,
    });
    expect(shortlist.length).toBeLessThanOrEqual(3);
  });

  it("12. candidate definition cannot mutate between stages", () => {
    const train = baseCandidate();
    const mutated = baseCandidate({ imbalanceThreshold: 0.99 });
    expect(() =>
      assertCandidateDefinitionImmutable({ trainDefinition: train, laterDefinition: mutated }),
    ).toThrow(/mutated/);
  });

  it("13. direction cannot flip", () => {
    expect(() => assertDirectionCannotFlip("same-direction")).not.toThrow();
    expect(() => assertDirectionCannotFlip("opposite-direction")).toThrow(/flipping/);
  });

  it("14. losing/non-shortlisted TRAIN candidate cannot appear in validation", () => {
    const candidate = baseCandidate();
    expect(() =>
      evaluateMicrostructureValidationCandidate({
        candidate,
        trainDefinition: candidate,
        onTrainShortlist: false,
        independentValidationEss: 40,
        minEssForValidation: 10,
        directionalConsistency: "same-sign",
        executableObservabilityShare: 0.9,
        minExecutableObservabilityShare: 0.5,
        captureQualityValid: true,
        midpointOnly: false,
        evidenceInvalidReason: null,
      }),
    ).toThrow(/TRAIN shortlist/);
  });

  it("15. non-validated candidate cannot enter holdout", () => {
    const locked = baseCandidate();
    const other = baseCandidate({
      candidateId: "other",
      hypothesisId: "other",
      imbalanceThreshold: 0.6,
    });
    expect(() =>
      evaluateMicrostructureHoldout({
        locked: { candidate: locked, lockRationale: [], survivorCount: 1 },
        evaluatedCandidate: other,
        independentEss: 200,
        requiredEffectiveN: 100,
        captureQualityValid: true,
        executableObservableShare: 1,
        minExecutableObservableShare: 0.5,
        pointEstimateFavorable: true,
        evidenceInvalidReason: null,
        materialEffectThresholdCents: 2,
        observedAbsExecutableEffectCents: 3,
      }),
    ).toThrow(/cannot enter holdout|mutated/);
  });

  it("16. holdout evaluates exactly one candidate", () => {
    const pipeline = runSyntheticMicrostructureEvidencePipeline();
    expect(pipeline.lockedCandidateId).not.toBeNull();
    expect(pipeline.holdoutVerdict).toBe("support");
  });

  it("17. zero validation survivors is valid", () => {
    const pipeline = runSyntheticMicrostructureEvidencePipeline({
      forceZeroValidationSurvivors: true,
    });
    expect(pipeline.lockedCandidateId).toBeNull();
    expect(pipeline.holdoutVerdict).toBeNull();
    expect(
      lockHoldoutCandidateFromValidationSurvivors({ survivors: [] }),
    ).toBeNull();
  });

  it("18. deterministic tie-break does not depend solely on largest effect", () => {
    const a = baseCandidate({ candidateId: "a", hypothesisId: "a" });
    const b = baseCandidate({
      candidateId: "b",
      hypothesisId: "b",
      imbalanceThreshold: 0.6,
    });
    const locked = lockHoldoutCandidateFromValidationSurvivors({
      survivors: [
        {
          candidateId: "a",
          status: "validated",
          rationale: [],
          candidate: a,
          independentEvidenceSupport: 10,
          directionalReplicationShare: 0.5,
          executableObservabilityShare: 0.5,
          effectClearsMaterialFloor: true,
          structuralSimplicityRank: 1,
        },
        {
          candidateId: "b",
          status: "validated",
          rationale: [],
          candidate: b,
          independentEvidenceSupport: 50,
          directionalReplicationShare: 0.5,
          executableObservabilityShare: 0.5,
          effectClearsMaterialFloor: true,
          structuralSimplicityRank: 0,
        },
      ],
    });
    expect(locked?.candidate.candidateId).toBe("b");
    expect(locked?.lockRationale.join(" ")).toMatch(/not largest validation effect/i);
  });

  it("19. underpowered holdout is not support/reject", () => {
    const candidate = baseCandidate();
    const result = evaluateMicrostructureHoldout({
      locked: { candidate, lockRationale: [], survivorCount: 1 },
      evaluatedCandidate: candidate,
      independentEss: 3,
      requiredEffectiveN: 155,
      captureQualityValid: true,
      executableObservableShare: 1,
      minExecutableObservableShare: 0.5,
      pointEstimateFavorable: true,
      evidenceInvalidReason: null,
      materialEffectThresholdCents: 2,
      observedAbsExecutableEffectCents: 5,
    });
    expect(result.verdict).toBe("underpowered");
    expect(result.pointEstimateFavorable).toBe(true);
  });

  it("20. capture-quality failure invalidates evidence", () => {
    const quality = assertCaptureQualityOrInvalidate({
      validEconomicBookCoverage: true,
      bidSizeCoverage: false,
      timestampQuality: true,
      sequenceResyncIntegrity: true,
      responseObservability: true,
    });
    expect(quality.valid).toBe(false);
    const candidate = baseCandidate();
    const validation = evaluateMicrostructureValidationCandidate({
      candidate,
      trainDefinition: candidate,
      onTrainShortlist: true,
      independentValidationEss: 40,
      minEssForValidation: 10,
      directionalConsistency: "same-sign",
      executableObservabilityShare: 0.9,
      minExecutableObservabilityShare: 0.5,
      captureQualityValid: false,
      midpointOnly: false,
      evidenceInvalidReason: null,
    });
    expect(validation.status).toBe("invalid-evidence");
  });

  it("21. BTC-conditioned candidate rejected", () => {
    expect(() => rejectBtcConditionedCandidate()).toThrow(/btc-conditioning/);
  });

  it("22. unsupported depth/cancel features rejected", () => {
    expect(() => rejectUnsupportedDepthOrCancelFeatures("multi-level-depth")).toThrow();
    expect(() => rejectUnsupportedDepthOrCancelFeatures("cancel-trade-labels")).toThrow();
    expect(() => assertMicrostructureFeatureAllowed("endogenous-tob-imbalance")).not.toThrow();
  });

  it("23. fixed-N stopping supported", () => {
    const rule = requireValidMicrostructureStoppingRule({
      kind: "fixed-n",
      minimumEffectiveSampleSize: 155,
      interpretationIfNotReached: "inconclusive-underpowered",
    });
    expect(rule.kind).toBe("fixed-n");
    expect(validateMicrostructureStoppingRule(rule).valid).toBe(true);
  });

  it("24. optional stopping rejected", () => {
    expect(validateMicrostructureStoppingRule(null).valid).toBe(false);
    expect(() =>
      rejectOptionalStoppingHeuristic("keep-collecting-until-p-lt-05"),
    ).toThrow(/Optional stopping/);
    expect(() =>
      rejectOptionalStoppingHeuristic("stop-because-effect-looks-good"),
    ).toThrow(/Optional stopping/);
  });

  it("25. deterministic contract identity", () => {
    const a = buildMicrostructureEvidenceDesignReport({
      config: {
        familyDefinitionIdentity: null,
        materialEffectThresholdCents: null,
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
    });
    const b = buildMicrostructureEvidenceDesignReport({
      config: {
        familyDefinitionIdentity: null,
        materialEffectThresholdCents: null,
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
      generatedAt: "2099-01-01T00:00:00.000Z",
    });
    expect(a.contractIdentityHash).toBe(b.contractIdentityHash);
    expect(a.analysisVersion).toBe(MICROSTRUCTURE_EVIDENCE_CONTRACT_ANALYSIS_VERSION);
  });

  it("26. no latest/mtime authority", () => {
    const report = buildMicrostructureEvidenceDesignReport({
      config: {
        familyDefinitionIdentity: null,
        materialEffectThresholdCents: 2,
        alpha: 0.05,
        targetPower: 0.8,
        outcomeStandardDeviationCents: 10,
        maxShortlistK: 3,
        expectedDiscoveryHypothesisCount: 12,
        stoppingRule: null,
        outputPath: null,
        htmlOutputPath: null,
      },
    });
    expect(report.outputPath).toContain(report.contractIdentityHash);
    expect(report.outputPath).not.toMatch(/latest/i);
  });

  it("27-32. quarantine: no real outcomes, promotion, prereg, freeze, capture, orders", () => {
    const report = buildMicrostructureEvidenceDesignReport({
      config: {
        familyDefinitionIdentity: null,
        materialEffectThresholdCents: null,
        alpha: 0.05,
        targetPower: 0.8,
        outcomeStandardDeviationCents: 10,
        maxShortlistK: 3,
        expectedDiscoveryHypothesisCount: 12,
        stoppingRule: null,
        outputPath: null,
        htmlOutputPath: null,
      },
    });
    expect(report.quarantine).toEqual({
      realHistoricalMicrostructureOutcomesRead: false,
      candidateSelected: false,
      promotionArtifactCreated: false,
      preregistrationArtifactCreated: false,
      freezeCreated: false,
      captureStarted: false,
      liveOrdersExecuted: false,
    });
    const pipeline = runSyntheticMicrostructureEvidencePipeline();
    expect(pipeline.discoveryCount).toBe(12);
    expect(pipeline.shortlistCount).toBeLessThanOrEqual(3);
  });

  it("synthetic pipeline: 12 → ≤3 → lock → holdout", () => {
    const pipeline = runSyntheticMicrostructureEvidencePipeline();
    expect(pipeline.discoveryCount).toBe(12);
    expect(pipeline.shortlistCount).toBe(3);
    expect(pipeline.lockedCandidateId).toBeTruthy();
    expect(["support", "reject", "underpowered"]).toContain(pipeline.holdoutVerdict);
  });

  it("material effect unbound surfaces fail-closed status in design report", () => {
    const report = buildMicrostructureEvidenceDesignReport({
      config: {
        familyDefinitionIdentity: null,
        materialEffectThresholdCents: null,
        alpha: 0.05,
        targetPower: 0.8,
        outcomeStandardDeviationCents: 10,
        maxShortlistK: 3,
        expectedDiscoveryHypothesisCount: 12,
        stoppingRule: null,
        outputPath: null,
        htmlOutputPath: null,
      },
    });
    expect(report.materialEffectDecisionStatus.bound).toBe(false);
    expect(report.materialEffectDecisionStatus.failsClosedIfMissing).toBe(true);
    expect(report.materialEffectDecisionStatus.recommendedCents).toBe(2);
  });
});
