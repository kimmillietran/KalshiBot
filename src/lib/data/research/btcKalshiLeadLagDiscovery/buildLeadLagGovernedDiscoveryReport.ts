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
  aggregateLeadLagDiscoveryCells,
  computeTrainIncidenceFromEvents,
  declareLeadLagSearchUniverse,
} from "./aggregateLeadLagDiscoveryCells";
import {
  buildLeadLagResearchSplitManifest,
  sha256Hex,
} from "./buildLeadLagResearchSplitManifest";
import { createTrainOnlyDiscoveryIo } from "./createTrainOnlyDiscoveryIo";
import {
  DEFAULT_LEAD_LAG_DISCOVERY_HTML_ROOT,
  DEFAULT_LEAD_LAG_DISCOVERY_JSON_ROOT,
  DEFAULT_LEAD_LAG_DISCOVERY_RANKING_CONFIG,
  LEAD_LAG_DISCOVERY_CELLS_FILENAME,
  LEAD_LAG_DISCOVERY_DISCLAIMER,
  LEAD_LAG_DISCOVERY_HTML_FILENAME,
  LEAD_LAG_DISCOVERY_JSON_FILENAME,
  LEAD_LAG_DISCOVERY_SPLIT_FILENAME,
  LEAD_LAG_DISCOVERY_TRAIN_ANALYSIS_FILENAME,
  LEAD_LAG_DISCOVERY_TRAIN_EVENTS_FILENAME,
  LEAD_LAG_GOVERNED_DISCOVERY_ANALYSIS_VERSION,
  LeadLagGovernedDiscoveryError,
  type LeadLagDiscoveryIo,
  type LeadLagDiscoveryRankingConfig,
  type LeadLagGovernedDiscoveryReport,
} from "./leadLagDiscoveryTypes";
import {
  CANDIDATE_RANKING_METHODOLOGY,
  rankLeadLagDiscoveryCandidates,
} from "./rankLeadLagDiscoveryCandidates";

