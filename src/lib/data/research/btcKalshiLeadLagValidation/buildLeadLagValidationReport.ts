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
import { computeTrainIncidenceFromEvents } from "../btcKalshiLeadLagDiscovery/aggregateLeadLagDiscoveryCells";

import { createValidationOnlyLeadLagIo } from "./createValidationOnlyLeadLagIo";
import {
  evaluateFrozenCandidatesOnValidationEvents,
  lockHoldoutCandidateFromSurvivors,
} from "./evaluateLeadLagValidationCandidates";
import {
  hashValidationContract,
  loadLeadLagDiscoveryReportForValidation,
} from "./loadDiscoveryForValidation";
import {
  DEFAULT_LEAD_LAG_VALIDATION_CONTRACT,
  DEFAULT_LEAD_LAG_VALIDATION_HTML_ROOT,
  DEFAULT_LEAD_LAG_VALIDATION_JSON_ROOT,
  LEAD_LAG_VALIDATION_ANALYSIS_FILENAME,
  LEAD_LAG_VALIDATION_ANALYSIS_VERSION,
  LEAD_LAG_VALIDATION_DISCLAIMER,
  LEAD_LAG_VALIDATION_EVENTS_FILENAME,
  LEAD_LAG_VALIDATION_HTML_FILENAME,
  LEAD_LAG_VALIDATION_JSON_FILENAME,
  LeadLagValidationError,
  type LeadLagValidationContract,
  type LeadLagValidationIo,
  type LeadLagValidationOverallStatus,
  type LeadLagValidationReport,
} from "./leadLagValidationTypes";

