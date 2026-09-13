import { describe, expect, it } from "vitest";

import { MomentumEvidenceContractError } from "../momentumEvidenceContract";
import {
  assertAdmittedValidationSegmentCannotBecomeHoldout,
  assertSealedMomentumIdentitiesMatchPreOpen,
  buildBlindIncidenceWithMarketDayCap,
  buildMomentumIndependentUnitKey,
  buildMomentumValidationCohortPlan,
  createEmptyMomentumValidationCohortRegistry,
  KNOWN_M140A_EVIDENCE_CONTRACT_IDENTITY,
  KNOWN_M140A_FAMILY_DEFINITION_IDENTITY,
  KNOWN_M140B_DISCOVERY_IDENTITY,
  LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
  MOMENTUM_VALIDATION_TARGET_ESS,
  type MomentumValidationAcceptedSegment,
} from "../kalshiTobMomentumValidationCohort";

import {
  assertCohortReadyForOutcomeOpen,
  assertRealValidationCaptureStreamAllowed,
  authorizeMomentumValidationOutcomeAccess,
  bindValidationAuthorities,
  buildMomentumValidationReport,
  computeDiagnosticMidViaFamilyHelper,
  computeExecutablePnlViaFamilyHelper,
  computeValidationOutcomesFromEpisodes,
  createValidationOnlyMomentumIo,
  evaluateLockedCandidateOnValidation,
  KNOWN_M140B_DISCOVERY_IDENTITY as VALIDATION_DISCOVERY_ID,
  LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID as VALIDATION_CANDIDATE_ID,
  MOMENTUM_VALIDATION_ANALYSIS_VERSION,
  MOMENTUM_VALIDATION_MIN_EXECUTABLE_OBSERVABILITY_SHARE,
  MomentumValidationError,
  type MomentumValidationCohortAuthorityInput,
  type SyntheticValidationEpisode,
} from "./index";

const PLAN_FREEZE = "2026-09-12T00:00:00.000Z";
const FRESH_START = Date.parse("2026-09-12T12:00:00.000Z");

function makeUnitId(market: string, day: string): string {
  return buildMomentumIndependentUnitKey({
    marketTicker: market,
    tradingDayUtc: day,
  });
}

function makeAcceptedSegment(input: {
  runId: string;
  unitIds: readonly string[];
  captureStartMs?: number;
  healthPassed?: boolean;
  topOfBookPresent?: boolean;
  contaminationClassification?: string;
  outcomesOpened?: false;
}): MomentumValidationAcceptedSegment {
  const capped = buildBlindIncidenceWithMarketDayCap({
    segmentRunId: input.runId,
    episodeKeys: input.unitIds.map((unitId) => ({ unitId })),
  });
  return {
    runId: input.runId,
    captureRunDir: `data/live-capture/forward-quotes/${input.runId}`,
    captureStartMs: input.captureStartMs ?? FRESH_START,
    captureEndMs: (input.captureStartMs ?? FRESH_START) + 300 * 60_000,
    durationMinutes: 300,
    captureIdentityHash: `capture-${input.runId}`,
    health: {
      passed: input.healthPassed ?? true,
      verdict: "ok",
      topOfBookPresent: input.topOfBookPresent ?? true,
      failureReasons: input.healthPassed === false ? ["unhealthy"] : [],
    },
    captureEndReason: "duration-elapsed",
    configIdentity: "cfg-test",
    priorResearchRoles: [],
    contaminationClassification:
      input.contaminationClassification
      ?? "untouched-for-short-horizon-price-response",
    intendedCohortPosition: null,
    outcomesOpened: false,
    reservedForValidationLineage: true,
    reservedAfterPlanFreeze: true,
    planIdentity: "plan-test",
    reservationAttestationHash: `attest-${input.runId}`,
    accepted: true,
    blindIncidence: capped.incidence,
    independentUnitIds: capped.independentUnitIds,
  };
}

