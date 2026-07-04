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

  if (report.snapshot.missingMonths.length === 0) {
    notes.push(
      "No intra-horizon month gaps detected; recommendations may be empty until the horizon expands.",
    );
  }

  if (report.recommendations.length === 0) {
    notes.push(
      "No import windows recommended yet. Add import configs or research outputs spanning missing months.",
    );
  }

  return notes;
}

/** Builds the historical coverage expansion plan from scanned inputs. */
export function buildHistoricalCoveragePlan(
  input: BuildHistoricalCoveragePlanInput,
): HistoricalCoveragePlanReport {
  const snapshot = computeCoverageSnapshot(input.marketRecords, input.scanCounts);

  const recommendations = buildCoverageImportRecommendations(
    snapshot,
    input.artifacts,
    input.config,
  );

  return {
    generatedAt: input.generatedAt,
    outputPath: input.config.outputPath,
    htmlOutputPath: input.config.htmlOutputPath,
    config: input.config,
    inputStatus: input.inputStatus,
    snapshot,
    recommendations,
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
    importConfigsDir: config.importConfigsDir,
    fixturesDir: config.fixturesDir,
    researchResultsDir: config.researchResultsDir,
    dataHealthPresent: io.fileExists(config.dataHealthPath),
    mispricingAtlasPresent: io.fileExists(config.mispricingAtlasPath),
    hypothesisValidationPresent: io.fileExists(config.hypothesisValidationPath),
    regimeTagsPresent: io.fileExists(config.regimeTagsPath),
  };

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
  });
}
