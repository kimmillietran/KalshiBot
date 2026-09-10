import { describe, expect, it } from "vitest";

import { createMemoryCalibrationFadeForwardValidationIo } from "@/lib/data/research/calibrationFadeForwardValidation";

import { buildNextFamilyReadinessReport } from "./buildNextFamilyReadinessReport";
import {
  inventoryLeadLagFamily,
  inventoryMicrostructureFamily,
  inventoryMomentumFamily,
} from "./inventoryResearchFamilies";
import {
  NEXT_FAMILY_READINESS_ANALYSIS_VERSION,
  NEXT_FAMILY_READINESS_DISCLAIMER,
  NextFamilyReadinessError,
  type FamilyInventory,
  type FamilyReadiness,
  type NextFamilyReadinessConfig,
} from "./nextFamilyReadinessTypes";
import { parseNextFamilyReadinessArgv } from "./parseNextFamilyReadinessArgv";
import {
  buildCandidateIncidenceAssessment,
  scoreFamilyReadiness,
} from "./scoreFamilyReadiness";
import { isEligibleForDiscoveryRecommendation, selectNextFamily } from "./selectNextFamily";

const LEAD_LAG_FILES = {
  "src/lib/data/research/btcKalshiLeadLagAnalysis/analyzeBtcKalshiLeadLagForRun.ts": "ok",
  "src/lib/data/research/btcKalshiLeadLagAnalysis/causalBtcJoin.ts": "ok",
  "src/lib/data/research/btcKalshiLeadLagAnalysis/classifyLeadLagInterpretation.ts": "ok",
  "scripts/research/buildBtcKalshiLeadLagAnalysis.ts": "ok",
  "src/lib/data/research/completedCandleWindowIntegrity/index.ts": "ok",
} as const;

const MICRO_FILES = {
  "src/lib/data/research/bidSizeCoverageAudit/buildBidSizeCoverageAuditReport.ts": "ok",
  "src/lib/data/research/quoteFidelityGate/buildQuoteFidelityGateReport.ts": "ok",
  "src/lib/data/research/staticParityScan/buildStaticParityScanReport.ts": "ok",
  "src/lib/data/research/executableConfirmationDesign/buildExecutableConfirmationDesignReport.ts": "ok",
} as const;

const MOMENTUM_FILES = {
  "src/lib/data/research/dimensions/momentum/momentumResearchTypes.ts": "ok",
  "src/lib/data/research/dimensions/momentum/momentumBucketDefinitions.ts": "ok",
  "src/lib/features/momentum.ts": "ok",
  "src/lib/data/strategies/plugin/builtins/simpleMomentumStrategyPlugin.ts": "ok",
} as const;

function baseConfig(
  overrides: Partial<NextFamilyReadinessConfig> = {},
): NextFamilyReadinessConfig {
  return {
    exploratoryCaptureRunDirs: [],
    fadeConfirmatoryReportPaths: [],
    exploratoryHistoricalReturnProxies: {},
    leadLagLineage: null,
    outputPath: "data/research-results/next-family-readiness/test/next-family-readiness.json",
    htmlOutputPath: "data/reports/next-family-readiness/test/next-family-readiness.html",
    ...overrides,
  };
}

function readinessFromInventory(
  inventory: FamilyInventory,
  extras?: {
    obsPerHour?: number | null;
    fields?: readonly string[];
    returnProxy?: number | null;
    fadeRate?: number | null;
  },
): FamilyReadiness {
  const incidence = buildCandidateIncidenceAssessment({
    familyId: inventory.familyId,
    fadeIndependentMarketsPerEightHours: extras?.fadeRate ?? 2.5,
    exploratoryCaptureHours: 4,
    estimatedEligibleObservationsPerCaptureHour: extras?.obsPerHour ?? null,
  });
  return scoreFamilyReadiness({
    inventory,
    incidence,
    exploratoryFieldCoverage: extras?.fields ?? ["topOfBook", "bestBid", "bestAsk", "btcSpot"],
    exploratoryHistoricalReturnProxy: extras?.returnProxy ?? null,
  });
}

