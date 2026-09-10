import { createHash } from "node:crypto";
import { join } from "node:path";

import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  KNOWN_LEAD_LAG_HOLDOUT_RUN_ID,
  KNOWN_LEAD_LAG_TRAIN_RUN_ID,
  KNOWN_LEAD_LAG_VALIDATION_RUN_ID,
} from "../btcKalshiLeadLagEvidenceContract/leadLagEvidenceContractTypes";
import { rejectOptionalStoppingWithoutSequentialDesign } from "../btcKalshiLeadLagEvidenceContract/stoppingRules";
import type { LeadLagGovernedDiscoveryReport } from "../btcKalshiLeadLagDiscovery/leadLagDiscoveryTypes";
import type { LeadLagHoldoutReport } from "../btcKalshiLeadLagHoldout/leadLagHoldoutTypes";
import type { LeadLagValidationReport } from "../btcKalshiLeadLagValidation/leadLagValidationTypes";

import {
  buildCaptureHourScenarios,
  buildIncidenceRateScenarios,
  buildIncidenceRow,
  buildProjectedHoursToRequiredN,
  ratePerHour,
} from "./incidencePlanning";
import type { LoadedReplicationLineage } from "./loadReplicationLineageArtifacts";
import {
  DEFAULT_LEAD_LAG_REPLICATION_READINESS_HTML_ROOT,
  DEFAULT_LEAD_LAG_REPLICATION_READINESS_JSON_ROOT,
  LEAD_LAG_REPLICATION_READINESS_ANALYSIS_VERSION,
  LEAD_LAG_REPLICATION_READINESS_DISCLAIMER,
  LEAD_LAG_REPLICATION_READINESS_HTML_FILENAME,
  LEAD_LAG_REPLICATION_READINESS_JSON_FILENAME,
  LEAD_LAG_REPLICATION_READINESS_PLANNING_METHODOLOGY_VERSION,
  LeadLagReplicationReadinessError,
  type LeadLagHistoricalIncidenceByRun,
  type LeadLagReplicationReadinessReport,
  type LeadLagStorageEstimate,
} from "./leadLagReplicationReadinessTypes";