export function resolveLeadLagValidationOutputPaths(input: {
  validationIdentityHash: string;
  outputPath?: string | null;
  htmlOutputPath?: string | null;
}): {
  outputDir: string;
  outputPath: string;
  htmlOutputPath: string;
  validationAnalysisOutputPath: string;
  validationEventsOutputPath: string;
} {
  const outputDir =
    input.outputPath != null
      ? input.outputPath.replace(/[/\\][^/\\]+$/, "")
      : join(DEFAULT_LEAD_LAG_VALIDATION_JSON_ROOT, input.validationIdentityHash);
  const htmlDir =
    input.htmlOutputPath != null
      ? input.htmlOutputPath.replace(/[/\\][^/\\]+$/, "")
      : join(DEFAULT_LEAD_LAG_VALIDATION_HTML_ROOT, input.validationIdentityHash);

  return {
    outputDir,
    outputPath: input.outputPath ?? join(outputDir, LEAD_LAG_VALIDATION_JSON_FILENAME),
    htmlOutputPath:
      input.htmlOutputPath ?? join(htmlDir, LEAD_LAG_VALIDATION_HTML_FILENAME),
    validationAnalysisOutputPath: join(outputDir, LEAD_LAG_VALIDATION_ANALYSIS_FILENAME),
    validationEventsOutputPath: join(outputDir, LEAD_LAG_VALIDATION_EVENTS_FILENAME),
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
  io: LeadLagValidationIo,
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
  io: LeadLagValidationIo,
  log: (message: string) => void,
): LeadLagValidationIo {
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

export async function buildLeadLagValidationReport(input: {
  io: LeadLagValidationIo;
  discoveryIdentityHash: string;
  discoveryReportPath?: string | null;
  expectedSplitManifestHash?: string | null;
  validationCaptureRunDir?: string | null;
  holdoutCaptureRunDir?: string | null;
  contract?: LeadLagValidationContract;
  generatedAt?: string;
  outputPath?: string | null;
  htmlOutputPath?: string | null;
  log?: (message: string) => void;
}): Promise<LeadLagValidationReport> {
  const log = input.log ?? (() => {});
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const contract = input.contract ?? DEFAULT_LEAD_LAG_VALIDATION_CONTRACT;
  const validationContractHash = hashValidationContract(contract);

  const loaded = loadLeadLagDiscoveryReportForValidation({
    io: input.io,
    discoveryIdentityHash: input.discoveryIdentityHash,
    discoveryReportPath: input.discoveryReportPath,
    expectedSplitManifestHash: input.expectedSplitManifestHash,
  });
  const discovery = loaded.report;
  const frozenCandidates = loaded.frozenCandidates;

  const validationCaptureRunDir =
    input.validationCaptureRunDir
    ?? discovery.splitManifest.validation.captureRunDir;
  const holdoutCaptureRunDir =
    input.holdoutCaptureRunDir
    ?? discovery.splitManifest.holdout.captureRunDir;

  if (resolveRunIdFromCaptureDir(validationCaptureRunDir) !== discovery.splitManifest.validation.runId) {
    throw new LeadLagValidationError(
      `Validation capture dir run id does not match split validation run `
        + discovery.splitManifest.validation.runId,
    );
  }

  // Identity binds discovery + split + validation run identity + frozen candidates + contract + analysis config.
  const leadLagConfig = createBtcKalshiLeadLagAnalysisConfig({
    captureRunDir: validationCaptureRunDir,
  });

  const validationIdentityHash = sha256Hex(
    stableStringify({
      analysisVersion: LEAD_LAG_VALIDATION_ANALYSIS_VERSION,
      discoveryIdentityHash: discovery.discoveryIdentityHash,
      splitManifestHash: discovery.splitManifestHash,
      validationRunId: discovery.splitManifest.validation.runId,
      validationCaptureRunDir,
      frozenCandidateHypothesisIds: frozenCandidates.map((c) => c.hypothesisId),
      frozenCandidateDefinitions: frozenCandidates,
      validationContractHash,
      leadLagAnalysisConfiguration: {
        maximumBtcJoinAgeMs: leadLagConfig.maximumBtcJoinAgeMs,
        responseMatchToleranceMs: leadLagConfig.responseMatchToleranceMs,
        triggerCooldownMs: leadLagConfig.triggerCooldownMs,
        stalenessBoundMs: leadLagConfig.stalenessBoundMs,
      },
    }),
  );

  const paths = resolveLeadLagValidationOutputPaths({
    validationIdentityHash,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
  });
  leadLagConfig.eventsOutputPath = paths.validationEventsOutputPath;

  const validationIo = withProgressLogging(
    createValidationOnlyLeadLagIo({
      baseIo: input.io,
      validationCaptureRunDir,
      holdoutCaptureRunDir,
    }),
    log,
  );

  // Prove holdout quarantine.
  let holdoutBlocked = false;
  try {
    validationIo.fileExists(holdoutCaptureRunDir);
  } catch (error) {
    if (error instanceof LeadLagValidationError) {
      holdoutBlocked = true;
    } else {
      throw error;
    }
  }
  if (!holdoutBlocked) {
    throw new LeadLagValidationError("Validation IO failed to quarantine HOLDOUT capture directory.");
  }

  if (!input.io.isDirectory(validationCaptureRunDir) && !input.io.fileExists(validationCaptureRunDir)) {
    throw new LeadLagValidationError(
      `Missing validation capture directory: ${validationCaptureRunDir}`,
    );
  }

  log(`Running validation-only lead-lag analysis on ${discovery.splitManifest.validation.runId}…`);

  let validationAnalysis: BtcKalshiLeadLagAnalysisReport;
  try {
    validationAnalysis = await analyzeBtcKalshiLeadLagForRun({
      generatedAt,
      outputPath: paths.validationAnalysisOutputPath,
      htmlOutputPath: paths.htmlOutputPath.replace(
        LEAD_LAG_VALIDATION_HTML_FILENAME,
        "validation-selected-run-lead-lag-analysis.html",
      ),
      eventsOutputPath: paths.validationEventsOutputPath,
      config: leadLagConfig,
      io: validationIo,
    });
  } catch (error) {
    throw new LeadLagValidationError(
      `Validation capture analysis failed closed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (validationAnalysis.selectedRunId !== discovery.splitManifest.validation.runId) {
    throw new LeadLagValidationError(
      `Validation selectedRunId ${validationAnalysis.selectedRunId} does not match split validation `
        + discovery.splitManifest.validation.runId,
    );
  }

  const qualityFailed =
    (validationAnalysis.selectedRunQuality.validBookShare !== null
      && validationAnalysis.selectedRunQuality.validBookShare < contract.minValidBookShare)
    || (validationAnalysis.selectedRunQuality.btcJoinCoverageShare !== null
      && validationAnalysis.selectedRunQuality.btcJoinCoverageShare
        < contract.minBtcJoinCoverageShare);

  log(`Evaluating ${frozenCandidates.length} frozen discovery candidates on validation events…`);
  const events = await loadEvents(validationIo, paths.validationEventsOutputPath);
  let candidateResults = evaluateFrozenCandidatesOnValidationEvents({
    events,
    frozenCandidates,
    discoveryIdentityHash: discovery.discoveryIdentityHash,
    contract,
  });

  if (qualityFailed) {
    candidateResults = candidateResults.map((result) => ({
      ...result,
      validationStatus: "invalid-evidence" as const,
      rationale: [
        ...result.rationale,
        `Validation capture quality below floors `
          + `(validBookShare=${validationAnalysis.selectedRunQuality.validBookShare}, `
          + `btcJoinCoverageShare=${validationAnalysis.selectedRunQuality.btcJoinCoverageShare}).`,
      ],
    }));
  }

  const survivors = candidateResults.filter((result) => result.validationStatus === "validated");
  const locked = qualityFailed ? null : lockHoldoutCandidateFromSurvivors({ survivors });

  let validationOverallStatus: LeadLagValidationOverallStatus;
  if (qualityFailed) {
    validationOverallStatus = "invalid-validation-run";
  } else if (locked) {
    validationOverallStatus = "one-candidate-locked-for-holdout";
  } else {
    validationOverallStatus = "no-candidate-survived";
  }

  const validationHours =
    discovery.splitManifest.validation.durationHours
    ?? (validationAnalysis.selectedRunQuality.runDurationSeconds !== null
      ? validationAnalysis.selectedRunQuality.runDurationSeconds / 3600
      : null);

  const incidenceBase = computeTrainIncidenceFromEvents({
    events,
    btcTriggerCount: validationAnalysis.triggerCount,
    recordsScanned: validationAnalysis.recordsScanned,
    btcRecordsScanned: validationAnalysis.btcRecordsScanned,
    trainCaptureHours: validationHours,
    suppressedOverlappingTriggerCount: validationAnalysis.suppressedOverlappingTriggerCount,
  });

  const warnings = [
    ...validationAnalysis.warnings,
    "HOLDOUT lead-lag outcomes were never accessed.",
    "Candidate definitions were frozen from discovery; no validation-time retuning occurred.",
    "This report does not claim final OOS significance, BY-FDR pass, promotion, or preregistration eligibility.",
  ];
  if (qualityFailed) {
    warnings.push("Validation run failed closed on capture quality floors.");
  }

  const report: LeadLagValidationReport = {
    generatedAt,
    analysisVersion: LEAD_LAG_VALIDATION_ANALYSIS_VERSION,
    disclaimer: LEAD_LAG_VALIDATION_DISCLAIMER,
    discoveryIdentity: discovery.discoveryIdentityHash,
    discoveryAnalysisVersion: discovery.analysisVersion,
    discoveryIsolationStatus: discovery.discoveryIsolationStatus,
    discoveryHypothesisCount: discovery.searchUniverse.hypothesisCount,
    discoveryMultiplicityDeclaration: discovery.multiplicityDeclaration,
    splitManifestHash: discovery.splitManifestHash,
    splitManifest: discovery.splitManifest,
    validationContract: contract,
    validationContractHash,
    validationIdentityHash,
    validationRunId: discovery.splitManifest.validation.runId,
    validationCaptureRunDir,
    validationArtifactIdentity: {
      captureRunId: validationAnalysis.selectedRunQuality.selectedRunId,
      identityHash: discovery.splitManifest.validation.identityHash,
      nativeCaptureVerdict: discovery.splitManifest.validation.nativeCaptureVerdict,
      researchAuditVerdict:
        discovery.splitManifest.validation.researchAuditVerdict
        ?? validationAnalysis.selectedRunQuality.captureVerdict,
      validBookShare: validationAnalysis.selectedRunQuality.validBookShare,
      btcJoinCoverageShare: validationAnalysis.selectedRunQuality.btcJoinCoverageShare,
      bidSizeCoverageShare: validationAnalysis.selectedRunQuality.bidSizeCoverageShare,
      runDurationSeconds: validationAnalysis.selectedRunQuality.runDurationSeconds,
      reconnectCount: validationAnalysis.selectedRunQuality.reconnectCount,
      sequenceGapCount: validationAnalysis.selectedRunQuality.sequenceGapCount,
      captureHealthSource: validationAnalysis.selectedRunQuality.captureHealthSource,
    },
    holdoutRunId: discovery.splitManifest.holdout.runId,
    holdoutRole: "holdout",
    holdoutOutcomeAccessed: false,
    incidence: {
      validationCaptureHours: validationHours,
      recordsScanned: validationAnalysis.recordsScanned,
      btcRecordsScanned: validationAnalysis.btcRecordsScanned,
      btcTriggerCount: validationAnalysis.triggerCount,
      eligibleMarketTriggerCount: incidenceBase.eligibleMarketTriggerCount,
      uniqueMarketCount: incidenceBase.uniqueMarketCount,
      independentMarketDayCount: incidenceBase.independentMarketDayCount,
    },
    candidateResults,
    survivingCandidateCount: survivors.length,
    lockedHoldoutCandidate: locked,
    validationOverallStatus,
    quarantine: {
      holdoutOutcomesAnalyzed: false,
      parameterRetuningOccurred: false,
      promotionArtifactCreated: false,
      preregistrationArtifactCreated: false,
      frozenHypothesisCreated: false,
      captureStarted: false,
      finalOosClaimCreated: false,
    },
    outputPaths: {
      outputPath: paths.outputPath,
      htmlOutputPath: paths.htmlOutputPath,
      validationAnalysisOutputPath: paths.validationAnalysisOutputPath,
      validationEventsOutputPath: paths.validationEventsOutputPath,
    },
    warnings,
  };

  // Explicit absence of holdout outcome fields.
  const serialized = stableStringify(report);
  for (const banned of [
    "holdoutTriggerCount",
    "holdoutEligible",
    "holdoutEffect",
    "holdoutPValue",
    "holdoutMedian",
  ]) {
    if (serialized.includes(banned)) {
      throw new LeadLagValidationError(`Report unexpectedly contains ${banned}.`);
    }
  }

  input.io.mkdirSync(paths.outputDir, { recursive: true });
  input.io.writeFile(paths.validationAnalysisOutputPath, `${stableStringify(validationAnalysis)}\n`);
  input.io.writeFile(paths.outputPath, `${serialized}\n`);
  input.io.mkdirSync(paths.htmlOutputPath.replace(/[/\\][^/\\]+$/, ""), { recursive: true });
  input.io.writeFile(paths.htmlOutputPath, serializeLeadLagValidationHtml(report));

  log(`Wrote lead-lag validation artifact ${paths.outputPath}`);
  return report;
}

export function serializeLeadLagValidationHtml(report: LeadLagValidationReport): string {
  const rows = report.candidateResults
    .map(
      (result) =>
        `<tr><td>${result.exactDefinition.discoveryRank}</td>`
        + `<td><code>${result.hypothesisId}</code></td>`
        + `<td>${result.validationStatus}</td>`
        + `<td>${result.validationEventCount}</td>`
        + `<td>${result.independentMarketCount}</td>`
        + `<td>${result.midpointResponseCents}</td>`
        + `<td>${result.executableObservabilityShare}</td>`
        + `<td>${result.directionalConsistency}</td></tr>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>M12.8b Lead-Lag Validation</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 2rem; }
    code { font-size: 0.85em; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ccc; padding: 0.4rem 0.6rem; text-align: left; }
  </style>
</head>
<body>
  <h1>M12.8b Lead-Lag Validation</h1>
  <p>${report.disclaimer}</p>
  <p><strong>Overall:</strong> ${report.validationOverallStatus}</p>
  <p><strong>Discovery:</strong> <code>${report.discoveryIdentity}</code> (${report.discoveryHypothesisCount} hypotheses)</p>
  <p><strong>Validation run:</strong> ${report.validationRunId}</p>
  <p><strong>Holdout:</strong> ${report.holdoutRunId} (outcomes not accessed)</p>
  <p><strong>Locked candidate:</strong> ${
    report.lockedHoldoutCandidate
      ? `<code>${report.lockedHoldoutCandidate.hypothesisId}</code>`
      : "none"
  }</p>
  <table>
    <thead><tr><th>Rank</th><th>Hypothesis</th><th>Status</th><th>N</th><th>Markets</th><th>Mid ¢</th><th>Exec</th><th>Dir</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>
`;
}

export function serializeLeadLagValidationReport(report: LeadLagValidationReport): string {
  return `${stableStringify(report)}\n`;
}
