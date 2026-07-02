import { posix } from "node:path";

import {
  AGGREGATE_SUMMARY_FILENAME,
  BATCH_IMPORT_SUMMARY_FILENAME,
  CALIBRATION_REPORT_FILENAME,
  DEFAULT_DISCOVERY_RESULT_PATH,
  DEFAULT_FIXTURES_DIR,
  DEFAULT_IMPORT_CONFIGS_DIR,
  DEFAULT_IMPORTS_DIR,
  DEFAULT_LEADERBOARD_PATH,
  DEFAULT_REGISTRY_DIR,
  DEFAULT_REPORT_HTML_PATH,
  DEFAULT_RESEARCH_RESULTS_DIR,
  FIXTURE_FILENAME,
  HYPOTHESIS_CANDIDATES_ARTIFACT,
  IMPORT_CONFIG_FILENAME,
  LEAD_LAG_ARTIFACT,
  MAX_MISSING_SETTLEMENT_EXAMPLES,
  MISPRICING_ATLAS_ARTIFACT,
  OVERFITTING_DIAGNOSTICS_ARTIFACT,
  POWER_ANALYSIS_ARTIFACT,
  REGIME_TAGS_ARTIFACT,
  REGISTRY_FILENAME,
  RESEARCH_OUTPUT_FILENAME,
  SETTLEMENT_AUDIT_ARTIFACT,
  SIGNIFICANCE_ARTIFACT,
  type ArtifactFreshness,
  type ArtifactFreshnessEntry,
  type DataHealthConfig,
  type DataHealthIo,
  type PipelineCoverage,
  type ResearchCoverage,
  type ScannedDataHealthInputs,
  type SettlementHealth,
  type StaleDependencyWarning,
} from "./dataHealthTypes";

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonIfExists(path: string, io: DataHealthIo): unknown | null {
  if (!io.fileExists(path)) {
    return null;
  }

  try {
    return JSON.parse(io.readFile(path));
  } catch {
    return null;
  }
}

function countFilesNamed(
  root: string,
  filename: string,
  io: DataHealthIo,
): number {
  if (!io.fileExists(root) || !io.isDirectory(root)) {
    return 0;
  }

  let count = 0;

  function walk(directoryPath: string): void {
    for (const entry of [...io.readdir(directoryPath)].sort()) {
      const entryPath = posix.join(directoryPath, entry);
      if (entry === filename && io.fileExists(entryPath)) {
        count += 1;
        continue;
      }
      if (io.isDirectory(entryPath)) {
        walk(entryPath);
      }
    }
  }

  walk(root);
  return count;
}

function readDiscoveredMarkets(discoveryResultPath: string, io: DataHealthIo): number | null {
  const parsed = parseJsonIfExists(discoveryResultPath, io);
  if (!isRecord(parsed) || !Array.isArray(parsed.markets)) {
    return null;
  }
  return parsed.markets.length;
}

function readImportSummaryCounts(
  importsDir: string,
  io: DataHealthIo,
): { successfulImports: number | null; failedImports: number | null } {
  const summaryPath = posix.join(importsDir, BATCH_IMPORT_SUMMARY_FILENAME);
  const parsed = parseJsonIfExists(summaryPath, io);
  if (!isRecord(parsed)) {
    return { successfulImports: null, failedImports: null };
  }

  return {
    successfulImports:
      typeof parsed.successfulImports === "number" ? parsed.successfulImports : null,
    failedImports: typeof parsed.failedImports === "number" ? parsed.failedImports : null,
  };
}

type RegistryMarket = {
  marketTicker: string;
  settlementPresent: boolean;
};