function sha256Hex(payload: string): string {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

export function resolveLeadLagReplicationReadinessOutputPaths(input: {
  readinessIdentityHash: string;
  outputPath: string | null;
  htmlOutputPath: string | null;
}): { outputPath: string; htmlOutputPath: string } {
  return {
    outputPath:
      input.outputPath
      ?? join(
        DEFAULT_LEAD_LAG_REPLICATION_READINESS_JSON_ROOT,
        input.readinessIdentityHash,
        LEAD_LAG_REPLICATION_READINESS_JSON_FILENAME,
      ),
    htmlOutputPath:
      input.htmlOutputPath
      ?? join(
        DEFAULT_LEAD_LAG_REPLICATION_READINESS_HTML_ROOT,
        input.readinessIdentityHash,
        LEAD_LAG_REPLICATION_READINESS_HTML_FILENAME,
      ),
  };
}

function findLockedDiscoveryCandidate(
  discovery: LeadLagGovernedDiscoveryReport,
  candidateId: string,
) {
  const shortlist = discovery.candidates;
  if (!Array.isArray(shortlist) || shortlist.length === 0) {
    throw new LeadLagReplicationReadinessError("Discovery artifact missing candidates shortlist");
  }
  const match = shortlist.find(
    (row) => row.hypothesisId === candidateId || row.cellId === candidateId,
  );
  if (match == null) {
    throw new LeadLagReplicationReadinessError(
      `Locked candidate ${candidateId} not found in discovery candidates`,
    );
  }
  return match;
}

function findLockedValidationCandidate(
  validation: LeadLagValidationReport,
  candidateId: string,
) {
  const match = validation.candidateResults.find(
    (row) => row.candidateId === candidateId || row.hypothesisId === candidateId,
  );
  if (match == null) {
    throw new LeadLagReplicationReadinessError(
      `Locked candidate ${candidateId} not found in validation candidateResults`,
    );
  }
  return match;
}

export function extractHistoricalIncidence(input: {
  discovery: LeadLagGovernedDiscoveryReport;
  validation: LeadLagValidationReport;
  holdout: LeadLagHoldoutReport;
}): readonly LeadLagHistoricalIncidenceByRun[] {
  const candidateId = input.holdout.lockedCandidateId;
  const train = findLockedDiscoveryCandidate(input.discovery, candidateId);
  const validationCandidate = findLockedValidationCandidate(input.validation, candidateId);
  const holdoutMetrics = input.holdout.candidateMetrics;

  const trainHours =
    input.discovery.incidence?.trainCaptureHours
    ?? input.discovery.splitManifest?.train?.durationHours
    ?? 8;
  const validationHours =
    input.validation.incidence?.validationCaptureHours
    ?? input.validation.splitManifest?.validation?.durationHours
    ?? 8;
  const holdoutHours = input.holdout.captureQuality.durationHours ?? 4;

  return [
    buildIncidenceRow({
      runLabel: "run-1-train",
      runId: KNOWN_LEAD_LAG_TRAIN_RUN_ID,
      role: "train-discovery-design",
      captureHours: trainHours,
      eligibleCandidateEvents: train.eligibleMarketTriggerCount,
      uniqueMarkets: train.independentMarketCount,
      uniqueMarketDays: train.independentMarketDayCount,
      uniqueBtcTriggers: train.uniqueBtcTriggerCount,
    }),
    buildIncidenceRow({
      runLabel: "run-2-validation",
      runId: KNOWN_LEAD_LAG_VALIDATION_RUN_ID,
      role: "validation-narrowing-design",
      captureHours: validationHours,
      eligibleCandidateEvents: validationCandidate.validationEventCount,
      uniqueMarkets: validationCandidate.independentMarketCount,
      uniqueMarketDays: validationCandidate.independentMarketDayCount,
      uniqueBtcTriggers: validationCandidate.uniqueBtcTriggerCount,
    }),
    buildIncidenceRow({
      runLabel: "run-3-holdout",
      runId: KNOWN_LEAD_LAG_HOLDOUT_RUN_ID,
      role: "historical-holdout-design",
      captureHours: holdoutHours,
      eligibleCandidateEvents: holdoutMetrics.rawEligibleEventCount,
      uniqueMarkets: holdoutMetrics.independentMarketCount,
      uniqueMarketDays: holdoutMetrics.independentMarketDayCount,
      uniqueBtcTriggers: holdoutMetrics.uniqueBtcTriggerCount,
      effectiveSampleSizeOverride: holdoutMetrics.effectiveSampleSize,
      observedPrimaryEffectCents: holdoutMetrics.holdoutEffectCents,
    }),
  ];
}

export function estimateStorageRequirement(input: {
  incidence: readonly LeadLagHistoricalIncidenceByRun[];
  observedBytesByRun: readonly {
    runId: string;
    observedBytes: number | null;
  }[];
  projectedHours: ReturnType<typeof buildProjectedHoursToRequiredN>;
}): LeadLagStorageEstimate {
  const observed = input.incidence.map((row) => {
    const match = input.observedBytesByRun.find((entry) => entry.runId === row.runId);
    const observedBytes = match?.observedBytes ?? null;
    const bytesPerHour =
      observedBytes != null ? ratePerHour(observedBytes, row.captureHours) : null;
    return {
      runId: row.runId,
      captureHours: row.captureHours,
      observedBytes,
      bytesPerHour,
      source: observedBytes != null ? ("du-metadata" as const) : ("unavailable" as const),
    };
  });

  const finiteRates = observed
    .map((row) => row.bytesPerHour)
    .filter((rate): rate is number => rate != null && Number.isFinite(rate) && rate > 0);
  const pooledBytesPerHour =
    finiteRates.length > 0
      ? finiteRates.reduce((sum, rate) => sum + rate, 0) / finiteRates.length
      : null;

  const projectBytes = (hours: number | null): number | null => {
    if (hours == null || pooledBytesPerHour == null) {
      return null;
    }
    return hours * pooledBytesPerHour;
  };

  return {
    observedBytesByRun: observed,
    pooledBytesPerHour,
    projectedBytesToRequiredN: {
      lowRate: projectBytes(input.projectedHours.lowRate.projectedCaptureHours),
      pooledRate: projectBytes(input.projectedHours.pooledRate.projectedCaptureHours),
      highRate: projectBytes(input.projectedHours.highRate.projectedCaptureHours),
    },
    extrapolationNote:
      "Storage projections multiply observed GB/hour by projected capture hours. "
      + "Labelled as extrapolation from Runs 1–3 du metadata; not a precise capacity reservation.",
  };
}

export function recommendFixedNStoppingRule(requiredEffectiveN: number) {
  return {
    kind: "fixed-n" as const,
    minimumEffectiveSampleSize: requiredEffectiveN,
    interpretationIfNotReached: "inconclusive-underpowered" as const,
  };
}

export function classifyReplicationReadiness(input: {
  requiredFreshEffectiveN: number;
  projectedHoursPooled: number | null;
  lineageIntact: boolean;
}): {
  replicationReadiness: LeadLagReplicationReadinessReport["replicationReadiness"];
  decisionRequired: LeadLagReplicationReadinessReport["decisionRequired"];
  recommendedNextAction: LeadLagReplicationReadinessReport["recommendedNextAction"];
} {
  if (!input.lineageIntact) {
    return {
      replicationReadiness: "blocked",
      decisionRequired: "lineage-repair",
      recommendedNextAction: "do-not-proceed-blocked",
    };
  }
  // Tooling is ready; capture burden requires human budget approval rather than
  // an autonomous accept/reject of hour counts.
  if (
    input.projectedHoursPooled != null
    && Number.isFinite(input.projectedHoursPooled)
    && input.projectedHoursPooled > 0
    && input.requiredFreshEffectiveN > 0
  ) {
    return {
      replicationReadiness: "technically-ready-but-operationally-costly",
      decisionRequired: "capture-budget-approval",
      recommendedNextAction: "proceed-to-m12.8e-freeze-after-budget-approval",
    };
  }
  return {
    replicationReadiness: "blocked",
    decisionRequired: "lineage-repair",
    recommendedNextAction: "do-not-proceed-blocked",
  };
}

export function buildLeadLagReplicationReadinessReport(input: {
  lineage: LoadedReplicationLineage;
  observedBytesByRun?: readonly { runId: string; observedBytes: number | null }[];
  generatedAt?: string;
  outputPath?: string | null;
  htmlOutputPath?: string | null;
  planningMethodologyVersion?: string;
}): LeadLagReplicationReadinessReport {
  const { discovery, validation, holdout, lockedCandidateDefinitionHash } = input.lineage;
  const locked = validation.lockedHoldoutCandidate!;
  const power = holdout.power;

  if (power.requiredEvidence == null || power.requiredEvidence !== 155) {
    throw new LeadLagReplicationReadinessError(
      `Required effective N must remain 155 under unchanged contract; got ${power.requiredEvidence}`,
    );
  }
  if (power.alpha !== 0.05 || power.targetPower !== 0.8 || power.materialEffectThresholdCents !== 2) {
    throw new LeadLagReplicationReadinessError(
      "Power contract constants must match holdout-bound alpha=0.05, power=0.8, MDE=2¢",
    );
  }

  const optionalStopping = rejectOptionalStoppingWithoutSequentialDesign({
    kind: "optional-stopping",
  });
  if (optionalStopping.valid) {
    throw new LeadLagReplicationReadinessError("optional stopping must be rejected");
  }

  const recommendedStoppingRule = recommendFixedNStoppingRule(power.requiredEvidence);
  const incidence = extractHistoricalIncidence({ discovery, validation, holdout });
  const scenarios = buildIncidenceRateScenarios(incidence);
  const projectedHoursToRequiredN = buildProjectedHoursToRequiredN({
    requiredFreshEffectiveN: power.requiredEvidence,
    scenarios,
  });
  const captureHourScenarios = buildCaptureHourScenarios({ scenarios });
  const storage = estimateStorageRequirement({
    incidence,
    observedBytesByRun: input.observedBytesByRun ?? [],
    projectedHours: projectedHoursToRequiredN,
  });

  const totalHours = incidence.reduce((sum, row) => sum + row.captureHours, 0);
  const totalEss = incidence.reduce((sum, row) => sum + row.effectiveSampleSize, 0);
  const totalEvents = incidence.reduce((sum, row) => sum + row.eligibleCandidateEvents, 0);
  const essRates = incidence.map((row) => row.essPerHour);
  const minEss = Math.min(...essRates);
  const maxEss = Math.max(...essRates);

  const planningMethodologyVersion =
    input.planningMethodologyVersion ?? LEAD_LAG_REPLICATION_READINESS_PLANNING_METHODOLOGY_VERSION;

  const identityPayload = {
    analysisVersion: LEAD_LAG_REPLICATION_READINESS_ANALYSIS_VERSION,
    planningMethodologyVersion,
    discoveryIdentity: discovery.discoveryIdentityHash,
    validationIdentity: validation.validationIdentityHash,
    holdoutIdentity: holdout.holdoutIdentityHash,
    evidenceContractIdentity: holdout.evidenceContractIdentity,
    candidateId: locked.candidateId,
    lockedCandidateDefinitionHash,
    powerContract: {
      alpha: power.alpha,
      targetPower: power.targetPower,
      materialEffectThresholdCents: power.materialEffectThresholdCents,
      outcomeStandardDeviationCents: power.outcomeStandardDeviationCents,
      requiredEffectiveN: power.requiredEvidence,
    },
    historicalIncidenceInputs: incidence.map((row) => ({
      runId: row.runId,
      captureHours: row.captureHours,
      eligibleCandidateEvents: row.eligibleCandidateEvents,
      uniqueMarkets: row.uniqueMarkets,
      uniqueMarketDays: row.uniqueMarketDays,
      uniqueBtcTriggers: row.uniqueBtcTriggers,
      effectiveSampleSize: row.effectiveSampleSize,
    })),
  };
  const readinessIdentityHash = sha256Hex(stableStringify(identityPayload));
  const outputs = resolveLeadLagReplicationReadinessOutputPaths({
    readinessIdentityHash,
    outputPath: input.outputPath ?? null,
    htmlOutputPath: input.htmlOutputPath ?? null,
  });

  const classification = classifyReplicationReadiness({
    requiredFreshEffectiveN: power.requiredEvidence,
    projectedHoursPooled: projectedHoursToRequiredN.pooledRate.projectedCaptureHours,
    lineageIntact: true,
  });

  const priorEffect = holdout.candidateMetrics.holdoutEffectCents;
  if (priorEffect == null) {
    throw new LeadLagReplicationReadinessError("Holdout primary effect cents missing");
  }

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    analysisVersion: LEAD_LAG_REPLICATION_READINESS_ANALYSIS_VERSION,
    planningMethodologyVersion,

    disclaimer: LEAD_LAG_REPLICATION_READINESS_DISCLAIMER,
    readinessIdentityHash,
    lineage: {
      discoveryIdentity: discovery.discoveryIdentityHash,
      validationIdentity: validation.validationIdentityHash,
      holdoutIdentity: holdout.holdoutIdentityHash,
      evidenceContractIdentity: holdout.evidenceContractIdentity,
      candidateId: locked.candidateId,
      lockedCandidateDefinitionHash,
      splitManifestHash: discovery.splitManifestHash,
    },
    lockedCandidate: locked.exactDefinition,
    currentStatus: "holdout-underpowered",
    powerContract: {
      alpha: power.alpha,
      targetPower: power.targetPower,
      materialEffectThresholdCents: power.materialEffectThresholdCents,
      outcomeStandardDeviationCents: power.outcomeStandardDeviationCents,
      requiredEffectiveN: power.requiredEvidence,
      contractSource: "holdout-bound-evidence-contract",
      mdeRelaxed: false,
      alphaRelaxed: false,
      powerTargetRelaxed: false,
    },
    requiredFreshEffectiveN: power.requiredEvidence,
    freshProspectiveEffectiveNStartsAt: 0,
    confirmatoryReuseForbiddenForHistoricalRuns: true,
    historicalIncidenceByRun: incidence,
    pooledIncidence: {
      totalCaptureHours: totalHours,
      totalEffectiveSampleSize: totalEss,
      pooledEssPerHour: ratePerHour(totalEss, totalHours),
      totalEligibleEvents: totalEvents,
      note:
        "Pooled ESS is design/incidence planning only. It does not credit historical runs as fresh prospective N.",
    },
    incidenceVariability: {
      essPerHourByRun: essRates,
      minEssPerHour: minEss,
      maxEssPerHour: maxEss,
      rangeEssPerHour: maxEss - minEss,
      heterogeneous: maxEss - minEss > 0,
      assessment:
        "Candidate-specific ESS/hour varied materially across Runs 1–3 "
        + `(min=${minEss.toFixed(3)}, max=${maxEss.toFixed(3)}, range=${(maxEss - minEss).toFixed(3)}). `
        + "Three runs do not establish a precise stationary arrival process.",
      forbiddenOptimization: "sampling-only-where-signal-historically-looked-profitable",
      allowedOptimization:
        "sampling-where-markets-or-triggers-exist-if-rule-independent-of-outcome-sign",
    },
    incidenceRateScenarios: scenarios,
    captureHourScenarios,
    projectedHoursToRequiredN,
    estimatedStorageRequirement: storage,
    recommendedStoppingRule,
    optionalStoppingRejected: true,
    priorHoldoutContext: {
      holdoutIdentity: holdout.holdoutIdentityHash,
      holdoutStatisticalVerdict: "underpowered",
      holdoutOverallStatus: "holdout-underpowered",
      recommendedNextActionFromHoldout: "insufficient-holdout-evidence",
      observedPrimaryEffectCents: priorEffect,
      executableAskEffectCents: holdout.candidateMetrics.executableAskEffectCents ?? priorEffect,
      effectiveSampleSize: holdout.candidateMetrics.effectiveSampleSize,
      interpretation:
        "historical-evidence-inconclusive-underpowered-with-unfavorable-tiny-sample-point-estimate",
      relabeledAsReject: false,
      relabeledAsSupport: false,
    },
    technicalCaptureReadiness: {
      multiRunCaptureIdentity: "available-via-runId-dirs",
      runAggregationPattern: "identity-addressed-cohort-hash-required-at-freeze",
      captureHealthAudit: "available",
      candidateEvaluationMachinery: "available-locked-candidate-only",
      exactRunSetIdentityPrecedent: "calibrationFadeV2CrossRunValidation.runSetHash",
      restartGate: "available",
      settlementRequiredForPrimaryEstimand: false,
      settlementNote:
        "Primary estimand is signed-yes-mid-response-cents over causal BTC/quote join; "
        + "settlement is not required for this association estimand.",
      boundedMemoryProcessing: "streaming-jsonl-analysis-available",
      ready: true,
    },
    operationalBurden: {
      projectedCaptureHoursPooled:
        projectedHoursToRequiredN.pooledRate.projectedCaptureHours,
      projectedEightHourRunsPooled:
        projectedHoursToRequiredN.pooledRate.projectedEightHourRuns,
      projectedStorageGiBPooled:
        storage.projectedBytesToRequiredN.pooledRate != null
          ? storage.projectedBytesToRequiredN.pooledRate / (1024 ** 3)
          : null,
      processingNote:
        "Prospective cohort should accumulate via explicit run-set identity (sorted runIds + content "
        + "hashes), never latest/mtime selection. Reuse capture health + restart gates; evaluate only "
        + "the locked candidate under the fixed-N stopping rule after freeze (M12.8e).",
      burdenClass: "material-multi-session-capture",
    },
    replicationReadiness: classification.replicationReadiness,
    decisionRequired: classification.decisionRequired,
    recommendedNextAction: classification.recommendedNextAction,
    quarantine: {
      promotionArtifactCreated: false,
      preregistrationArtifactCreated: false,
      frozenHypothesisCreated: false,
      captureStarted: false,
      liveOrdersExecuted: false,
      alternateCandidateEvaluated: false,
      historicalVerdictAltered: false,
      historicalNCountedAsFreshEvidence: false,
    },
    outputPaths: outputs,
    warnings: [
      ...holdout.warnings,
      "Historical Runs 1–3 are outcome-inspected and cannot count toward fresh prospective ESS.",
      "Projected hours/storage are planning scenarios, not inferential evidence.",
    ],
  };
}
