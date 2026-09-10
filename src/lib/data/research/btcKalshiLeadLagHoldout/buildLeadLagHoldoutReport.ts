import { join } from "node:path";

import { stableStringify } from "@/lib/trading/config/hashConfig";
import {
  analyzeBtcKalshiLeadLagForRun,
  createBtcKalshiLeadLagAnalysisConfig,
} from "../btcKalshiLeadLagAnalysis";
import type {
  BtcKalshiLeadLagAnalysisReport,
  LeadLagEventRecord,
} from "../btcKalshiLeadLagAnalysis/btcKalshiLeadLagAnalysisTypes";
import {
  resolveRunIdFromCaptureDir,
  sha256Hex,
} from "../btcKalshiLeadLagDiscovery/buildLeadLagResearchSplitManifest";
import {
  buildLeadLagEvidenceDesignReport,
  buildDefaultLeadLagEvidenceContractConfig,
} from "../btcKalshiLeadLagEvidenceContract/buildLeadLagEvidenceDesignReport";
import {
  assertHoldoutCandidateMatchesValidationLock,
  buildLeadLagHoldoutEvidenceContract,
  hashCandidateDefinition,
} from "../btcKalshiLeadLagEvidenceContract/holdoutContract";
import { buildLeadLagExecutionSemantics } from "../btcKalshiLeadLagEvidenceContract/executionSemantics";
import { buildLeadLagMultiplicityDesign } from "../btcKalshiLeadLagEvidenceContract/multiplicityDesign";
import {
  LEAD_LAG_EVIDENCE_CONTRACT_ANALYSIS_VERSION,
} from "../btcKalshiLeadLagEvidenceContract/leadLagEvidenceContractTypes";
import {
  DEFAULT_LEAD_LAG_VALIDATION_CONTRACT,
} from "../btcKalshiLeadLagValidation/leadLagValidationTypes";

import {
  classifyHoldoutVerdict,
  computeHoldoutPowerResult,
  defaultHoldoutPowerAssumptions,
} from "./classifyHoldoutVerdict";
import { createHoldoutGatedLeadLagIo } from "./createHoldoutGatedLeadLagIo";
import {
  assertNoCandidateMutation,
  assertOnlyLockedCandidateRequested,
  assertSearchGridNotRerun,
  evaluateLockedCandidateOnHoldoutEvents,
} from "./evaluateLockedHoldoutCandidate";
import {
  assertExactlyOneLockedCandidate,
  loadDiscoveryArtifactForHoldout,
  loadValidationArtifactForHoldout,
} from "./loadHoldoutLineageArtifacts";
import {
  DEFAULT_LEAD_LAG_HOLDOUT_HTML_ROOT,
  DEFAULT_LEAD_LAG_HOLDOUT_JSON_ROOT,
  LEAD_LAG_HOLDOUT_ANALYSIS_FILENAME,
  LEAD_LAG_HOLDOUT_ANALYSIS_VERSION,
  LEAD_LAG_HOLDOUT_DISCLAIMER,
  LEAD_LAG_HOLDOUT_EVENTS_FILENAME,
  LEAD_LAG_HOLDOUT_HTML_FILENAME,
  LEAD_LAG_HOLDOUT_JSON_FILENAME,
  LeadLagHoldoutError,
  type LeadLagHoldoutConfig,
  type LeadLagHoldoutIo,
  type LeadLagHoldoutLineage,
  type LeadLagHoldoutReport,
} from "./leadLagHoldoutTypes";
import {
  serializeLeadLagHoldoutHtml,
  serializeLeadLagHoldoutReport,
} from "./serializeLeadLagHoldout";