function readRegistryMarkets(registryDir: string, io: DataHealthIo): RegistryMarket[] {
  if (!io.fileExists(registryDir) || !io.isDirectory(registryDir)) {
    return [];
  }

  const markets: RegistryMarket[] = [];

  for (const seriesEntry of [...io.readdir(registryDir)].sort()) {
    const registryPath = posix.join(registryDir, seriesEntry, REGISTRY_FILENAME);
    const parsed = parseJsonIfExists(registryPath, io);
    if (!isRecord(parsed) || !Array.isArray(parsed.markets)) {
      continue;
    }

    for (const market of parsed.markets) {
      if (!isRecord(market) || typeof market.marketTicker !== "string") {
        continue;
      }
      markets.push({
        marketTicker: market.marketTicker,
        settlementPresent: market.settlementPresent === true,
      });
    }
  }

  return markets.sort((left, right) => left.marketTicker.localeCompare(right.marketTicker));
}

function readSettlementAuditReasonCounts(
  researchResultsDir: string,
  io: DataHealthIo,
): Readonly<Record<string, number>> {
  const auditPath = posix.join(researchResultsDir, SETTLEMENT_AUDIT_ARTIFACT);
  const parsed = parseJsonIfExists(auditPath, io);
  if (!isRecord(parsed) || !isRecord(parsed.reasonCounts)) {
    return {};
  }

  const counts: Record<string, number> = {};
  for (const [key, value] of Object.entries(parsed.reasonCounts)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      counts[key] = value;
    }
  }

  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function readNestedNumber(
  record: Record<string, unknown>,
  keys: readonly string[],
): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function readCoveragePct(
  parsed: Record<string, unknown> | null,
  numeratorKeys: readonly string[],
  denominator: number,
): number | null {
  if (!parsed || denominator <= 0) {
    return null;
  }

  let numerator = readNestedNumber(parsed, numeratorKeys);
  if (numerator === null && isRecord(parsed.sampleCounts)) {
    numerator = readNestedNumber(parsed.sampleCounts, numeratorKeys);
  }

  if (numerator === null) {
    return null;
  }

  return Math.round((numerator / denominator) * 1_000_000) / 10_000;
}

function readStrategySignificanceCoverage(
  parsed: Record<string, unknown> | null,
  aggregateSummaries: number,
): number | null {
  if (!parsed || !Array.isArray(parsed.strategies) || aggregateSummaries <= 0) {
    return null;
  }

  return Math.round((parsed.strategies.length / aggregateSummaries) * 1_000_000) / 10_000;
}

export function scanPipelineCoverage(
  config: DataHealthConfig,
  io: DataHealthIo,
): PipelineCoverage {
  const importSummary = readImportSummaryCounts(config.importsDir, io);

  return {
    discoveredMarkets: readDiscoveredMarkets(config.discoveryResultPath, io),
    importConfigs: countFilesNamed(config.importConfigsDir, IMPORT_CONFIG_FILENAME, io),
    successfulImports: importSummary.successfulImports,
    failedImports: importSummary.failedImports,
    fixtures: countFilesNamed(config.fixturesDir, FIXTURE_FILENAME, io),
    registryMarkets: readRegistryMarkets(config.registryDir, io).length,
    researchOutputs: countFilesNamed(config.researchResultsDir, RESEARCH_OUTPUT_FILENAME, io),
    aggregateSummaries: countFilesNamed(
      config.researchResultsDir,
      AGGREGATE_SUMMARY_FILENAME,
      io,
    ),
    calibrationReports: countFilesNamed(
      config.researchResultsDir,
      CALIBRATION_REPORT_FILENAME,
      io,
    ),
    leaderboardPresent: io.fileExists(config.leaderboardPath),
    reportHtmlPresent: io.fileExists(config.reportHtmlPath),
  };
}