describe("nextFamilyReadiness", () => {
  it("1. no available family → no-family-ready", () => {
    const io = createMemoryCalibrationFadeForwardValidationIo({});
    const report = buildNextFamilyReadinessReport({
      config: baseConfig(),
      io,
      generatedAt: "2026-09-10T00:00:00.000Z",
    });
    expect(report.selectionStatus).toBe("no-family-ready");
    expect(report.recommendedFamily).toBeNull();
    expect(report.familyReadiness.every((family) => !family.inventory.familyDefinitionAvailable)).toBe(
      true,
    );
  });

  it("2. recommendation does not simply choose largest historical return", () => {
    const io = createMemoryCalibrationFadeForwardValidationIo({
      ...LEAD_LAG_FILES,
      ...MICRO_FILES,
      ...MOMENTUM_FILES,
    });
    const leadLag = readinessFromInventory(inventoryLeadLagFamily(io), {
      returnProxy: 1,
    });
    const micro = readinessFromInventory(inventoryMicrostructureFamily(io), {
      returnProxy: 999,
    });
    const momentum = readinessFromInventory(inventoryMomentumFamily(io), {
      returnProxy: 500,
    });
    // Reverse filesystem-ish order with largest returns first.
    const selection = selectNextFamily([micro, momentum, leadLag]);
    expect(selection.recommendedFamily).toBe("btc-kalshi-lead-lag");
    expect(selection.recommendationRationale.some((line) =>
      line.includes("historical return proxies were not used")
    )).toBe(true);
    expect(micro.exploratoryHistoricalReturnProxy).toBe(999);
  });

  it("3. missing causal semantics blocks readiness", () => {
    const io = createMemoryCalibrationFadeForwardValidationIo({ ...MICRO_FILES });
    const micro = readinessFromInventory(inventoryMicrostructureFamily(io));
    const causal = micro.dimensions.find(
      (dimension) => dimension.dimension === "causalFeatureSemanticsEstablished",
    );
    expect(causal?.status).toBe("needs-definition");
    expect(isEligibleForDiscoveryRecommendation(micro)).toBe(false);
    expect(micro.blockingRequirements.some((line) => line.includes("Causal feature semantics"))).toBe(
      true,
    );
  });

  it("4. missing executable inputs is surfaced", () => {
    const io = createMemoryCalibrationFadeForwardValidationIo({ ...MOMENTUM_FILES });
    const momentum = readinessFromInventory(inventoryMomentumFamily(io), { fields: [] });
    const execution = momentum.dimensions.find(
      (dimension) => dimension.dimension === "executionObservability",
    );
    expect(execution?.status === "insufficient-evidence" || execution?.status === "not-established").toBe(
      true,
    );
    expect(
      momentum.blockingRequirements.some((line) => line.toLowerCase().includes("executable")),
    ).toBe(true);
  });

  it("5. tiny candidate incidence penalizes prospective feasibility", () => {
    const io = createMemoryCalibrationFadeForwardValidationIo({ ...LEAD_LAG_FILES });
    const leadLag = readinessFromInventory(inventoryLeadLagFamily(io), { obsPerHour: 0.05 });
    const power = leadLag.dimensions.find(
      (dimension) => dimension.dimension === "powerFeasibility",
    );
    const incidence = leadLag.dimensions.find(
      (dimension) => dimension.dimension === "prospectiveCandidateIncidence",
    );
    expect(power?.status).toBe("blocked");
    expect(incidence?.status).toBe("blocked");
    expect(isEligibleForDiscoveryRecommendation(leadLag)).toBe(false);
    expect(selectNextFamily([leadLag]).selectionStatus).toBe("no-family-ready");
  });

  it("6. exploratory captures are explicitly marked non-confirmatory", () => {
    const captureDir = "data/captures/2026-09-09T20-37-36-719Z";
    const io = createMemoryCalibrationFadeForwardValidationIo({
      ...LEAD_LAG_FILES,
      [`${captureDir}/capture-health.json`]: JSON.stringify({
        verdict: "degraded-capture",
        config: { durationSeconds: 14_400 },
        capture: { topOfBookRecordCount: 100 },
        btcSpot: { recordsCaptured: 50 },
      }),
      [`${captureDir}/top-of-book.jsonl`]: "{}\n",
      [`${captureDir}/btc-spot.jsonl`]: "{}\n",
    });
    const report = buildNextFamilyReadinessReport({
      config: baseConfig({ exploratoryCaptureRunDirs: [captureDir] }),
      io,
      generatedAt: "2026-09-10T00:00:00.000Z",
    });
    expect(report.confirmatoryReuseForbidden).toBe(true);
    expect(report.disclaimer).toBe(NEXT_FAMILY_READINESS_DISCLAIMER);
    expect(report.exploratoryDataIdentities).toHaveLength(1);
    expect(report.exploratoryDataIdentities[0]?.role).toBe(
      "exploratory-design-data-not-confirmatory",
    );
    expect(report.exploratoryDataIdentities[0]?.note).toMatch(/NOT be reused/i);
    expect(
      report.familyReadiness.every(
        (family) =>
          family.candidateIncidence.exploratoryOnly
          && family.candidateIncidence.confirmatoryReuseForbidden,
      ),
    ).toBe(true);
  });

  it("7. multiple lag/horizon search is surfaced as multiplicity", () => {
    const io = createMemoryCalibrationFadeForwardValidationIo({ ...LEAD_LAG_FILES });
    const inventory = inventoryLeadLagFamily(io);
    expect(inventory.multiplicity.returnHorizonCount).toBe(4);
    expect(inventory.multiplicity.responseWindowCount).toBe(8);
    expect(inventory.multiplicity.status).toBe("needs-work");
    expect(inventory.multiplicity.note).toMatch(/horizons/i);
    const scored = readinessFromInventory(inventory);
    expect(
      scored.dimensions.find((dimension) => dimension.dimension === "multipleTestingBurden")
        ?.status,
    ).toBe("needs-work");
  });

  it("8. missing family artifacts → not-established / needs-definition, not fabricated zero", () => {
    const io = createMemoryCalibrationFadeForwardValidationIo({});
    const micro = inventoryMicrostructureFamily(io);
    const momentum = inventoryMomentumFamily(io);
    expect(micro.familyDefinitionAvailable).toBe(false);
    expect(momentum.familyDefinitionAvailable).toBe(false);
    expect(micro.multiplicity.returnHorizonCount).toBeNull();
    expect(momentum.multiplicity.returnHorizonCount).toBeNull();
    expect(micro.maturity === "not-established" || micro.maturity === "partial").toBe(true);
    const scoredMicro = readinessFromInventory(micro, { fields: [] });
    expect(scoredMicro.dimensions.find((d) => d.dimension === "familyDefinitionAvailable")?.status)
      .toBe("needs-definition");
    expect(scoredMicro.candidateIncidence.estimatedEligibleObservationsPerCaptureHour).toBeNull();
  });

  it("9. deterministic ranking/status independent of filesystem order", () => {
    const io = createMemoryCalibrationFadeForwardValidationIo({
      ...LEAD_LAG_FILES,
      ...MICRO_FILES,
      ...MOMENTUM_FILES,
    });
    const a = [
      readinessFromInventory(inventoryMomentumFamily(io)),
      readinessFromInventory(inventoryMicrostructureFamily(io)),
      readinessFromInventory(inventoryLeadLagFamily(io)),
    ];
    const b = [...a].reverse();
    expect(selectNextFamily(a)).toEqual(selectNextFamily(b));
    const reportA = buildNextFamilyReadinessReport({
      config: baseConfig(),
      io,
      generatedAt: "2026-09-10T00:00:00.000Z",
    });
    const reportB = buildNextFamilyReadinessReport({
      config: baseConfig(),
      io,
      generatedAt: "2026-09-10T00:00:00.000Z",
    });
    expect(reportA.familyReadiness.map((f) => f.familyId)).toEqual([
      "btc-kalshi-lead-lag",
      "momentum",
      "spread-liquidity-microstructure",
    ]);
    expect(reportA.reportIdentityHash).toBe(reportB.reportIdentityHash);
    expect(reportA.recommendedFamily).toBe("btc-kalshi-lead-lag");
  });

  it("10. input artifact changes change report identity", () => {
    const captureA = "data/captures/run-a";
    const captureB = "data/captures/run-b";
    const files = {
      ...LEAD_LAG_FILES,
      [`${captureA}/capture-health.json`]: JSON.stringify({
        verdict: "ok",
        config: { durationSeconds: 3600 },
      }),
      [`${captureB}/capture-health.json`]: JSON.stringify({
        verdict: "ok",
        config: { durationSeconds: 7200 },
      }),
    };
    const io = createMemoryCalibrationFadeForwardValidationIo(files);
    const reportA = buildNextFamilyReadinessReport({
      config: baseConfig({ exploratoryCaptureRunDirs: [captureA] }),
      io,
      generatedAt: "2026-09-10T00:00:00.000Z",
    });
    const reportB = buildNextFamilyReadinessReport({
      config: baseConfig({ exploratoryCaptureRunDirs: [captureB] }),
      io,
      generatedAt: "2026-09-10T00:00:00.000Z",
    });
    expect(reportA.reportIdentityHash).not.toBe(reportB.reportIdentityHash);
  });

  it("11. no mtime/latest selection", () => {
    expect(() => parseNextFamilyReadinessArgv(["--latest"])).toThrow(NextFamilyReadinessError);
    expect(() => parseNextFamilyReadinessArgv(["--mtime"])).toThrow(NextFamilyReadinessError);
    expect(() => parseNextFamilyReadinessArgv(["--use-latest"])).toThrow(NextFamilyReadinessError);
    const config = parseNextFamilyReadinessArgv([
      "--exploratory-capture-run",
      "data/captures/explicit-run",
    ]);
    expect(config.exploratoryCaptureRunDirs).toEqual(["data/captures/explicit-run"]);
  });

  it("12. no hypothesis config/freeze is created", () => {
    const io = createMemoryCalibrationFadeForwardValidationIo({ ...LEAD_LAG_FILES });
    const report = buildNextFamilyReadinessReport({
      config: baseConfig(),
      io,
      generatedAt: "2026-09-10T00:00:00.000Z",
    });
    expect(report.analysisVersion).toBe(NEXT_FAMILY_READINESS_ANALYSIS_VERSION);
    expect(report.outputPath).toContain("next-family-readiness");
    expect(report.outputPath).not.toMatch(/hypothesis|freeze|preregistration/i);
    expect(JSON.stringify(report)).not.toMatch(/"freezeHypothesis"|hypothesis-config\.json/);
  });

  it("13. no promotion artifact is created", () => {
    const io = createMemoryCalibrationFadeForwardValidationIo({ ...LEAD_LAG_FILES });
    const report = buildNextFamilyReadinessReport({
      config: baseConfig(),
      io,
      generatedAt: "2026-09-10T00:00:00.000Z",
    });
    expect(report.selectionStatus).toBe("recommended-for-discovery");
    expect(report.outputPath).not.toMatch(/promotion/i);
    expect(report.htmlOutputPath).not.toMatch(/promotion/i);
    expect(report.recommendationRationale.some((line) => line.includes("not freeze, promotion"))).toBe(
      true,
    );
  });

  it("14. no current calibration-fade result changes", () => {
    const fadePath = "data/research-results/calibration-fade-v2/sealed.json";
    const fadeBody = JSON.stringify({ candidateMarketCount: 5, immutable: true });
    const io = createMemoryCalibrationFadeForwardValidationIo({
      ...LEAD_LAG_FILES,
      [fadePath]: fadeBody,
    });
    buildNextFamilyReadinessReport({
      config: baseConfig({ fadeConfirmatoryReportPaths: [fadePath] }),
      io,
      generatedAt: "2026-09-10T00:00:00.000Z",
    });
    expect(io.readFile(fadePath)).toBe(fadeBody);
  });
});