export function resolveLeadLagDiscoveryOutputPaths(input: {
  discoveryIdentityHash: string;
  outputPath?: string | null;
  htmlOutputPath?: string | null;
}): {
  outputDir: string;
  outputPath: string;
  htmlOutputPath: string;
  cellsOutputPath: string;
  splitManifestPath: string;
  trainAnalysisOutputPath: string;
  trainEventsOutputPath: string;
} {
  const outputDir =
    input.outputPath != null
      ? input.outputPath.replace(/[/\\][^/\\]+$/, "")
      : join(DEFAULT_LEAD_LAG_DISCOVERY_JSON_ROOT, input.discoveryIdentityHash);
  const htmlDir =
    input.htmlOutputPath != null
      ? input.htmlOutputPath.replace(/[/\\][^/\\]+$/, "")
      : join(DEFAULT_LEAD_LAG_DISCOVERY_HTML_ROOT, input.discoveryIdentityHash);

  return {
    outputDir,
    outputPath: input.outputPath ?? join(outputDir, LEAD_LAG_DISCOVERY_JSON_FILENAME),
    htmlOutputPath:
      input.htmlOutputPath ?? join(htmlDir, LEAD_LAG_DISCOVERY_HTML_FILENAME),
    cellsOutputPath: join(outputDir, LEAD_LAG_DISCOVERY_CELLS_FILENAME),
    splitManifestPath: join(outputDir, LEAD_LAG_DISCOVERY_SPLIT_FILENAME),
    trainAnalysisOutputPath: join(outputDir, LEAD_LAG_DISCOVERY_TRAIN_ANALYSIS_FILENAME),
    trainEventsOutputPath: join(outputDir, LEAD_LAG_DISCOVERY_TRAIN_EVENTS_FILENAME),
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

async function loadTrainEventsFromJsonl(
  io: LeadLagDiscoveryIo,
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
  io: LeadLagDiscoveryIo,
  log: (message: string) => void,
): LeadLagDiscoveryIo {
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

export async function buildLeadLagGovernedDiscoveryReport(input: {
  io: LeadLagDiscoveryIo;
  trainCaptureRunDir: string;
  validationCaptureRunDir: string;
  holdoutCaptureRunDir: string;
  generatedAt?: string;
  outputPath?: string | null;
  htmlOutputPath?: string | null;
  rankingConfig?: LeadLagDiscoveryRankingConfig;
  researchRoots?: readonly string[];
  log?: (message: string) => void;
}): Promise<LeadLagGovernedDiscoveryReport> {
  const log = input.log ?? (() => {});
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const rankingConfig = input.rankingConfig ?? DEFAULT_LEAD_LAG_DISCOVERY_RANKING_CONFIG;

  // Split identities are built with unrestricted IO (validation/holdout paths listed only).
  const splitManifest = buildLeadLagResearchSplitManifest({
    io: input.io,
    trainCaptureRunDir: input.trainCaptureRunDir,
    validationCaptureRunDir: input.validationCaptureRunDir,
    holdoutCaptureRunDir: input.holdoutCaptureRunDir,
    researchRoots: input.researchRoots,
    failClosedOnContaminatedOos: true,
  });

  const searchUniverse = declareLeadLagSearchUniverse();

  const leadLagConfig = createBtcKalshiLeadLagAnalysisConfig({
    captureRunDir: splitManifest.train.captureRunDir,
  });

  const discoveryIdentityHash = sha256Hex(
    stableStringify({
      analysisVersion: LEAD_LAG_GOVERNED_DISCOVERY_ANALYSIS_VERSION,
      splitManifestHash: splitManifest.splitManifestHash,
      trainIdentityHash: splitManifest.train.identityHash,
      leadLagAnalysisConfiguration: {
        maximumBtcJoinAgeMs: leadLagConfig.maximumBtcJoinAgeMs,
        responseMatchToleranceMs: leadLagConfig.responseMatchToleranceMs,
        triggerCooldownMs: leadLagConfig.triggerCooldownMs,
        stalenessBoundMs: leadLagConfig.stalenessBoundMs,
        minimumTriggersForClassification: leadLagConfig.minimumTriggersForClassification,
        minimumEligibleTriggersForStrongClassification:
          leadLagConfig.minimumEligibleTriggersForStrongClassification,
      },
      searchUniverse,
      rankingConfig,
    }),
  );

  const paths = resolveLeadLagDiscoveryOutputPaths({
    discoveryIdentityHash,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
  });
  leadLagConfig.eventsOutputPath = paths.trainEventsOutputPath;

  const trainOnlyIo = withProgressLogging(
    createTrainOnlyDiscoveryIo({
      baseIo: input.io,
      trainCaptureRunDir: splitManifest.train.captureRunDir,
      quarantinedCaptureRunDirs: [
        splitManifest.validation.captureRunDir,
        splitManifest.holdout.captureRunDir,
      ],
    }),
    log,
  );

  const assertQuarantined = (path: string, label: string): void => {
    let blocked = false;
    try {
      trainOnlyIo.fileExists(path);
    } catch (error) {
      if (error instanceof LeadLagGovernedDiscoveryError) {
        blocked = true;
      } else {
        throw error;
      }
    }
    if (!blocked) {
      throw new LeadLagGovernedDiscoveryError(
        `Train-only IO failed to quarantine ${label} capture directory.`,
      );
    }
  };
  assertQuarantined(splitManifest.validation.captureRunDir, "validation");
  assertQuarantined(splitManifest.holdout.captureRunDir, "holdout");

  log(`Running train-only lead-lag analysis on ${splitManifest.train.runId}…`);

  const trainAnalysis: BtcKalshiLeadLagAnalysisReport = await analyzeBtcKalshiLeadLagForRun({
    generatedAt,
    outputPath: paths.trainAnalysisOutputPath,
    htmlOutputPath: paths.htmlOutputPath.replace(
      LEAD_LAG_DISCOVERY_HTML_FILENAME,
      "train-selected-run-lead-lag-analysis.html",
    ),
    eventsOutputPath: paths.trainEventsOutputPath,
    config: leadLagConfig,
    io: trainOnlyIo,
  });

  if (trainAnalysis.selectedRunId !== splitManifest.train.runId) {
    throw new LeadLagGovernedDiscoveryError(
      `Train analysis selectedRunId ${trainAnalysis.selectedRunId} does not match split train ${splitManifest.train.runId}.`,
    );
  }

  log(`Streaming train events for full ${searchUniverse.hypothesisCount}-hypothesis grid…`);
  const events = await loadTrainEventsFromJsonl(trainOnlyIo, paths.trainEventsOutputPath);
  const cells = aggregateLeadLagDiscoveryCells(events);
  const ranked = rankLeadLagDiscoveryCandidates({ cells, config: rankingConfig });

  const trainHours =
    splitManifest.train.durationHours
    ?? (trainAnalysis.selectedRunQuality.runDurationSeconds !== null
      ? trainAnalysis.selectedRunQuality.runDurationSeconds / 3600
      : null);

  const incidenceBase = computeTrainIncidenceFromEvents({
    events,
    btcTriggerCount: trainAnalysis.triggerCount,
    recordsScanned: trainAnalysis.recordsScanned,
    btcRecordsScanned: trainAnalysis.btcRecordsScanned,
    trainCaptureHours: trainHours,
    suppressedOverlappingTriggerCount: trainAnalysis.suppressedOverlappingTriggerCount,
  });

  const perHour = (count: number): number | null =>
    trainHours !== null && trainHours > 0 ? count / trainHours : null;

  const warnings = [
    ...splitManifest.warnings,
    ...trainAnalysis.warnings,
    "Validation and holdout capture directories were never opened for lead-lag signal analysis.",
    "Discovery does not authorize promotion, preregistration, freeze, or capture.",
  ];

  if (
    trainAnalysis.selectedRunQuality.captureVerdict === "degraded-capture"
    || splitManifest.train.nativeCaptureVerdict === "degraded-capture"
  ) {
    warnings.push(
      "Native capture verdict is degraded-capture; research-ready audit semantics were required "
        + "and recorded. Do not treat degraded health as silent success.",
    );
  }

  const report: LeadLagGovernedDiscoveryReport = {
    generatedAt,
    analysisVersion: LEAD_LAG_GOVERNED_DISCOVERY_ANALYSIS_VERSION,
    disclaimer: LEAD_LAG_DISCOVERY_DISCLAIMER,
    discoveryIsolationStatus: "train-only-discovery",
    discoveryIsolation: {
      status: "train-only-discovery",
      reason:
        "Discovery runner received only the train capture path via train-only IO; "
        + "validation/holdout identities appear solely in the split manifest and were not analyzed.",
    },
    confirmatoryReuseForbidden: true,
    discoveryStatus: ranked.status,
    discoveryIdentityHash,
    splitManifestHash: splitManifest.splitManifestHash,
    splitManifest,
    trainArtifactIdentities: splitManifest.train,
    searchUniverse,
    rankingConfig: ranked.rankingConfig,
    leadLagAnalysisConfigurationHash: trainAnalysis.configurationHash,
    trainCaptureHealth: {
      selectedRunId: trainAnalysis.selectedRunQuality.selectedRunId,
      nativeCaptureVerdict: splitManifest.train.nativeCaptureVerdict,
      researchAuditVerdict:
        splitManifest.train.researchAuditVerdict
        ?? trainAnalysis.selectedRunQuality.captureVerdict,
      validBookShare: trainAnalysis.selectedRunQuality.validBookShare,
      btcJoinCoverageShare: trainAnalysis.selectedRunQuality.btcJoinCoverageShare,
      bidSizeCoverageShare: trainAnalysis.selectedRunQuality.bidSizeCoverageShare,
      runDurationSeconds: trainAnalysis.selectedRunQuality.runDurationSeconds,
      reconnectCount: trainAnalysis.selectedRunQuality.reconnectCount,
      sequenceGapCount: trainAnalysis.selectedRunQuality.sequenceGapCount,
      captureHealthSource: trainAnalysis.selectedRunQuality.captureHealthSource,
    },
    incidence: {
      trainCaptureHours: trainHours,
      recordsScanned: trainAnalysis.recordsScanned,
      btcRecordsScanned: trainAnalysis.btcRecordsScanned,
      btcTriggerCount: trainAnalysis.triggerCount,
      btcTriggersPerHour: perHour(trainAnalysis.triggerCount),
      eligibleMarketTriggerCount: incidenceBase.eligibleMarketTriggerCount,
      eligibleMarketTriggersPerHour: perHour(incidenceBase.eligibleMarketTriggerCount),
      uniqueMarketCount: incidenceBase.uniqueMarketCount,
      uniqueMarketsPerHour: perHour(incidenceBase.uniqueMarketCount),
      independentMarketDayCount: incidenceBase.independentMarketDayCount,
      suppressedOverlappingTriggerCount: trainAnalysis.suppressedOverlappingTriggerCount,
      dependenceNotes: [
        "BTC triggers are impulse events; eligible counts are market-trigger pairs.",
        "Multiple markets sharing one BTC impulse are dependent (uniqueBtcTriggerCount < eligible when multi-market).",
        "Multiple response windows from one trigger occupy different cells and are not double-counted within a cell.",
        "Independent statistical units for later power analysis should prefer unique markets / market-days / BTC impulses over raw quote rows.",
      ],
    },
    evaluatedCellCount: cells.length,
    retainedLosingCellCount: Math.max(0, cells.length - ranked.candidates.length),
    candidates: ranked.candidates,
    candidateRankingMethodology: [...CANDIDATE_RANKING_METHODOLOGY],
    multiplicityDeclaration: searchUniverse.multiplicityDeclaration,
    quarantine: {
      validationOutcomesAnalyzed: false,
      holdoutOutcomesAnalyzed: false,
      promotionArtifactCreated: false,
      preregistrationArtifactCreated: false,
      frozenHypothesisCreated: false,
      captureStarted: false,
    },
    outputPaths: {
      outputPath: paths.outputPath,
      htmlOutputPath: paths.htmlOutputPath,
      cellsOutputPath: paths.cellsOutputPath,
      splitManifestPath: paths.splitManifestPath,
      trainAnalysisOutputPath: paths.trainAnalysisOutputPath,
      trainEventsOutputPath: paths.trainEventsOutputPath,
    },
    warnings,
  };

  input.io.mkdirSync(paths.outputDir, { recursive: true });
  input.io.writeFile(paths.splitManifestPath, `${stableStringify(splitManifest)}\n`);
  input.io.writeFile(paths.trainAnalysisOutputPath, `${stableStringify(trainAnalysis)}\n`);
  input.io.writeFile(paths.cellsOutputPath, `${cells.map((cell) => stableStringify(cell)).join("\n")}\n`);
  input.io.writeFile(paths.outputPath, `${stableStringify(report)}\n`);
  input.io.mkdirSync(paths.htmlOutputPath.replace(/[/\\][^/\\]+$/, ""), { recursive: true });
  input.io.writeFile(paths.htmlOutputPath, serializeLeadLagGovernedDiscoveryHtml(report));

  log(`Wrote governed discovery artifact ${paths.outputPath}`);
  return report;
}

export function serializeLeadLagGovernedDiscoveryHtml(
  report: LeadLagGovernedDiscoveryReport,
): string {
  const candidateRows = report.candidates
    .map(
      (candidate) =>
        `<tr><td>${candidate.rank}</td><td><code>${candidate.hypothesisId}</code></td>`
        + `<td>${candidate.direction}</td>`
        + `<td>${candidate.eligibleMarketTriggerCount}</td>`
        + `<td>${candidate.independentMarketCount}</td>`
        + `<td>${candidate.medianSignedMidResponseCents}</td>`
        + `<td>${candidate.executableObservabilityShare}</td></tr>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>M12.8a Lead-Lag Governed Discovery</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 2rem; color: #111; }
    code { font-size: 0.85em; }
    table { border-collapse: collapse; width: 100%; margin-top: 1rem; }
    th, td { border: 1px solid #ccc; padding: 0.4rem 0.6rem; text-align: left; }
    .warn { color: #7a4d00; }
  </style>
</head>
<body>
  <h1>M12.8a Train-only BTC/Kalshi Lead-Lag Discovery</h1>
  <p>${report.disclaimer}</p>
  <p><strong>Status:</strong> ${report.discoveryStatus}</p>
  <p><strong>Isolation:</strong> ${report.discoveryIsolationStatus}</p>
  <p><strong>Identity:</strong> <code>${report.discoveryIdentityHash}</code></p>
  <p><strong>Split:</strong> train=${report.splitManifest.train.runId}
    validation=${report.splitManifest.validation.runId} (quarantined)
    holdout=${report.splitManifest.holdout.runId} (quarantined)</p>
  <p><strong>Multiplicity:</strong> ${report.multiplicityDeclaration}</p>
  <h2>Train incidence</h2>
  <ul>
    <li>Hours: ${report.incidence.trainCaptureHours}</li>
    <li>Records scanned: ${report.incidence.recordsScanned}</li>
    <li>BTC triggers: ${report.incidence.btcTriggerCount} (${report.incidence.btcTriggersPerHour}/hr)</li>
    <li>Eligible market-triggers: ${report.incidence.eligibleMarketTriggerCount} (${report.incidence.eligibleMarketTriggersPerHour}/hr)</li>
    <li>Unique markets: ${report.incidence.uniqueMarketCount}</li>
    <li>Independent market-days: ${report.incidence.independentMarketDayCount}</li>
  </ul>
  <h2>Candidates</h2>
  <table>
    <thead><tr><th>Rank</th><th>Hypothesis</th><th>Direction</th><th>N</th><th>Markets</th><th>Median mid ¢</th><th>Exec share</th></tr></thead>
    <tbody>${candidateRows || "<tr><td colspan=7>No promising candidate</td></tr>"}</tbody>
  </table>
  <h2>Warnings</h2>
  <ul class="warn">${report.warnings.map((warning) => `<li>${warning}</li>`).join("")}</ul>
</body>
</html>
`;
}

export function serializeLeadLagGovernedDiscoveryReport(
  report: LeadLagGovernedDiscoveryReport,
): string {
  return `${stableStringify(report)}\n`;
}