export function scanSettlementHealth(
  config: DataHealthConfig,
  io: DataHealthIo,
): SettlementHealth {
  const registryMarkets = readRegistryMarkets(config.registryDir, io);
  const settlementPresent = registryMarkets.filter((market) => market.settlementPresent).length;
  const settlementMissing = registryMarkets.filter((market) => !market.settlementPresent).length;
  const total = registryMarkets.length;

  const missingSettlementExamples = registryMarkets
    .filter((market) => !market.settlementPresent)
    .map((market) => market.marketTicker)
    .slice(0, MAX_MISSING_SETTLEMENT_EXAMPLES);

  const reasonCounts = readSettlementAuditReasonCounts(config.researchResultsDir, io);

  return {
    settlementPresent,
    settlementMissing,
    settlementCoveragePct:
      total === 0 ? null : Math.round((settlementPresent / total) * 1_000_000) / 10_000,
    missingSettlementExamples,
    reasonCounts,
  };
}

export function scanResearchCoverage(
  config: DataHealthConfig,
  pipelineCoverage: PipelineCoverage,
  io: DataHealthIo,
): ResearchCoverage {
  const researchResultsDir = config.researchResultsDir;

  const mispricingPath = posix.join(researchResultsDir, MISPRICING_ATLAS_ARTIFACT);
  const leadLagPath = posix.join(researchResultsDir, LEAD_LAG_ARTIFACT);
  const significancePath = posix.join(researchResultsDir, SIGNIFICANCE_ARTIFACT);
  const powerPath = posix.join(researchResultsDir, POWER_ANALYSIS_ARTIFACT);
  const overfittingPath = posix.join(researchResultsDir, OVERFITTING_DIAGNOSTICS_ARTIFACT);
  const regimePath = posix.join(researchResultsDir, REGIME_TAGS_ARTIFACT);
  const hypothesesPath = posix.join(researchResultsDir, HYPOTHESIS_CANDIDATES_ARTIFACT);

  const mispricingParsed = parseJsonIfExists(mispricingPath, io);
  const leadLagParsed = parseJsonIfExists(leadLagPath, io);
  const significanceParsed = parseJsonIfExists(significancePath, io);

  const denominator =
    pipelineCoverage.registryMarkets > 0
      ? pipelineCoverage.registryMarkets
      : pipelineCoverage.researchOutputs;

  const calibrationCoveragePct =
    denominator === 0
      ? null
      : Math.round((pipelineCoverage.calibrationReports / denominator) * 1_000_000) / 10_000;

  return {
    calibrationCoveragePct,
    mispricingAtlasCoveragePct: readCoveragePct(
      isRecord(mispricingParsed) ? mispricingParsed : null,
      ["marketCount", "totalObservations"],
      denominator,
    ),
    mispricingAtlasPresent: io.fileExists(mispricingPath),
    leadLagCoveragePct: readCoveragePct(
      isRecord(leadLagParsed) ? leadLagParsed : null,
      ["marketCount"],
      denominator,
    ),
    leadLagPresent: io.fileExists(leadLagPath),
    significanceCoveragePct: readStrategySignificanceCoverage(
      isRecord(significanceParsed) ? significanceParsed : null,
      pipelineCoverage.aggregateSummaries,
    ),
    significancePresent: io.fileExists(significancePath),
    powerAnalysisPresent: io.fileExists(powerPath),
    overfittingDiagnosticsPresent: io.fileExists(overfittingPath),
    regimeTagsPresent: io.fileExists(regimePath),
    hypothesesPresent: io.fileExists(hypothesesPath),
  };
}

function artifactEntry(path: string, io: DataHealthIo): ArtifactFreshnessEntry {
  return {
    path: normalizePath(path),
    lastModified: io.fileExists(path) ? io.getLastModified(path) : null,
  };
}

function compareModified(
  upstream: ArtifactFreshnessEntry,
  downstream: ArtifactFreshnessEntry,
  code: string,
  message: string,
): StaleDependencyWarning | null {
  if (!upstream.lastModified || !downstream.lastModified) {
    return null;
  }

  if (Date.parse(downstream.lastModified) >= Date.parse(upstream.lastModified)) {
    return null;
  }

  return {
    code,
    message,
    upstreamPath: upstream.path,
    downstreamPath: downstream.path,
    upstreamLastModified: upstream.lastModified,
    downstreamLastModified: downstream.lastModified,
  };
}