export function resolveLeadLagHoldoutOutputPaths(input: {
  holdoutIdentityHash: string;
  outputPath?: string | null;
  htmlOutputPath?: string | null;
}): {
  outputDir: string;
  outputPath: string;
  htmlOutputPath: string;
  holdoutAnalysisOutputPath: string;
  holdoutEventsOutputPath: string;
} {
  const outputDir =
    input.outputPath != null
      ? input.outputPath.replace(/[/\\][^/\\]+$/, "")
      : join(DEFAULT_LEAD_LAG_HOLDOUT_JSON_ROOT, input.holdoutIdentityHash);
  const htmlDir =
    input.htmlOutputPath != null
      ? input.htmlOutputPath.replace(/[/\\][^/\\]+$/, "")
      : join(DEFAULT_LEAD_LAG_HOLDOUT_HTML_ROOT, input.holdoutIdentityHash);
  return {
    outputDir,
    outputPath: input.outputPath ?? join(outputDir, LEAD_LAG_HOLDOUT_JSON_FILENAME),
    htmlOutputPath:
      input.htmlOutputPath ?? join(htmlDir, LEAD_LAG_HOLDOUT_HTML_FILENAME),
    holdoutAnalysisOutputPath: join(outputDir, LEAD_LAG_HOLDOUT_ANALYSIS_FILENAME),
    holdoutEventsOutputPath: join(outputDir, LEAD_LAG_HOLDOUT_EVENTS_FILENAME),
  };
}

function parseEventLine(line: string): LeadLagEventRecord | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return JSON.parse(trimmed) as LeadLagEventRecord;
  } catch {
    return null;
  }
}

async function loadEvents(
  io: LeadLagHoldoutIo,
  eventsPath: string,
): Promise<LeadLagEventRecord[]> {
  const events: LeadLagEventRecord[] = [];
  await io.iterateJsonl(eventsPath, {
    onLine: (line) => {
      const event = parseEventLine(line);
      if (event) {
        events.push(event);
      }
      return "continue";
    },
  });
  return events;
}

function withProgressLogging(
  io: LeadLagHoldoutIo,
  log: (message: string) => void,
): LeadLagHoldoutIo {
  return {
    ...io,
    iterateJsonl: async (path, options) => {
      let lines = 0;
      const started = Date.now();
      return io.iterateJsonl(path, {
        ...options,
        onLine: (line, meta) => {
          lines += 1;
          if (lines === 1 || lines % 500_000 === 0) {
            log(
              `streaming ${path}: ${lines} lines after ${((Date.now() - started) / 1000).toFixed(1)}s`,
            );
          }
          return options.onLine(line, meta);
        },
      });
    },
  };
}

const LINEAGE: LeadLagHoldoutLineage = {
  discoveryHypothesisCount: 9600,
  validationShortlistSize: 5,
  lockedCandidateCount: 1,
  holdoutTestCount: 1,
  lineageSummary: "9600 → 5 → 1 → 1",
};