describe("M12.9 lead-lag disposition + family reassessment", () => {
  const DISCOVERY_ID = "a4b5fd8a50bd04207f1041846f30a4f7d9f07bf34b03ddf12e293a2278520a24";
  const VALIDATION_ID = "d87619c312e0e3e2341d98f68a7742addd623446e6fce11d9f4ea39699488fe0";
  const HOLDOUT_ID = "6d8df318342d2e8c274f43ee9c5b9259bf620266ab6c2d9716ce85d1ca288756";
  const EVIDENCE_ID = "ed60f336af8517abe536d5642b9875e8dd26dddb0eaf6db9302368f75203ae38";
  const READINESS_ID = "8cf1f72069af4a67692ae7060ebe618a9813c6bb6b38f035be3c485f52379053";
  const CANDIDATE =
    "30000|60000|5-to-10-bps|5-to-10-minutes|70-to-90-percent|reverse-btc";

  function lineageFiles(): Record<string, string> {
    const locked = {
      candidateId: CANDIDATE,
      hypothesisId: CANDIDATE,
      exactDefinition: {
        candidateId: CANDIDATE,
        hypothesisId: CANDIDATE,
        trainMedianSignedMidResponseCents: 6.75,
      },
    };
    return {
      ...LEAD_LAG_FILES,
      ...MICRO_FILES,
      ...MOMENTUM_FILES,
      "fixture/discovery.json": JSON.stringify({
        discoveryIdentityHash: DISCOVERY_ID,
        discoveryIsolationStatus: "train-only-discovery",
      }),
      "fixture/validation.json": JSON.stringify({
        validationIdentityHash: VALIDATION_ID,
        discoveryIdentity: DISCOVERY_ID,
        lockedHoldoutCandidate: locked,
        candidateResults: [
          {
            candidateId: CANDIDATE,
            hypothesisId: CANDIDATE,
            validationStatus: "validated",
            midpointResponseCents: 2,
          },
          {
            candidateId: "other-a",
            hypothesisId: "other-a",
            validationStatus: "validated",
            midpointResponseCents: 9,
          },
          {
            candidateId: "other-b",
            hypothesisId: "other-b",
            validationStatus: "validated",
            midpointResponseCents: 8,
          },
        ],
      }),
      "fixture/holdout.json": JSON.stringify({
        holdoutIdentityHash: HOLDOUT_ID,
        discoveryIdentity: DISCOVERY_ID,
        validationIdentity: VALIDATION_ID,
        evidenceContractIdentity: EVIDENCE_ID,
        lockedCandidateId: CANDIDATE,
        holdoutStatisticalVerdict: "underpowered",
        holdoutOverallStatus: "holdout-underpowered",
        recommendedNextAction: "insufficient-holdout-evidence",
        candidateMetrics: {
          effectiveSampleSize: 3,
          holdoutEffectCents: -4.5,
        },
      }),
      "fixture/readiness.json": JSON.stringify({
        readinessIdentityHash: READINESS_ID,
        requiredFreshEffectiveN: 155,
        replicationReadiness: "technically-ready-but-operationally-costly",
        decisionRequired: "capture-budget-approval",
        lineage: {
          evidenceContractIdentity: EVIDENCE_ID,
          candidateId: CANDIDATE,
        },
        operationalBurden: {
          projectedCaptureHoursPooled: 114.81481481481481,
        },
        powerContract: { requiredEffectiveN: 155 },
      }),
    };
  }

  function lineageConfig() {
    return baseConfig({
      leadLagLineage: {
        discoveryIdentityHash: DISCOVERY_ID,
        discoveryReportPath: "fixture/discovery.json",
        validationIdentityHash: VALIDATION_ID,
        validationReportPath: "fixture/validation.json",
        holdoutIdentityHash: HOLDOUT_ID,
        holdoutReportPath: "fixture/holdout.json",
        readinessIdentityHash: READINESS_ID,
        readinessReportPath: "fixture/readiness.json",
      },
    });
  }

  it("1-4. underpowered preserved; no promote/freeze; replication unauthorized", () => {
    const io = createMemoryCalibrationFadeForwardValidationIo(lineageFiles());
    const report = buildNextFamilyReadinessReport({
      config: lineageConfig(),
      io,
      generatedAt: "2026-09-10T12:00:00.000Z",
    });
    expect(report.historicalVerdict).toBe("underpowered");
    expect(report.completedLineage?.holdoutStatisticalVerdict).toBe("underpowered");
    expect(report.lineageDisposition).toBe("deferred-for-prospective-replication");
    expect(report.prospectiveReplicationStatus).toBe("available-but-not-authorized");
    expect(report.promotionForbidden).toBe(true);
    expect(report.freezeForbidden).toBe(true);
    expect(report.prospectiveCaptureStarted).toBe(false);
    expect(report.liveTradingImplemented).toBe(false);
  });

  it("5-7. candidate shopping forbidden; historical N not fresh; ESS bound", () => {
    const io = createMemoryCalibrationFadeForwardValidationIo(lineageFiles());
    const report = buildNextFamilyReadinessReport({
      config: lineageConfig(),
      io,
      generatedAt: "2026-09-10T12:00:00.000Z",
    });
    expect(report.candidateShoppingForbidden).toBe(true);
    expect(report.completedLineage?.validationSurvivorCount).toBe(3);
    expect(report.confirmatoryReuseWarning).toMatch(/cannot become fresh/i);
    expect(report.prospectiveRequiredFreshEss).toBe(155);
    expect(report.completedLineage?.prospectiveRequiredFreshEss).toBe(155);
    const leadLag = report.familyReadiness.find((f) => f.familyId === "btc-kalshi-lead-lag");
    expect(leadLag?.candidateIncidence.confirmatoryReuseForbidden).toBe(true);
  });

  it("8-9. ranking ignores return; completed investigation changes lead-lag state", () => {
    const io = createMemoryCalibrationFadeForwardValidationIo(lineageFiles());
    const report = buildNextFamilyReadinessReport({
      config: {
        ...lineageConfig(),
        exploratoryHistoricalReturnProxies: {
          "btc-kalshi-lead-lag": 999,
          "spread-liquidity-microstructure": -999,
          momentum: 500,
        },
      },
      io,
      generatedAt: "2026-09-10T12:00:00.000Z",
    });
    const leadLag = report.familyReadiness.find((f) => f.familyId === "btc-kalshi-lead-lag")!;
    expect(leadLag.maturity).toBe("empirically-investigated");
    expect(isEligibleForDiscoveryRecommendation(leadLag)).toBe(false);
    expect(report.selectionStatus).not.toBe("recommended-for-discovery");
    expect(report.recommendationRationale.some((line) => /historical return/i.test(line))).toBe(
      true,
    );
  });

  it("10-12. microstructure/momentum re-evaluated; no family forced to win discovery", () => {
    const io = createMemoryCalibrationFadeForwardValidationIo(lineageFiles());
    const report = buildNextFamilyReadinessReport({
      config: lineageConfig(),
      io,
      generatedAt: "2026-09-10T12:00:00.000Z",
    });
    const micro = report.familyReadiness.find(
      (f) => f.familyId === "spread-liquidity-microstructure",
    )!;
    const momentum = report.familyReadiness.find((f) => f.familyId === "momentum")!;
    expect(micro.inventory.microstructureDataSupport?.length).toBeGreaterThan(0);
    expect(micro.maturity).toBe("partial");
    expect(momentum.maturity).toBe("needs-definition");
    expect(isEligibleForDiscoveryRecommendation(momentum)).toBe(false);
    expect(report.selectionStatus).toBe("prepare-family-definition");
    expect(report.recommendedFamily).toBe("spread-liquidity-microstructure");
    expect(report.recommendedNextAction).toBe("prepare-family-definition");
  });

  it("13-16. deterministic identity; no latest/mtime; no capture/trading", () => {
    const io = createMemoryCalibrationFadeForwardValidationIo(lineageFiles());
    const a = buildNextFamilyReadinessReport({
      config: lineageConfig(),
      io,
      generatedAt: "2026-09-10T12:00:00.000Z",
    });
    const b = buildNextFamilyReadinessReport({
      config: lineageConfig(),
      io,
      generatedAt: "2026-09-11T12:00:00.000Z",
    });
    expect(a.reportIdentityHash).toBe(b.reportIdentityHash);
    expect(() =>
      parseNextFamilyReadinessArgv(["--bind-lead-lag-lineage", "--latest"]),
    ).toThrow(/latest\/mtime/i);
    expect(a.prospectiveCaptureStarted).toBe(false);
    expect(a.liveTradingImplemented).toBe(false);
  });
});