export function scanArtifactFreshness(
  config: DataHealthConfig,
  io: DataHealthIo,
): ArtifactFreshness {
  const artifactPaths = [
    config.discoveryResultPath,
    posix.join(config.importsDir, BATCH_IMPORT_SUMMARY_FILENAME),
    config.leaderboardPath,
    config.reportHtmlPath,
    posix.join(config.researchResultsDir, MISPRICING_ATLAS_ARTIFACT),
    posix.join(config.researchResultsDir, LEAD_LAG_ARTIFACT),
    posix.join(config.researchResultsDir, SIGNIFICANCE_ARTIFACT),
    posix.join(config.researchResultsDir, POWER_ANALYSIS_ARTIFACT),
    posix.join(config.researchResultsDir, OVERFITTING_DIAGNOSTICS_ARTIFACT),
    posix.join(config.researchResultsDir, REGIME_TAGS_ARTIFACT),
    posix.join(config.researchResultsDir, HYPOTHESIS_CANDIDATES_ARTIFACT),
  ].sort((left, right) => left.localeCompare(right));

  const artifacts = artifactPaths.map((path) => artifactEntry(path, io));

  const byPath = new Map(artifacts.map((entry) => [entry.path, entry]));
  const mispricing = byPath.get(
    normalizePath(posix.join(config.researchResultsDir, MISPRICING_ATLAS_ARTIFACT)),
  );
  const hypotheses = byPath.get(
    normalizePath(posix.join(config.researchResultsDir, HYPOTHESIS_CANDIDATES_ARTIFACT)),
  );
  const leaderboard = byPath.get(normalizePath(config.leaderboardPath));
  const report = byPath.get(normalizePath(config.reportHtmlPath));

  const staleWarnings: StaleDependencyWarning[] = [];

  if (mispricing && hypotheses) {
    const warning = compareModified(
      mispricing,
      hypotheses,
      "hypotheses-older-than-mispricing-atlas",
      "Hypothesis candidates are older than the mispricing atlas.",
    );
    if (warning) {
      staleWarnings.push(warning);
    }
  }

  if (leaderboard && report) {
    const warning = compareModified(
      leaderboard,
      report,
      "report-older-than-leaderboard",
      "Research report HTML is older than the strategy leaderboard.",
    );
    if (warning) {
      staleWarnings.push(warning);
    }
  }

  return {
    artifacts,
    staleDependencyWarnings: staleWarnings.sort((left, right) =>
      left.code.localeCompare(right.code),
    ),
  };
}

export function scanDataHealthInputs(
  config: DataHealthConfig,
  io: DataHealthIo,
): ScannedDataHealthInputs {
  const pipelineCoverage = scanPipelineCoverage(config, io);
  const settlementHealth = scanSettlementHealth(config, io);
  const researchCoverage = scanResearchCoverage(config, pipelineCoverage, io);
  const artifactFreshness = scanArtifactFreshness(config, io);

  return {
    pipelineCoverage,
    settlementHealth,
    researchCoverage,
    artifactFreshness,
  };
}

export const DEFAULT_DATA_HEALTH_CONFIG: DataHealthConfig = {
  discoveryResultPath: DEFAULT_DISCOVERY_RESULT_PATH,
  importsDir: DEFAULT_IMPORTS_DIR,
  importConfigsDir: DEFAULT_IMPORT_CONFIGS_DIR,
  fixturesDir: DEFAULT_FIXTURES_DIR,
  registryDir: DEFAULT_REGISTRY_DIR,
  researchResultsDir: DEFAULT_RESEARCH_RESULTS_DIR,
  leaderboardPath: DEFAULT_LEADERBOARD_PATH,
  reportHtmlPath: DEFAULT_REPORT_HTML_PATH,
  outputPath: "data/research-results/data-health.json",
};