/** Build N distinct market-day units for the locked candidate. */
function makeNUnits(n: number, prefix = "M"): string[] {
  const units: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const day = `2026-09-${String((i % 28) + 1).padStart(2, "0")}`;
    const market = `${prefix}${Math.floor(i / 28)}`;
    units.push(makeUnitId(market, day));
  }
  return units;
}

function makeReadyAuthority(overrides?: {
  ess?: number;
  status?: MomentumValidationCohortAuthorityInput["cohortStatus"];
  lockedCandidateId?: string;
  planIdentity?: string;
  discoveryIdentity?: string;
  familyDefinitionIdentity?: string;
  evidenceContractIdentity?: string;
  segments?: MomentumValidationAcceptedSegment[];
}): MomentumValidationCohortAuthorityInput {
  const { planIdentity } = buildMomentumValidationCohortPlan();
  const ess = overrides?.ess ?? 155;
  const units = makeNUnits(ess);
  const segment =
    overrides?.segments?.[0]
    ?? makeAcceptedSegment({
      runId: "val-seg-1",
      unitIds: units,
    });
  const segments = overrides?.segments ?? [segment];
  const registry = createEmptyMomentumValidationCohortRegistry({
    planIdentity: overrides?.planIdentity ?? planIdentity,
    planFreezeTimestampIso: PLAN_FREEZE,
  });
  registry.accepted.push(...segments);

  return {
    familyDefinitionIdentity:
      overrides?.familyDefinitionIdentity ?? KNOWN_M140A_FAMILY_DEFINITION_IDENTITY,
    evidenceContractIdentity:
      overrides?.evidenceContractIdentity ?? KNOWN_M140A_EVIDENCE_CONTRACT_IDENTITY,
    discoveryIdentity: overrides?.discoveryIdentity ?? KNOWN_M140B_DISCOVERY_IDENTITY,
    planIdentity: overrides?.planIdentity ?? planIdentity,
    lockedCandidateId: overrides?.lockedCandidateId ?? LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
    registry,
    cohortStatus: overrides?.status ?? "ready-for-outcome-open",
    cumulativeBlindEss: overrides?.ess,
  };
}

function makeWinningEpisodes(n: number): SyntheticValidationEpisode[] {
  const episodes: SyntheticValidationEpisode[] = [];
  for (let i = 0; i < n; i += 1) {
    const day = `2026-09-${String((i % 28) + 1).padStart(2, "0")}`;
    const market = `W${Math.floor(i / 28)}`;
    episodes.push({
      marketTicker: market,
      tradingDayUtc: day,
      signedExecutablePnlCents: 2 + (i % 3),
      signedMidpointContinuationCents: 1,
      responseObservable: true,
      executableObservable: true,
    });
  }
  return episodes;
}

function makeLosingEpisodes(n: number): SyntheticValidationEpisode[] {
  return makeWinningEpisodes(n).map((episode) => ({
    ...episode,
    signedExecutablePnlCents: -2,
  }));
}