export async function buildLeadLagHoldoutReport(input: {
  io: LeadLagHoldoutIo;
  config: LeadLagHoldoutConfig;
  generatedAt?: string;
  log?: (message: string) => void;
  /** Test injection: skip analyzer and supply events/quality. */
  injectedHoldoutAnalysis?: {
    analysis: BtcKalshiLeadLagAnalysisReport;
    events: readonly LeadLagEventRecord[];
  };
}): Promise<LeadLagHoldoutReport> {
  const log = input.log ?? (() => {});
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  assertSearchGridNotRerun("locked-candidate-only");

  // --- Pre-open checklist (Run 3 must remain gated) ---
  const discovery = loadDiscoveryArtifactForHoldout({
    io: input.io,
    discoveryIdentityHash: input.config.discoveryIdentityHash,
    discoveryReportPath: input.config.discoveryReportPath,
    expectedSplitManifestHash: input.config.expectedSplitManifestHash,
  });

  const validationLoaded = loadValidationArtifactForHoldout({
    io: input.io,
    validationIdentityHash: input.config.validationIdentityHash,
    validationReportPath: input.config.validationReportPath,
    expectedDiscoveryIdentity: discovery.discoveryIdentityHash,
    expectedSplitManifestHash: discovery.splitManifestHash,
    expectedValidationContractHash: input.config.expectedValidationContractHash,
  });
  const validation = validationLoaded.report;
  const locked = assertExactlyOneLockedCandidate(validationLoaded.locked);
  const lockedCandidateDefinitionHash = validationLoaded.lockedCandidateDefinitionHash;

  assertOnlyLockedCandidateRequested({
    requestedHypothesisIds: [locked.hypothesisId],
    lockedHypothesisId: locked.hypothesisId,
  });
  assertNoCandidateMutation({
    locked: locked.exactDefinition,
    proposed: locked.exactDefinition,
  });

  const holdoutCaptureRunDir =
    input.config.holdoutCaptureRunDir
    ?? discovery.splitManifest.holdout.captureRunDir;
  const holdoutRunId = resolveRunIdFromCaptureDir(holdoutCaptureRunDir);
  if (holdoutRunId !== discovery.splitManifest.holdout.runId) {
    throw new LeadLagHoldoutError(
      `Holdout capture dir run id ${holdoutRunId} does not match split holdout `
        + discovery.splitManifest.holdout.runId,
    );
  }
  if (holdoutRunId !== validation.holdoutRunId) {
    throw new LeadLagHoldoutError(
      `Holdout run id mismatch vs validation artifact: ${holdoutRunId} vs ${validation.holdoutRunId}`,
    );
  }

  const powerDefaults = defaultHoldoutPowerAssumptions();
  const outcomeSd =
    input.config.outcomeStandardDeviationCents
    ?? powerDefaults.outcomeStandardDeviationCents;

  const evidenceContract = buildLeadLagHoldoutEvidenceContract({
    discoveryIdentity: discovery.discoveryIdentityHash,
    splitManifestHash: discovery.splitManifestHash,
    validationIdentity: validation.validationIdentityHash,
    candidateDefinitionHash: lockedCandidateDefinitionHash,
    direction: locked.exactDefinition.direction,
    alpha: powerDefaults.alpha,
    targetPower: powerDefaults.targetPower,
    materialEffectCents: powerDefaults.materialEffectThresholdCents,
    outcomeStandardDeviationCents: outcomeSd,
  });

  assertHoldoutCandidateMatchesValidationLock({
    validationLockedCandidateDefinitionHash: lockedCandidateDefinitionHash,
    holdoutCandidateDefinitionHash: evidenceContract.candidateDefinitionHash!,
  });

  // Evidence-contract design identity (candidate-agnostic scientific rules + binding).
  const evidenceDesign = buildLeadLagEvidenceDesignReport({
    config: buildDefaultLeadLagEvidenceContractConfig({
      discoveryIdentity: discovery.discoveryIdentityHash,
      splitManifestHash: discovery.splitManifestHash,
      candidateDefinitionHash: lockedCandidateDefinitionHash,
      validationIdentity: validation.validationIdentityHash,
      direction: locked.exactDefinition.direction,
      signalHorizonMs: locked.exactDefinition.btcMoveHorizonMs,
      kalshiResponseHorizonMs: locked.exactDefinition.responseWindowMs,
      alpha: powerDefaults.alpha,
      targetPower: powerDefaults.targetPower,
      materialEffectCents: powerDefaults.materialEffectThresholdCents,
      outcomeStandardDeviationCents: outcomeSd,
    }),
    generatedAt,
  });
  const evidenceContractIdentity = evidenceDesign.designIdentityHash;

  const leadLagConfig = createBtcKalshiLeadLagAnalysisConfig({
    captureRunDir: holdoutCaptureRunDir,
  });

  const holdoutIdentityHash = sha256Hex(
    stableStringify({
      analysisVersion: LEAD_LAG_HOLDOUT_ANALYSIS_VERSION,
      discoveryIdentity: discovery.discoveryIdentityHash,
      validationIdentity: validation.validationIdentityHash,
      evidenceContractIdentity,
      evidenceContractVersion: LEAD_LAG_EVIDENCE_CONTRACT_ANALYSIS_VERSION,
      splitManifestHash: discovery.splitManifestHash,
      lockedCandidateDefinitionHash,
      lockedHypothesisId: locked.hypothesisId,
      holdoutRunId,
      holdoutCaptureRunDir,
      validationContractHash: validation.validationContractHash,
      power: {
        alpha: powerDefaults.alpha,
        targetPower: powerDefaults.targetPower,
        materialEffectThresholdCents: powerDefaults.materialEffectThresholdCents,
        outcomeStandardDeviationCents: outcomeSd,
      },
      leadLagAnalysisConfiguration: {
        maximumBtcJoinAgeMs: leadLagConfig.maximumBtcJoinAgeMs,
        responseMatchToleranceMs: leadLagConfig.responseMatchToleranceMs,
        triggerCooldownMs: leadLagConfig.triggerCooldownMs,
        stalenessBoundMs: leadLagConfig.stalenessBoundMs,
      },
      executionSemanticsVersion: "one-contract-tob-observable-only",
    }),
  );

  const paths = resolveLeadLagHoldoutOutputPaths({
    holdoutIdentityHash,
    outputPath: input.config.outputPath,
    htmlOutputPath: input.config.htmlOutputPath,
  });
  leadLagConfig.eventsOutputPath = paths.holdoutEventsOutputPath;

  const gated = createHoldoutGatedLeadLagIo({
    baseIo: input.io,
    holdoutCaptureRunDir,
  });

  // Prove Run 3 is blocked before authorization.
  let blockedBeforeAuth = false;
  try {
    gated.io.fileExists(holdoutCaptureRunDir);
  } catch (error) {
    if (error instanceof LeadLagHoldoutError) {
      blockedBeforeAuth = true;
    } else {
      throw error;
    }
  }
  if (!blockedBeforeAuth && !input.injectedHoldoutAnalysis) {
    throw new LeadLagHoldoutError(
      "Holdout IO failed to gate Run 3 before lineage/contract binding.",
    );
  }

  // All identities bound — authorize holdout outcome access.
  gated.authorizeHoldoutOutcomeAccess();
  log(
    `Lineage bound; authorizing HOLDOUT analysis for locked candidate ${locked.hypothesisId}`,
  );

  const qualityFloors = {
    minValidBookShare: DEFAULT_LEAD_LAG_VALIDATION_CONTRACT.minValidBookShare,
    minBtcJoinCoverageShare: DEFAULT_LEAD_LAG_VALIDATION_CONTRACT.minBtcJoinCoverageShare,
  };

  let holdoutAnalysis: BtcKalshiLeadLagAnalysisReport;
  let events: readonly LeadLagEventRecord[];

  if (input.injectedHoldoutAnalysis) {
    holdoutAnalysis = input.injectedHoldoutAnalysis.analysis;
    events = input.injectedHoldoutAnalysis.events;
  } else {
    if (!gated.io.isDirectory(holdoutCaptureRunDir) && !gated.io.fileExists(holdoutCaptureRunDir)) {
      throw new LeadLagHoldoutError(`Missing holdout capture directory: ${holdoutCaptureRunDir}`);
    }
    const analysisIo = withProgressLogging(gated.io, log);
    log(`Running holdout-only lead-lag analysis on ${holdoutRunId}…`);
    try {
      holdoutAnalysis = await analyzeBtcKalshiLeadLagForRun({
        generatedAt,
        outputPath: paths.holdoutAnalysisOutputPath,
        htmlOutputPath: paths.htmlOutputPath.replace(
          LEAD_LAG_HOLDOUT_HTML_FILENAME,
          "holdout-selected-run-lead-lag-analysis.html",
        ),
        eventsOutputPath: paths.holdoutEventsOutputPath,
        config: leadLagConfig,
        io: analysisIo,
      });
    } catch (error) {
      throw new LeadLagHoldoutError(
        `Holdout capture analysis failed closed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    if (holdoutAnalysis.selectedRunId !== holdoutRunId) {
      throw new LeadLagHoldoutError(
        `Holdout selectedRunId ${holdoutAnalysis.selectedRunId} does not match ${holdoutRunId}`,
      );
    }
    events = await loadEvents(analysisIo, paths.holdoutEventsOutputPath);
  }

  const qualityFailureReasons: string[] = [];
  if (
    holdoutAnalysis.selectedRunQuality.validBookShare !== null
    && holdoutAnalysis.selectedRunQuality.validBookShare < qualityFloors.minValidBookShare
  ) {
    qualityFailureReasons.push(
      `validBookShare ${holdoutAnalysis.selectedRunQuality.validBookShare} `
        + `< floor ${qualityFloors.minValidBookShare}`,
    );
  }
  if (
    holdoutAnalysis.selectedRunQuality.btcJoinCoverageShare !== null
    && holdoutAnalysis.selectedRunQuality.btcJoinCoverageShare
      < qualityFloors.minBtcJoinCoverageShare
  ) {
    qualityFailureReasons.push(
      `btcJoinCoverageShare ${holdoutAnalysis.selectedRunQuality.btcJoinCoverageShare} `
        + `< floor ${qualityFloors.minBtcJoinCoverageShare}`,
    );
  }
  const qualityPassed = qualityFailureReasons.length === 0;

  const metrics = evaluateLockedCandidateOnHoldoutEvents({
    events,
    lockedDefinition: locked.exactDefinition,
  });

  // Guard: raw event count is not automatically ESS.
  if (
    metrics.rawEligibleEventCount > 0
    && metrics.effectiveSampleSize > metrics.rawEligibleEventCount
  ) {
    throw new LeadLagHoldoutError("ESS cannot exceed raw eligible event count");
  }

  const power = computeHoldoutPowerResult({
    metrics,
    alpha: powerDefaults.alpha,
    targetPower: powerDefaults.targetPower,
    materialEffectThresholdCents: powerDefaults.materialEffectThresholdCents,
    outcomeStandardDeviationCents: outcomeSd,
  });

  const classified = classifyHoldoutVerdict({
    qualityPassed,
    qualityFailureReasons,
    metrics,
    power,
  });

  const executionSemantics = buildLeadLagExecutionSemantics();
  const multiplicityDesign = buildLeadLagMultiplicityDesign();
  const durationHours =
    discovery.splitManifest.holdout.durationHours
    ?? (holdoutAnalysis.selectedRunQuality.runDurationSeconds !== null
      ? holdoutAnalysis.selectedRunQuality.runDurationSeconds / 3600
      : null);

  const promotionEligibilityNote =
    classified.recommendedNextAction === "proceed-to-promotion-evaluation"
      ? "Holdout satisfied the evidence contract; next milestone may feed M12.7c statistical "
        + "promotion gates → candidate promotion → preregistration eligibility. "
        + "This report does not create promotion/preregistration/freeze artifacts."
      : "Holdout did not satisfy the evidence contract; promotion must remain impossible.";

  const warnings = [
    ...holdoutAnalysis.warnings,
    "Exactly one validation-locked candidate was evaluated; other survivors were not scored on holdout.",
    "Discovery search grid was not rerun.",
    "No parameter retuning occurred after opening Run 3.",
    LINEAGE.lineageSummary,
  ];
  if (!qualityPassed) {
    warnings.push("Holdout failed closed on capture quality floors.");
  }

  const holdoutArtifactIdentity = sha256Hex(
    stableStringify({
      holdoutIdentityHash,
      holdoutRunId,
      recordsScanned: holdoutAnalysis.recordsScanned,
      btcRecordsScanned: holdoutAnalysis.btcRecordsScanned,
      triggerCount: holdoutAnalysis.triggerCount,
    }),
  );

  // Re-hash candidate to prove binding unchanged after evaluation.
  const postHash = hashCandidateDefinition({
    hypothesisId: locked.exactDefinition.hypothesisId,
    btcMoveHorizonMs: locked.exactDefinition.btcMoveHorizonMs,
    responseWindowMs: locked.exactDefinition.responseWindowMs,
    btcMagnitudeBin: locked.exactDefinition.btcMagnitudeBin,
    timeRemainingBin: locked.exactDefinition.timeRemainingBin,
    impliedProbabilityBin: locked.exactDefinition.impliedProbabilityBin,
    direction: locked.exactDefinition.direction,
  });
  assertHoldoutCandidateMatchesValidationLock({
    validationLockedCandidateDefinitionHash: lockedCandidateDefinitionHash,
    holdoutCandidateDefinitionHash: postHash,
  });

  const report: LeadLagHoldoutReport = {
    generatedAt,
    analysisVersion: LEAD_LAG_HOLDOUT_ANALYSIS_VERSION,
    disclaimer: LEAD_LAG_HOLDOUT_DISCLAIMER,
    discoveryIdentity: discovery.discoveryIdentityHash,
    validationIdentity: validation.validationIdentityHash,
    evidenceContractIdentity,
    evidenceContractVersion: LEAD_LAG_EVIDENCE_CONTRACT_ANALYSIS_VERSION,
    splitManifestHash: discovery.splitManifestHash,
    validationContractHash: validation.validationContractHash,
    lockedCandidateId: locked.candidateId,
    lockedCandidateDefinitionHash,
    lockedCandidate: locked,
    holdoutRunId,
    holdoutCaptureRunDir,
    holdoutArtifactIdentity,
    holdoutIdentityHash,
    lineage: LINEAGE,
    splitManifest: discovery.splitManifest,
    evidenceContract,
    executionSemantics,
    multiplicityDesign,
    captureQuality: {
      captureHealthVerdict:
        discovery.splitManifest.holdout.nativeCaptureVerdict
        ?? holdoutAnalysis.selectedRunQuality.captureVerdict,
      researchAuditVerdict:
        discovery.splitManifest.holdout.researchAuditVerdict
        ?? holdoutAnalysis.selectedRunQuality.captureVerdict,
      durationHours,
      runDurationSeconds: holdoutAnalysis.selectedRunQuality.runDurationSeconds,
      recordsScanned: holdoutAnalysis.recordsScanned,
      btcRecordsScanned: holdoutAnalysis.btcRecordsScanned,
      validBookShare: holdoutAnalysis.selectedRunQuality.validBookShare,
      btcJoinCoverageShare: holdoutAnalysis.selectedRunQuality.btcJoinCoverageShare,
      bidSizeCoverageShare: holdoutAnalysis.selectedRunQuality.bidSizeCoverageShare,
      reconnectCount: holdoutAnalysis.selectedRunQuality.reconnectCount,
      sequenceGapCount: holdoutAnalysis.selectedRunQuality.sequenceGapCount,
      captureHealthSource: holdoutAnalysis.selectedRunQuality.captureHealthSource,
      qualityFloors,
      qualityPassed,
      failureReasons: qualityFailureReasons,
    },
    candidateMetrics: {
      lockedCandidateId: locked.candidateId,
      lockedCandidateDefinitionHash,
      exactDefinition: locked.exactDefinition,
      rawEligibleEventCount: metrics.rawEligibleEventCount,
      uniqueBtcTriggerCount: metrics.uniqueBtcTriggerCount,
      independentMarketCount: metrics.independentMarketCount,
      independentMarketDayCount: metrics.independentMarketDayCount,
      effectiveSampleSize: metrics.effectiveSampleSize,
      diagnosticMidpointEffectCents: metrics.diagnosticMidpointEffectCents,
      meanMidpointEffectCents: metrics.meanMidpointEffectCents,
      primaryEstimand: "signed-yes-mid-response-cents",
      holdoutEffectCents: metrics.holdoutEffectCents,
      executableAskEffectCents: metrics.executableAskEffectCents,
      executableObservabilityShare: metrics.executableObservabilityShare,
      directionalResponseShare: metrics.directionalResponseShare,
      executionObservabilitySatisfied: classified.executionObservabilitySatisfied,
      midpointDistinctFromExecutablePnl: true,
    },
    power,
    feeAssumptions: executionSemantics.feeAssumption,
    holdoutStatisticalVerdict: classified.holdoutStatisticalVerdict,
    holdoutOverallStatus: classified.holdoutOverallStatus,
    recommendedNextAction: classified.recommendedNextAction,
    promotionEligibilityNote,
    candidatesEvaluatedCount: 1,
    otherValidationSurvivorsInspectedOnHoldout: false,
    searchGridRerun: false,
    parameterRetuningOccurred: false,
    quarantine: {
      promotionArtifactCreated: false,
      preregistrationArtifactCreated: false,
      frozenHypothesisCreated: false,
      captureStarted: false,
      liveOrdersExecuted: false,
    },
    outputPaths: {
      outputPath: paths.outputPath,
      htmlOutputPath: paths.htmlOutputPath,
      holdoutAnalysisOutputPath: paths.holdoutAnalysisOutputPath,
      holdoutEventsOutputPath: paths.holdoutEventsOutputPath,
    },
    warnings: [...warnings, ...classified.rationale],
  };

  input.io.mkdirSync(paths.outputDir, { recursive: true });
  if (!input.injectedHoldoutAnalysis) {
    input.io.writeFile(
      paths.holdoutAnalysisOutputPath,
      `${stableStringify(holdoutAnalysis)}\n`,
    );
  }
  input.io.writeFile(paths.outputPath, serializeLeadLagHoldoutReport(report));
  input.io.mkdirSync(paths.htmlOutputPath.replace(/[/\\][^/\\]+$/, ""), { recursive: true });
  input.io.writeFile(paths.htmlOutputPath, serializeLeadLagHoldoutHtml(report));
  log(`Wrote lead-lag holdout artifact ${paths.outputPath}`);
  return report;
}
