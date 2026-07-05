import { buildCoverageImportRecommendations } from "./buildCoverageImportRecommendations";
import { computeCoverageSnapshot } from "./computeCoverageSnapshot";
import type {
  BuildHistoricalCoveragePlanInput,
  CoveragePlannerIo,
  HistoricalCoveragePlanConfig,
  HistoricalCoveragePlanReport,
} from "./coveragePlannerTypes";
import { loadCoveragePlannerArtifacts } from "./parseCoveragePlannerArtifacts";
import { scanCoverageMarketRecords } from "./scanCoverageMarketRecords";
import { buildHistoricalImportabilityProfile } from "./importability/buildHistoricalImportabilityProfile";
import { tryLoadExpansionImportSummary } from "./importability/loadExpansionImportSummary";

export function serializeHistoricalCoveragePlan(
  report: HistoricalCoveragePlanReport,
): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function buildPlannerNotes(
  report: Pick<HistoricalCoveragePlanReport, "snapshot" | "inputStatus" | "recommendations">,
): string[] {
  const notes: string[] = [
    "Read-only planner: does not run imports or mutate replay/research calculations.",
  ];

  if (!report.inputStatus.hypothesisValidationPresent) {
    notes.push(
      "hypothesis-validation.json was not found; month-stability prioritization uses defaults only.",
    );
  }

  if (!report.inputStatus.regimeTagsPresent) {
    notes.push(
      "regime-tags.json was not found; volatility regime coverage may show untagged markets only.",
    );
  }

  if (report.snapshot.missingMonths.length === 0 && report.snapshot.underCoveredMonths.length === 0) {
    notes.push(
      "No missing or under-covered months detected at current depth thresholds; recommendations may be empty until the horizon expands.",
    );
  } else if (report.snapshot.underCoveredMonths.length > 0) {
    notes.push(
      `${report.snapshot.underCoveredMonths.length} month(s) are present but under-covered relative to minMarketsPerMonth=${report.snapshot.depthThresholds.minMarketsPerMonth} and minTradingDaysPerMonth=${report.snapshot.depthThresholds.minTradingDaysPerMonth}.`,
    );
  } else if (report.snapshot.missingMonths.length === 0) {
    notes.push(
      "No intra-horizon month gaps detected; recommendations may be empty until the horizon expands.",
    );
  }

  if (report.recommendations.length === 0) {
    notes.push(
      "No import windows recommended yet. Add import configs or research outputs spanning missing months.",
    );
  }

  if (!report.inputStatus.expansionImportSummaryPresent) {
    notes.push(
      "historical-expansion-import-summary.json was not found; importability scoring defaults to medium support.",
    );
  }

  return notes;
}

/** Builds the historical coverage expansion plan from scanned inputs. */
export function buildHistoricalCoveragePlan(
  input: BuildHistoricalCoveragePlanInput,
): HistoricalCoveragePlanReport {
  const snapshot = computeCoverageSnapshot(input.marketRecords, input.scanCounts, {
    minMarketsPerMonth: input.config.minMarketsPerMonth,
    minTradingDaysPerMonth: input.config.minTradingDaysPerMonth,
  });

  const recommendations = buildCoverageImportRecommendations(
    snapshot,
    input.artifacts,
    input.config,
    input.importabilityMarkets,
  );

  return {
    generatedAt: input.generatedAt,
    outputPath: input.config.outputPath,
    htmlOutputPath: input.config.htmlOutputPath,
    config: input.config,
    inputStatus: input.inputStatus,
    snapshot,
    recommendations,
    importability: input.importability,
    plannerNotes: buildPlannerNotes({
      snapshot,
      inputStatus: input.inputStatus,
      recommendations,
    }),
  };
}

export function buildHistoricalCoveragePlanFromPaths(
  config: HistoricalCoveragePlanConfig,
  io: CoveragePlannerIo,
  options?: { generatedAt?: string },
): HistoricalCoveragePlanReport {
  const generatedAt = options?.generatedAt ?? new Date().toISOString();
  const artifacts = loadCoveragePlannerArtifacts(io, {
    dataHealthPath: config.dataHealthPath,
    mispricingAtlasPath: config.mispricingAtlasPath,
    hypothesisValidationPath: config.hypothesisValidationPath,
    regimeTagsPath: config.regimeTagsPath,
  });

  const regimeByMarket = new Map<string, "low" | "medium" | "high">();
  for (const market of artifacts.regimeTags?.markets ?? []) {
    if (market.tags.volatility) {
      regimeByMarket.set(market.marketTicker, market.tags.volatility);
    }
  }

  const scanResult = scanCoverageMarketRecords(
    io,
    {
      importConfigsDir: config.importConfigsDir,
      fixturesDir: config.fixturesDir,
      researchResultsDir: config.researchResultsDir,
    },
    regimeByMarket,
  );

  const inputStatus = {
    dataHealthPath: config.dataHealthPath,
    mispricingAtlasPath: config.mispricingAtlasPath,
    hypothesisValidationPath: config.hypothesisValidationPath,
    regimeTagsPath: config.regimeTagsPath,
    expansionImportSummaryPath: config.expansionImportSummaryPath,
    importConfigsDir: config.importConfigsDir,
    fixturesDir: config.fixturesDir,
    researchResultsDir: config.researchResultsDir,
    dataHealthPresent: io.fileExists(config.dataHealthPath),
    mispricingAtlasPresent: io.fileExists(config.mispricingAtlasPath),
    hypothesisValidationPresent: io.fileExists(config.hypothesisValidationPath),
    regimeTagsPresent: io.fileExists(config.regimeTagsPath),
    expansionImportSummaryPresent: io.fileExists(config.expansionImportSummaryPath),
  };

  const expansionSummary = tryLoadExpansionImportSummary(
    io,
    config.expansionImportSummaryPath,
  );
  const importabilityMarkets = expansionSummary
    ? expansionSummary.jobs.flatMap((job) => job.markets)
    : [];
  const importability = buildHistoricalImportabilityProfile({
    summaryPath: config.expansionImportSummaryPath,
    summaries: expansionSummary ? [expansionSummary] : [],
  });

  return buildHistoricalCoveragePlan({
    generatedAt,
    config,
    inputStatus,
    artifacts,
    marketRecords: scanResult.records,
    scanCounts: {
      importConfigCount: scanResult.importConfigCount,
      fixtureCount: scanResult.fixtureCount,
      researchOutputCount: scanResult.researchOutputCount,
    },
    importabilityMarkets,
    importability,
  });
}