describe("kalshiTobMomentumValidation", () => {
  it("binds sealed authorities and analysis version", () => {
    const sealed = assertSealedMomentumIdentitiesMatchPreOpen();
    const authorities = bindValidationAuthorities();
    expect(authorities.familyDefinitionIdentity).toBe(sealed.familyDefinitionIdentity);
    expect(authorities.evidenceContractIdentity).toBe(sealed.evidenceContractIdentity);
    expect(authorities.discoveryIdentity).toBe(VALIDATION_DISCOVERY_ID);
    expect(authorities.lockedCandidateId).toBe(VALIDATION_CANDIDATE_ID);
    expect(authorities.minEssForValidation).toBe(MOMENTUM_VALIDATION_TARGET_ESS);
    expect(authorities.minExecutableObservabilityShare).toBe(
      MOMENTUM_VALIDATION_MIN_EXECUTABLE_OBSERVABILITY_SHARE,
    );
    expect(MOMENTUM_VALIDATION_ANALYSIS_VERSION).toBe("kalshi-tob-momentum-validation-v1");
    const plan = buildMomentumValidationCohortPlan();
    expect(authorities.planIdentity).toBe(plan.planIdentity);
    expect(plan.planIdentity).toMatch(/^a54f4a8c/);
  });

  it("1. cohort not ready → no outcome access", () => {
    const authority = makeReadyAuthority({
      ess: 100,
      status: "continue-collection",
    });
    const gate = authorizeMomentumValidationOutcomeAccess(authority);
    expect(gate.authorized).toBe(false);
    if (!gate.authorized) {
      expect(gate.disposition).toBe("blocked");
    }
    expect(() => assertCohortReadyForOutcomeOpen(authority)).toThrow(MomentumValidationError);
    expect(() =>
      buildMomentumValidationReport({
        cohortAuthority: authority,
        injectedOutcomes: makeWinningEpisodes(100),
      })
    ).toThrow(/blocked|continue-collection/i);
  });

  it("2. ESS 154 → blocked", () => {
    const authority = makeReadyAuthority({
      ess: 154,
      status: "ready-for-outcome-open",
    });
    const gate = authorizeMomentumValidationOutcomeAccess(authority);
    expect(gate.authorized).toBe(false);
    if (!gate.authorized) {
      expect(gate.reason).toMatch(/154/);
      expect(gate.disposition).toBe("blocked");
    }
  });

  it("3. ESS 155 + ready → outcome access permitted", () => {
    const authority = makeReadyAuthority({ ess: 155 });
    const gate = authorizeMomentumValidationOutcomeAccess(authority);
    expect(gate.authorized).toBe(true);
    if (gate.authorized) {
      expect(gate.disposition).toBe("ready-for-outcome-open");
      expect(gate.cumulativeBlindEss).toBe(155);
    }
  });

  it("4. wrong candidate rejected", () => {
    const authority = makeReadyAuthority({
      lockedCandidateId: "W-15000|X-3|H-5000|continuation",
    });
    const gate = authorizeMomentumValidationOutcomeAccess(authority);
    expect(gate.authorized).toBe(false);
    if (!gate.authorized) {
      expect(gate.disposition).toBe("invalid-evidence");
      expect(gate.reason).toMatch(/Locked candidate mismatch/i);
    }

    const authorities = bindValidationAuthorities();
    expect(() =>
      evaluateLockedCandidateOnValidation({
        lockedCandidate: {
          ...authorities.lockedCandidate,
          candidateId: "W-15000|X-3|H-5000|continuation",
          hypothesisId: "W-15000|X-3|H-5000|continuation",
        },
        trainDefinition: authorities.lockedCandidate,
        outcomeMetrics: computeValidationOutcomesFromEpisodes(makeWinningEpisodes(155)),
      })
    ).toThrow(/Wrong candidate rejected/i);
  });

  it("5. losing TRAIN candidate rejected at bind", () => {
    expect(() =>
      bindValidationAuthorities({
        shortlistCandidateIds: ["W-15000|X-3|H-5000|continuation"],
      })
    ).toThrow(/Losing TRAIN candidates cannot enter validation/i);
  });

  it("6. altered W/X/H rejected", () => {
    const authorities = bindValidationAuthorities();
    const mutated = {
      ...authorities.lockedCandidate,
      lookbackWindowMs: 15_000,
      candidateId: LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
      hypothesisId: LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
    };
    expect(() =>
      evaluateLockedCandidateOnValidation({
        lockedCandidate: mutated,
        trainDefinition: authorities.lockedCandidate,
        outcomeMetrics: computeValidationOutcomesFromEpisodes(makeWinningEpisodes(155)),
      })
    ).toThrow(/immutable|mutated/i);
  });

  it("7. reversal rejected", () => {
    const authorities = bindValidationAuthorities();
    expect(() =>
      evaluateLockedCandidateOnValidation({
        lockedCandidate: {
          ...authorities.lockedCandidate,
          direction: "reversal" as "continuation",
        },
        trainDefinition: authorities.lockedCandidate,
        outcomeMetrics: computeValidationOutcomesFromEpisodes(makeWinningEpisodes(155)),
      })
    ).toThrow(/Reversal/i);
  });

  it("8. contaminated segment rejected via gate", () => {
    const units = makeNUnits(155);
    const contaminated = makeAcceptedSegment({
      runId: "contam-1",
      unitIds: units,
      contaminationClassification: "outcome-consumed-related-tob-price-response",
    });
    const authority = makeReadyAuthority({ segments: [contaminated] });
    const gate = authorizeMomentumValidationOutcomeAccess(authority);
    expect(gate.authorized).toBe(false);
    if (!gate.authorized) {
      expect(gate.disposition).toBe("invalid-evidence");
      expect(gate.reason).toMatch(/Contaminated/i);
    }
  });

  it("9. duplicate market/day across segments deduped in ESS", () => {
    const shared = makeNUnits(100, "S");
    const extra = makeNUnits(55, "E");
    const seg1 = makeAcceptedSegment({
      runId: "dup-1",
      unitIds: shared,
      captureStartMs: FRESH_START,
    });
    const seg2 = makeAcceptedSegment({
      runId: "dup-2",
      unitIds: [...shared, ...extra],
      captureStartMs: FRESH_START + 1,
    });
    const authority = makeReadyAuthority({
      segments: [seg1, seg2],
      status: "ready-for-outcome-open",
    });
    // Force recompute via omit cumulativeBlindEss
    delete (authority as { cumulativeBlindEss?: number }).cumulativeBlindEss;
    const gate = authorizeMomentumValidationOutcomeAccess(authority);
    expect(gate.authorized).toBe(true);
    if (gate.authorized) {
      expect(gate.cumulativeBlindEss).toBe(155);
    }

    const episodes: SyntheticValidationEpisode[] = [];
    for (const unitId of [...shared, ...extra]) {
      const [market, day] = unitId.split(":").slice(0, 2) as [string, string];
      episodes.push({
        marketTicker: market,
        tradingDayUtc: day,
        signedExecutablePnlCents: 3,
        signedMidpointContinuationCents: 1,
        responseObservable: true,
        executableObservable: true,
      });
    }
    // Duplicate first 10 market-days again
    for (const unitId of shared.slice(0, 10)) {
      const [market, day] = unitId.split(":").slice(0, 2) as [string, string];
      episodes.push({
        marketTicker: market,
        tradingDayUtc: day,
        signedExecutablePnlCents: 99,
        signedMidpointContinuationCents: 99,
        responseObservable: true,
        executableObservable: true,
      });
    }
    const metrics = computeValidationOutcomesFromEpisodes(episodes);
    expect(metrics.independentValidationEss).toBe(155);
    expect(metrics.duplicateUnitsRemoved).toBe(10);
    expect(metrics.signedExecutableMedianCents).not.toBe(99);
  });

  it("10. missing response unobservable (null pnl does not invent zero)", () => {
    const episodes: SyntheticValidationEpisode[] = [
      {
        marketTicker: "M0",
        tradingDayUtc: "2026-09-01",
        signedExecutablePnlCents: null,
        signedMidpointContinuationCents: null,
        responseObservable: false,
        executableObservable: false,
      },
      {
        marketTicker: "M1",
        tradingDayUtc: "2026-09-01",
        signedExecutablePnlCents: 4,
        signedMidpointContinuationCents: 2,
        responseObservable: true,
        executableObservable: true,
      },
    ];
    const metrics = computeValidationOutcomesFromEpisodes(episodes);
    expect(metrics.signedExecutableMedianCents).toBe(4);
    expect(metrics.signedExecutableMeanCents).toBe(4);
    expect(metrics.executableObservabilityShare).toBe(0.5);
  });

  it("11. executable P&L arithmetic exact via family helper", () => {
    // Upward: buy YES at ask (=100-noBid), sell at exit bid.
    // entry yesBid=40, noBid=55 → ask=45; exit yesBid=50 → pnl = 50-45 = 5
    const pnl = computeExecutablePnlViaFamilyHelper({
      continuationSign: 1,
      entryYesBestBidCents: 40,
      entryNoBestBidCents: 55,
      exitYesBestBidCents: 50,
      exitNoBestBidCents: 45,
    });
    expect(pnl).toBe(5);
    const mid = computeDiagnosticMidViaFamilyHelper({
      continuationSign: 1,
      eventMidCents: 50,
      responseMidCents: 53,
    });
    expect(mid).toBe(3);
  });

  it("12. midpoint cannot authorize validation", () => {
    const authorities = bindValidationAuthorities();
    const episodes: SyntheticValidationEpisode[] = makeNUnits(155).map((unitId) => {
      const [market, day] = unitId.split(":").slice(0, 2) as [string, string];
      return {
        marketTicker: market,
        tradingDayUtc: day,
        signedExecutablePnlCents: null,
        signedMidpointContinuationCents: 10,
        responseObservable: true,
        executableObservable: false,
      };
    });
    const metrics = computeValidationOutcomesFromEpisodes(episodes);
    expect(metrics.midpointOnly).toBe(true);
    const evaluation = evaluateLockedCandidateOnValidation({
      lockedCandidate: authorities.lockedCandidate,
      trainDefinition: authorities.lockedCandidate,
      outcomeMetrics: metrics,
    });
    expect(evaluation.status).toBe("validation-failed");
    expect(evaluation.rationale.join(" ")).toMatch(/Midpoint-only/i);
  });

  it("13. median > 0 direction consistent", () => {
    const metrics = computeValidationOutcomesFromEpisodes(makeWinningEpisodes(155));
    expect(metrics.signedExecutableMedianCents).toBeGreaterThan(0);
    const authorities = bindValidationAuthorities();
    const evaluation = evaluateLockedCandidateOnValidation({
      lockedCandidate: authorities.lockedCandidate,
      trainDefinition: authorities.lockedCandidate,
      outcomeMetrics: metrics,
    });
    expect(evaluation.directionalConsistency).toBe("continuation-consistent");
  });

  it("14. median = 0 fails", () => {
    const zeroEpisodes = makeWinningEpisodes(155).map((episode) => ({
      ...episode,
      signedExecutablePnlCents: 0,
    }));
    const metrics = computeValidationOutcomesFromEpisodes(zeroEpisodes);
    expect(metrics.signedExecutableMedianCents).toBe(0);
    const authorities = bindValidationAuthorities();
    const evaluation = evaluateLockedCandidateOnValidation({
      lockedCandidate: authorities.lockedCandidate,
      trainDefinition: authorities.lockedCandidate,
      outcomeMetrics: metrics,
    });
    expect(evaluation.directionalConsistency).toBe("not-continuation-consistent");
    expect(evaluation.status).toBe("validation-failed");
  });

  it("15. mean positive / median nonpositive still fails", () => {
    // Values: many small negatives and few large positives → mean > 0, median <= 0
    const values = [
      ...Array.from({ length: 80 }, () => -1),
      ...Array.from({ length: 75 }, () => 10),
    ];
    expect(values.length).toBe(155);
    const episodes = makeWinningEpisodes(155).map((episode, index) => ({
      ...episode,
      signedExecutablePnlCents: values[index]!,
    }));
    const metrics = computeValidationOutcomesFromEpisodes(episodes);
    expect(metrics.signedExecutableMeanCents).toBeGreaterThan(0);
    expect(metrics.signedExecutableMedianCents!).toBeLessThanOrEqual(0);
    const authorities = bindValidationAuthorities();
    const evaluation = evaluateLockedCandidateOnValidation({
      lockedCandidate: authorities.lockedCandidate,
      trainDefinition: authorities.lockedCandidate,
      outcomeMetrics: metrics,
    });
    expect(evaluation.status).toBe("validation-failed");
    expect(evaluation.directionalConsistency).not.toBe("continuation-consistent");
  });

  it("16. adequate ESS + valid economics → validated", () => {
    const authority = makeReadyAuthority({ ess: 155 });
    const report = buildMomentumValidationReport({
      cohortAuthority: authority,
      injectedOutcomes: makeWinningEpisodes(155),
      generatedAt: "2026-09-13T00:00:00.000Z",
    });
    expect(report.outcomesOpened).toBe(true);
    expect(report.overallStatus).toBe("validated");
    expect(report.candidateEvaluation?.status).toBe("validated");
    expect(report.nextAction).toBe("holdout-eligible-lock-only");
    expect(report.holdoutLockEligibility?.candidateId).toBe(
      LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
    );
    expect(report.holdoutLockEligibility?.holdoutOpened).toBe(false);
    expect(report.quarantine.holdoutOutcomesRead).toBe(false);
    expect(report.quarantine.liveOrders).toBe(false);
  });

  it("17. negative median → validation-failed + stop-lineage", () => {
    const authority = makeReadyAuthority({ ess: 155 });
    const report = buildMomentumValidationReport({
      cohortAuthority: authority,
      injectedOutcomes: makeLosingEpisodes(155),
      generatedAt: "2026-09-13T00:00:00.000Z",
    });
    expect(report.overallStatus).toBe("validation-failed");
    expect(report.nextAction).toBe("stop-lineage");
    expect(report.holdoutLockEligibility).toBeNull();
  });

  it("18. invalid capture → invalid-evidence", () => {
    const authority = makeReadyAuthority({ ess: 155 });
    const report = buildMomentumValidationReport({
      cohortAuthority: authority,
      injectedOutcomes: makeWinningEpisodes(155),
      captureQualityValid: false,
      evidenceInvalidReason: "capture quality failed",
      generatedAt: "2026-09-13T00:00:00.000Z",
    });
    expect(report.overallStatus).toBe("invalid-evidence");
    expect(report.candidateEvaluation?.status).toBe("invalid-evidence");
  });

  it("19. validation segment cannot become HOLDOUT", () => {
    expect(() =>
      assertAdmittedValidationSegmentCannotBecomeHoldout({
        runId: "val-seg-1",
        admittedToValidationCohort: true,
        proposedRole: "holdout",
      })
    ).toThrow(/forever forbidden/i);

    const authority = makeReadyAuthority({ ess: 155 });
    const report = buildMomentumValidationReport({
      cohortAuthority: authority,
      injectedOutcomes: makeWinningEpisodes(155),
      generatedAt: "2026-09-13T00:00:00.000Z",
    });
    expect(report.holdoutLockEligibility?.isolationAttested).toBe(true);
    expect(report.quarantine.holdoutOpened).toBe(false);
  });

  it("20. result deterministic (same hash)", () => {
    const authority = makeReadyAuthority({ ess: 155 });
    const outcomes = makeWinningEpisodes(155);
    const a = buildMomentumValidationReport({
      cohortAuthority: authority,
      injectedOutcomes: outcomes,
      generatedAt: "2026-09-13T00:00:00.000Z",
    });
    const b = buildMomentumValidationReport({
      cohortAuthority: authority,
      injectedOutcomes: outcomes,
      generatedAt: "2026-09-13T12:00:00.000Z",
    });
    expect(a.validationIdentityHash).toBe(b.validationIdentityHash);
    expect(a.validationIdentityHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("21. real validation data inaccessible while cohort continues", () => {
    const authority = makeReadyAuthority({
      ess: 80,
      status: "continue-collection",
    });
    const gate = authorizeMomentumValidationOutcomeAccess(authority);
    expect(gate.authorized).toBe(false);

    expect(() =>
      assertRealValidationCaptureStreamAllowed({
        authorizedForOutcomeOpen: false,
        requestRealCaptureStream: true,
      })
    ).toThrow(/ready-for-outcome-open/i);

    expect(() =>
      buildMomentumValidationReport({
        cohortAuthority: authority,
        requestRealCaptureStream: true,
        injectedOutcomes: makeWinningEpisodes(80),
      })
    ).toThrow(MomentumValidationError);

    const memoryFiles: Record<string, string> = {
      "data/live-capture/forward-quotes/holdout-run/top-of-book.jsonl": "{}",
      "data/live-capture/forward-quotes/val-run/top-of-book.jsonl": "{}",
    };
    const baseIo = {
      readFile: (path: string) => {
        const key = path.replaceAll("\\", "/");
        if (!(key in memoryFiles)) throw new Error(`missing ${path}`);
        return memoryFiles[key]!;
      },
      writeFile: () => {},
      fileExists: (path: string) => path.replaceAll("\\", "/") in memoryFiles,
      isDirectory: () => false,
      mkdirSync: () => {},
      iterateJsonl: async () => {},
    };
    const validationIo = createValidationOnlyMomentumIo({
      baseIo,
      holdoutCaptureRunDirs: ["data/live-capture/forward-quotes/holdout-run"],
    });
    expect(validationIo.fileExists("data/live-capture/forward-quotes/val-run/top-of-book.jsonl")).toBe(
      true,
    );
    expect(() =>
      validationIo.fileExists("data/live-capture/forward-quotes/holdout-run/top-of-book.jsonl")
    ).toThrow(/quarantined HOLDOUT/i);
  });

  it("underpowered-at-fixed-capture-budget → underpowered disposition without effect fields", () => {
    const authority = makeReadyAuthority({
      ess: 100,
      status: "underpowered-at-fixed-capture-budget",
    });
    const gate = authorizeMomentumValidationOutcomeAccess(authority);
    expect(gate.authorized).toBe(false);
    if (!gate.authorized) {
      expect(gate.disposition).toBe("underpowered-no-peek");
    }
    const report = buildMomentumValidationReport({
      cohortAuthority: authority,
      injectedOutcomes: makeWinningEpisodes(100),
      generatedAt: "2026-09-13T00:00:00.000Z",
    });
    expect(report.overallStatus).toBe("underpowered-for-validation");
    expect(report.outcomesOpened).toBe(false);
    expect(report.outcomeMetrics).toBeNull();
    expect(report.candidateEvaluation).toBeNull();
    expect(report.holdoutLockEligibility).toBeNull();
  });

  it("unhealthy admitted segment fails gate", () => {
    const unhealthy = makeAcceptedSegment({
      runId: "bad-health",
      unitIds: makeNUnits(155),
      healthPassed: false,
      topOfBookPresent: false,
    });
    const authority = makeReadyAuthority({ segments: [unhealthy] });
    const gate = authorizeMomentumValidationOutcomeAccess(authority);
    expect(gate.authorized).toBe(false);
    if (!gate.authorized) {
      expect(gate.disposition).toBe("invalid-evidence");
    }
  });

  it("non-shortlisted candidate throws from contract evaluator", () => {
    const authorities = bindValidationAuthorities();
    expect(() =>
      evaluateLockedCandidateOnValidation({
        lockedCandidate: authorities.lockedCandidate,
        trainDefinition: authorities.lockedCandidate,
        outcomeMetrics: computeValidationOutcomesFromEpisodes(makeWinningEpisodes(155)),
        onTrainShortlist: false,
      })
    ).toThrow(MomentumEvidenceContractError);
  });
});
