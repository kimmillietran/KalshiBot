import { posix } from "node:path";

import { stableStringify } from "@/lib/trading/config/hashConfig";

import { MISPRICING_ATLAS_FILENAME } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";
import { RESEARCH_OUTPUT_FILENAME } from "@/lib/data/research/aggregation/researchAggregatePaths";
import { CALIBRATION_REPORT_FILENAME } from "@/lib/data/research/calibration/calibrationTypes";
import { SERIES_REGISTRY_FILENAME } from "@/lib/data/research/registry/researchDatasetRegistryPaths";

import {
  DEFAULT_SETTLEMENT_TRACE_FIXTURES_DIR,
  DEFAULT_SETTLEMENT_TRACE_IMPORT_CONFIGS_DIR,
  DEFAULT_SETTLEMENT_TRACE_IMPORTS_DIR,
  DEFAULT_SETTLEMENT_TRACE_REGISTRY_DIR,
  DEFAULT_SETTLEMENT_TRACE_RESEARCH_RESULTS_DIR,
  SETTLEMENT_TRACE_STAGE_ORDER,
  type BuildSettlementTraceReportInput,
  type SettlementTraceConfig,
  type SettlementTraceIo,
  type SettlementTraceReport,
  type SettlementTraceStage,
  type SettlementTraceStageId,
  type SettlementTraceStrategySummary,
} from "./settlementTraceTypes";
import {
  buildMarketArtifactPath,
  findBronzeSettlementRecords,
  isRecord,
  parseNestedJson,
  readSnapshotSettlement,
  readString,
  resolveSeriesTicker,
  safeParseJson,
} from "./settlementTraceUtils";

const IMPORT_CONFIG_FILENAME = "config.json";
const IMPORT_RESULT_FILENAME = "import-result.json";
const IMPORT_METADATA_FILENAME = "metadata.json";
const FIXTURE_FILENAME = "fixture.json";
const AGGREGATE_SUMMARY_FILENAME = "aggregate-summary.json";

type TraceContext = SettlementTraceConfig & {
  seriesTicker: string;
};

function createStage(
  stageId: SettlementTraceStageId,
  partial: Omit<SettlementTraceStage, "stageId">,
): SettlementTraceStage {
  return { stageId, ...partial };
}

function traceImportConfig(
  config: TraceContext,
  io: SettlementTraceIo,
): SettlementTraceStage {
  const path = buildMarketArtifactPath(
    config.importConfigsDir,
    config.seriesTicker,
    config.marketTicker,
    IMPORT_CONFIG_FILENAME,
  );

  if (!io.fileExists(path)) {
    return createStage("import-config", {
      status: "missing",
      path,
      settlementPresent: null,
      settlementValue: null,
      settlementFieldPath: null,
      marketTickerMatched: null,
      warnings: ["Import config file not found."],
      metadata: {},
    });
  }

  const parsed = safeParseJson(io.readFile(path), "config.json");
  if (!parsed.ok) {
    return createStage("import-config", {
      status: "malformed",
      path,
      settlementPresent: null,
      settlementValue: null,
      settlementFieldPath: null,
      marketTickerMatched: null,
      warnings: [parsed.error],
      metadata: {},
    });
  }

  if (!isRecord(parsed.value)) {
    return createStage("import-config", {
      status: "malformed",
      path,
      settlementPresent: null,
      settlementValue: null,
      settlementFieldPath: null,
      marketTickerMatched: null,
      warnings: ["config.json root must be an object."],
      metadata: {},
    });
  }

  const marketTicker = readString(parsed.value, "marketTicker");
  const kalshi = isRecord(parsed.value.kalshi) ? parsed.value.kalshi : null;
  const settlementSource = kalshi ? readString(kalshi, "settlementSource") : undefined;

  return createStage("import-config", {
    status: "found",
    path,
    settlementPresent: false,
    settlementValue: null,
    settlementFieldPath: settlementSource ? "kalshi.settlementSource" : null,
    marketTickerMatched: marketTicker === config.marketTicker,
    warnings: settlementSource
      ? []
      : ["Import config does not declare kalshi.settlementSource."],
    metadata: {
      marketTicker: marketTicker ?? null,
      settlementSource: settlementSource ?? null,
    },
  });
}

function traceBronzeArtifactStage(options: {
  stageId: "import-result" | "fixture";
  path: string;
  io: SettlementTraceIo;
  marketTicker: string;
  extraMetadata?: Record<string, unknown>;
}): SettlementTraceStage {
  const { path, io, marketTicker, stageId, extraMetadata = {} } = options;

  if (!io.fileExists(path)) {
    return createStage(stageId, {
      status: "missing",
      path,
      settlementPresent: false,
      settlementValue: null,
      settlementFieldPath: null,
      marketTickerMatched: null,
      warnings: [`${posix.basename(path)} not found.`],
      metadata: extraMetadata,
    });
  }

  const parsed = safeParseJson(io.readFile(path), posix.basename(path));
  if (!parsed.ok) {
    return createStage(stageId, {
      status: "malformed",
      path,
      settlementPresent: null,
      settlementValue: null,
      settlementFieldPath: null,
      marketTickerMatched: null,
      warnings: [parsed.error],
      metadata: extraMetadata,
    });
  }

  if (!isRecord(parsed.value)) {
    return createStage(stageId, {
      status: "malformed",
      path,
      settlementPresent: null,
      settlementValue: null,
      settlementFieldPath: null,
      marketTickerMatched: null,
      warnings: ["Root document must be an object."],
      metadata: extraMetadata,
    });
  }

  const bronzeRecords = parsed.value.bronzeRecords;
  const settlements = findBronzeSettlementRecords(bronzeRecords);
  const primary = settlements[0];

  return createStage(stageId, {
    status: "found",
    path,
    settlementPresent: settlements.length > 0,
    settlementValue: primary?.result ?? null,
    settlementFieldPath: primary?.fieldPath ?? null,
    marketTickerMatched:
      primary?.ticker === null || primary?.ticker === undefined
        ? null
        : primary.ticker === marketTicker,
    warnings:
      settlements.length === 0
        ? ["No kalshi.historical.settlement bronze record found."]
        : settlements.length > 1
          ? [`Found ${settlements.length} settlement bronze records; using first.`]
          : [],
    metadata: {
      settlementRecordCount: settlements.length,
      settlementResults: settlements.map((entry) => entry.result),
      ...extraMetadata,
    },
  });
}

function traceImportResult(
  config: TraceContext,
  io: SettlementTraceIo,
): SettlementTraceStage {
  const importResultPath = buildMarketArtifactPath(
    config.importsDir,
    config.seriesTicker,
    config.marketTicker,
    IMPORT_RESULT_FILENAME,
  );
  const metadataPath = buildMarketArtifactPath(
    config.importsDir,
    config.seriesTicker,
    config.marketTicker,
    IMPORT_METADATA_FILENAME,
  );

  let metadataSettlementPresent: boolean | null = null;
  if (io.fileExists(metadataPath)) {
    const metadataParsed = safeParseJson(io.readFile(metadataPath), "metadata.json");
    if (metadataParsed.ok && isRecord(metadataParsed.value)) {
      metadataSettlementPresent =
        typeof metadataParsed.value.settlementPresent === "boolean"
          ? metadataParsed.value.settlementPresent
          : null;
    }
  }

  const stage = traceBronzeArtifactStage({
    stageId: "import-result",
    path: importResultPath,
    io,
    marketTicker: config.marketTicker,
    extraMetadata: {
      metadataPath: io.fileExists(metadataPath) ? metadataPath : null,
      metadataSettlementPresent,
    },
  });

  if (
    metadataSettlementPresent !== null
    && stage.settlementPresent !== null
    && metadataSettlementPresent !== stage.settlementPresent
  ) {
    return {
      ...stage,
      warnings: [
        ...stage.warnings,
        `metadata.json settlementPresent (${metadataSettlementPresent}) disagrees with bronze settlement records (${stage.settlementPresent}).`,
      ],
    };
  }

  return stage;
}

function traceFixture(
  config: TraceContext,
  io: SettlementTraceIo,
): SettlementTraceStage {
  return traceBronzeArtifactStage({
    stageId: "fixture",
    path: buildMarketArtifactPath(
      config.fixturesDir,
      config.seriesTicker,
      config.marketTicker,
      FIXTURE_FILENAME,
    ),
    io,
    marketTicker: config.marketTicker,
  });
}

function traceRegistry(
  config: TraceContext,
  io: SettlementTraceIo,
): SettlementTraceStage {
  const path = posix.join(
    config.registryDir,
    config.seriesTicker,
    SERIES_REGISTRY_FILENAME,
  );

  if (!io.fileExists(path)) {
    return createStage("registry", {
      status: "missing",
      path,
      settlementPresent: null,
      settlementValue: null,
      settlementFieldPath: null,
      marketTickerMatched: null,
      warnings: ["dataset-registry.json not found for series."],
      metadata: {},
    });
  }

  const parsed = safeParseJson(io.readFile(path), SERIES_REGISTRY_FILENAME);
  if (!parsed.ok) {
    return createStage("registry", {
      status: "malformed",
      path,
      settlementPresent: null,
      settlementValue: null,
      settlementFieldPath: null,
      marketTickerMatched: null,
      warnings: [parsed.error],
      metadata: {},
    });
  }

  if (!isRecord(parsed.value) || !Array.isArray(parsed.value.markets)) {
    return createStage("registry", {
      status: "malformed",
      path,
      settlementPresent: null,
      settlementValue: null,
      settlementFieldPath: null,
      marketTickerMatched: null,
      warnings: ["Registry document missing markets array."],
      metadata: {},
    });
  }

  const marketEntry = parsed.value.markets.find(
    (entry) =>
      isRecord(entry)
      && readString(entry, "marketTicker") === config.marketTicker,
  );

  if (!marketEntry || !isRecord(marketEntry)) {
    return createStage("registry", {
      status: "missing",
      path,
      settlementPresent: false,
      settlementValue: null,
      settlementFieldPath: "markets[].settlementPresent",
      marketTickerMatched: false,
      warnings: ["Market not listed in dataset registry."],
      metadata: { registryMarketCount: parsed.value.markets.length },
    });
  }

  const settlementPresent =
    typeof marketEntry.settlementPresent === "boolean"
      ? marketEntry.settlementPresent
      : null;

  return createStage("registry", {
    status: "found",
    path,
    settlementPresent,
    settlementValue: null,
    settlementFieldPath: "markets[].settlementPresent",
    marketTickerMatched: true,
    warnings:
      settlementPresent === false
        ? ["Registry marks settlementPresent=false for this market."]
        : [],
    metadata: {
      fixturePath: readString(marketEntry, "fixturePath") ?? null,
      validationStatus: marketEntry.validationStatus ?? null,
    },
  });
}

function listStrategyIds(researchResultsDir: string, io: SettlementTraceIo): string[] {
  if (!io.isDirectory(researchResultsDir)) {
    return [];
  }

  return [...io.readdir(researchResultsDir)]
    .filter((entry) => io.isDirectory(posix.join(researchResultsDir, entry)))
    .sort();
}

function readResearchOutputSettlement(
  outputJson: string,
  outputPath: string,
): {
  replayInput: ReturnType<typeof readSnapshotSettlement> & { snapshotIndex: number | null };
  replaySteps: {
    total: number;
    withSettlement: number;
    fieldPath: string;
    value: string | null;
  };
  strategyId: string | null;
} {
  const rootParsed = safeParseJson(outputJson, outputPath);
  if (!rootParsed.ok || !isRecord(rootParsed.value)) {
    throw new Error(rootParsed.ok ? "research-output root must be an object" : rootParsed.error);
  }

  const dataset = parseNestedJson(rootParsed.value.dataset, "dataset");
  const researchRun = parseNestedJson(rootParsed.value.researchRun, "researchRun");
  const metadata = isRecord(rootParsed.value.metadata) ? rootParsed.value.metadata : null;
  const strategyId = metadata ? readString(metadata, "strategyId") ?? null : null;

  let replayInput = {
    present: false,
    value: null as string | null,
    fieldPath: null as string | null,
    snapshotIndex: null as number | null,
  };

  if (isRecord(dataset) && Array.isArray(dataset.snapshots)) {
    for (let index = 0; index < dataset.snapshots.length; index += 1) {
      const snapshot = dataset.snapshots[index];
      if (!isRecord(snapshot)) {
        continue;
      }

      const settlement = readSnapshotSettlement(snapshot.settlement);
      if (settlement.present) {
        replayInput = {
          ...settlement,
          snapshotIndex: index,
        };
        break;
      }
    }

    if (!replayInput.present && dataset.snapshots.length > 0) {
      replayInput.fieldPath = "dataset.snapshots[].settlement.result";
    }
  }

  let replayStepsTotal = 0;
  let replayStepsWithSettlement = 0;
  let replayStepValue: string | null = null;

  if (isRecord(researchRun)) {
    const backtestResult = parseNestedJson(researchRun.backtestResult, "backtestResult");
    if (isRecord(backtestResult)) {
      const replayResult = backtestResult.replayResult;
      if (isRecord(replayResult) && Array.isArray(replayResult.results)) {
        for (const step of replayResult.results) {
          if (!isRecord(step)) {
            continue;
          }

          replayStepsTotal += 1;
          const sourceSnapshot = step.sourceSnapshot;
          if (!isRecord(sourceSnapshot)) {
            continue;
          }

          const settlement = readSnapshotSettlement(sourceSnapshot.settlement);
          if (settlement.present) {
            replayStepsWithSettlement += 1;
            replayStepValue = settlement.value;
          }
        }
      }
    }
  }

  return {
    replayInput,
    replaySteps: {
      total: replayStepsTotal,
      withSettlement: replayStepsWithSettlement,
      fieldPath: "researchRun.backtestResult.replayResult.results[].sourceSnapshot.settlement.result",
      value: replayStepValue,
    },
    strategyId,
  };
}

function buildStrategySummaries(
  config: TraceContext,
  io: SettlementTraceIo,
): SettlementTraceStrategySummary[] {
  const summaries: SettlementTraceStrategySummary[] = [];

  for (const strategyId of listStrategyIds(config.researchResultsDir, io)) {
    const researchOutputPath = posix.join(
      config.researchResultsDir,
      strategyId,
      config.seriesTicker,
      config.marketTicker,
      RESEARCH_OUTPUT_FILENAME,
    );

    if (!io.fileExists(researchOutputPath)) {
      summaries.push({
        strategyId,
        researchOutputPath: null,
        replayInputSettlementPresent: null,
        replayInputSettlementValue: null,
        replayInputSettlementFieldPath: null,
        replayStepsTotal: 0,
        replayStepsWithSettlement: 0,
        replayStepSettlementFieldPath: null,
        aggregateSummaryPath: posix.join(
          config.researchResultsDir,
          strategyId,
          config.seriesTicker,
          AGGREGATE_SUMMARY_FILENAME,
        ),
        calibrationReportPath: posix.join(
          config.researchResultsDir,
          strategyId,
          config.seriesTicker,
          CALIBRATION_REPORT_FILENAME,
        ),
        calibrationSettlementOutcome: null,
      });
      continue;
    }

    try {
      const settlement = readResearchOutputSettlement(
        io.readFile(researchOutputPath),
        researchOutputPath,
      );
      const calibrationReportPath = posix.join(
        config.researchResultsDir,
        strategyId,
        config.seriesTicker,
        CALIBRATION_REPORT_FILENAME,
      );
      let calibrationSettlementOutcome: number | null = null;

      if (io.fileExists(calibrationReportPath)) {
        const calibrationParsed = safeParseJson(
          io.readFile(calibrationReportPath),
          CALIBRATION_REPORT_FILENAME,
        );
        if (calibrationParsed.ok && isRecord(calibrationParsed.value) && Array.isArray(calibrationParsed.value.markets)) {
          const marketEntry = calibrationParsed.value.markets.find(
            (entry) =>
              isRecord(entry)
              && readString(entry, "marketTicker") === config.marketTicker,
          );
          if (marketEntry && isRecord(marketEntry)) {
            const outcome = marketEntry.settlementOutcome;
            calibrationSettlementOutcome =
              outcome === 0 || outcome === 1 ? outcome : null;
          }
        }
      }

      summaries.push({
        strategyId,
        researchOutputPath,
        replayInputSettlementPresent: settlement.replayInput.present,
        replayInputSettlementValue: settlement.replayInput.value,
        replayInputSettlementFieldPath: settlement.replayInput.snapshotIndex === null
          ? settlement.replayInput.fieldPath
          : `dataset.snapshots[${settlement.replayInput.snapshotIndex}].settlement.result`,
        replayStepsTotal: settlement.replaySteps.total,
        replayStepsWithSettlement: settlement.replaySteps.withSettlement,
        replayStepSettlementFieldPath: settlement.replaySteps.fieldPath,
        aggregateSummaryPath: posix.join(
          config.researchResultsDir,
          strategyId,
          config.seriesTicker,
          AGGREGATE_SUMMARY_FILENAME,
        ),
        calibrationReportPath,
        calibrationSettlementOutcome,
      });
    } catch {
      summaries.push({
        strategyId,
        researchOutputPath,
        replayInputSettlementPresent: null,
        replayInputSettlementValue: null,
        replayInputSettlementFieldPath: null,
        replayStepsTotal: 0,
        replayStepsWithSettlement: 0,
        replayStepSettlementFieldPath: null,
        aggregateSummaryPath: posix.join(
          config.researchResultsDir,
          strategyId,
          config.seriesTicker,
          AGGREGATE_SUMMARY_FILENAME,
        ),
        calibrationReportPath: posix.join(
          config.researchResultsDir,
          strategyId,
          config.seriesTicker,
          CALIBRATION_REPORT_FILENAME,
        ),
        calibrationSettlementOutcome: null,
      });
    }
  }

  return summaries.sort((left, right) => left.strategyId.localeCompare(right.strategyId));
}

function traceResearchOutputReplayInput(
  config: TraceContext,
  strategySummaries: readonly SettlementTraceStrategySummary[],
): SettlementTraceStage {
  const withOutput = strategySummaries.filter((summary) => summary.researchOutputPath !== null);

  if (withOutput.length === 0) {
    return createStage("research-output-replay-input", {
      status: "missing",
      path: posix.join(
        config.researchResultsDir,
        `{strategyId}`,
        config.seriesTicker,
        config.marketTicker,
        RESEARCH_OUTPUT_FILENAME,
      ),
      settlementPresent: false,
      settlementValue: null,
      settlementFieldPath: "dataset.snapshots[].settlement.result",
      marketTickerMatched: null,
      warnings: ["No research-output.json files found for this market."],
      metadata: { strategyCount: strategySummaries.length },
    });
  }

  const presentSummaries = withOutput.filter(
    (summary) => summary.replayInputSettlementPresent === true,
  );
  const primary = presentSummaries[0] ?? withOutput[0];

  return createStage("research-output-replay-input", {
    status: "found",
    path: primary?.researchOutputPath ?? null,
    settlementPresent: presentSummaries.length > 0,
    settlementValue: primary?.replayInputSettlementValue ?? null,
    settlementFieldPath: primary?.replayInputSettlementFieldPath ?? null,
    marketTickerMatched: true,
    warnings:
      presentSummaries.length === 0
        ? ["Research outputs exist but none include snapshot settlement."]
        : presentSummaries.length < withOutput.length
          ? [
              `${withOutput.length - presentSummaries.length} strategy output(s) missing snapshot settlement.`,
            ]
          : [],
    metadata: {
      strategiesInspected: withOutput.length,
      strategiesWithSettlement: presentSummaries.length,
    },
  });
}

function traceResearchOutputReplaySteps(
  config: TraceContext,
  strategySummaries: readonly SettlementTraceStrategySummary[],
): SettlementTraceStage {
  const withOutput = strategySummaries.filter((summary) => summary.researchOutputPath !== null);

  if (withOutput.length === 0) {
    return createStage("research-output-replay-steps", {
      status: "missing",
      path: null,
      settlementPresent: false,
      settlementValue: null,
      settlementFieldPath:
        "researchRun.backtestResult.replayResult.results[].sourceSnapshot.settlement.result",
      marketTickerMatched: null,
      warnings: ["No research-output.json files found for replay step inspection."],
      metadata: {},
    });
  }

  const withStepSettlement = withOutput.filter(
    (summary) => summary.replayStepsWithSettlement > 0,
  );
  const primary = withStepSettlement[0] ?? withOutput[0];

  return createStage("research-output-replay-steps", {
    status: "found",
    path: primary?.researchOutputPath ?? null,
    settlementPresent: withStepSettlement.length > 0,
    settlementValue: primary?.replayInputSettlementValue ?? null,
    settlementFieldPath: primary?.replayStepSettlementFieldPath ?? null,
    marketTickerMatched: true,
    warnings:
      withStepSettlement.length === 0
        ? ["Replay steps exist but none carry sourceSnapshot.settlement."]
        : [],
    metadata: {
      strategiesInspected: withOutput.length,
      strategiesWithReplayStepSettlement: withStepSettlement.length,
      replayStepsTotal: withOutput.reduce((total, summary) => total + summary.replayStepsTotal, 0),
      replayStepsWithSettlement: withOutput.reduce(
        (total, summary) => total + summary.replayStepsWithSettlement,
        0,
      ),
    },
  });
}

function traceAggregateSummary(
  config: TraceContext,
  strategySummaries: readonly SettlementTraceStrategySummary[],
  io: SettlementTraceIo,
): SettlementTraceStage {
  const paths = strategySummaries
    .map((summary) => summary.aggregateSummaryPath)
    .filter((path): path is string => path !== null);
  const existingPaths = paths.filter((path) => io.fileExists(path));
  const primaryPath = existingPaths[0] ?? paths[0] ?? null;

  return createStage("aggregate-summary", {
    status: existingPaths.length > 0 ? "found" : "unavailable",
    path: primaryPath,
    settlementPresent: null,
    settlementValue: null,
    settlementFieldPath: null,
    marketTickerMatched: existingPaths.length > 0 ? true : null,
    warnings: [
      "Aggregate summary does not record settlement; inspect research-output and calibration stages.",
    ],
    metadata: {
      aggregateSummaryPaths: existingPaths,
    },
  });
}

function traceCalibrationReport(
  config: TraceContext,
  strategySummaries: readonly SettlementTraceStrategySummary[],
  io: SettlementTraceIo,
): SettlementTraceStage {
  const reports = strategySummaries
    .map((summary) => ({
      strategyId: summary.strategyId,
      path: summary.calibrationReportPath,
      outcome: summary.calibrationSettlementOutcome,
    }))
    .filter((entry) => entry.path !== null);

  const existing = reports.filter(
    (entry) => entry.path !== null && io.fileExists(entry.path),
  );

  if (existing.length === 0) {
    return createStage("calibration-report", {
      status: reports.length === 0 ? "unavailable" : "missing",
      path: reports[0]?.path ?? null,
      settlementPresent: null,
      settlementValue: null,
      settlementFieldPath: "markets[].settlementOutcome",
      marketTickerMatched: null,
      warnings: ["No calibration-report.json found for this market's strategy/series."],
      metadata: { strategyCount: strategySummaries.length },
    });
  }

  const withOutcome = existing.filter((entry) => entry.outcome === 0 || entry.outcome === 1);
  const primary = withOutcome[0] ?? existing[0];

  return createStage("calibration-report", {
    status: "found",
    path: primary?.path ?? null,
    settlementPresent: withOutcome.length > 0,
    settlementValue:
      primary?.outcome === 1 ? "yes" : primary?.outcome === 0 ? "no" : null,
    settlementFieldPath: "markets[].settlementOutcome",
    marketTickerMatched: true,
    warnings:
      withOutcome.length === 0
        ? ["Calibration report exists but settlementOutcome is null for this market."]
        : [],
    metadata: {
      strategiesWithReport: existing.length,
      strategiesWithSettlementOutcome: withOutcome.length,
    },
  });
}

function traceMispricingAtlas(
  config: TraceContext,
  io: SettlementTraceIo,
): SettlementTraceStage {
  const path = posix.join(config.researchResultsDir, MISPRICING_ATLAS_FILENAME);

  if (!io.fileExists(path)) {
    return createStage("mispricing-atlas", {
      status: "unavailable",
      path,
      settlementPresent: null,
      settlementValue: null,
      settlementFieldPath: null,
      marketTickerMatched: null,
      warnings: ["mispricing-atlas.json not found."],
      metadata: {},
    });
  }

  const parsed = safeParseJson(io.readFile(path), MISPRICING_ATLAS_FILENAME);
  if (!parsed.ok) {
    return createStage("mispricing-atlas", {
      status: "malformed",
      path,
      settlementPresent: null,
      settlementValue: null,
      settlementFieldPath: null,
      marketTickerMatched: null,
      warnings: [parsed.error],
      metadata: {},
    });
  }

  if (!isRecord(parsed.value)) {
    return createStage("mispricing-atlas", {
      status: "malformed",
      path,
      settlementPresent: null,
      settlementValue: null,
      settlementFieldPath: null,
      marketTickerMatched: null,
      warnings: ["mispricing-atlas root must be an object."],
      metadata: {},
    });
  }

  const warnings = Array.isArray(parsed.value.warnings) ? parsed.value.warnings : [];
  const marketWarnings = warnings.filter(
    (warning) =>
      isRecord(warning)
      && warning.code === "missing-settlement"
      && readString(warning, "marketTicker") === config.marketTicker,
  );
  const sampleCounts = isRecord(parsed.value.sampleCounts) ? parsed.value.sampleCounts : null;
  const skippedMissingSettlement =
    sampleCounts && typeof sampleCounts.skippedMissingSettlement === "number"
      ? sampleCounts.skippedMissingSettlement
      : null;

  return createStage("mispricing-atlas", {
    status: "found",
    path,
    settlementPresent: marketWarnings.length === 0 ? null : false,
    settlementValue: null,
    settlementFieldPath: "warnings[].code=missing-settlement",
    marketTickerMatched: true,
    warnings:
      marketWarnings.length > 0
        ? [`Atlas recorded missing-settlement warning for ${config.marketTicker}.`]
        : skippedMissingSettlement === null
          ? []
          : [`Atlas skippedMissingSettlement total: ${skippedMissingSettlement}.`],
    metadata: {
      marketMissingSettlementWarnings: marketWarnings.length,
      skippedMissingSettlement,
    },
  });
}

function stageExpectsSettlement(stageId: SettlementTraceStageId): boolean {
  return stageId !== "import-config" && stageId !== "aggregate-summary";
}

function detectRegression(
  stages: readonly SettlementTraceStage[],
): SettlementTraceStageId | null {
  let lastPresent: boolean | null = null;

  for (const stage of stages) {
    if (!stageExpectsSettlement(stage.stageId)) {
      continue;
    }

    if (stage.status !== "found") {
      continue;
    }

    if (stage.settlementPresent === true) {
      lastPresent = true;
      continue;
    }

    if (stage.settlementPresent === false && lastPresent === true) {
      return stage.stageId;
    }
  }

  return null;
}

function inferRootCause(options: {
  stages: readonly SettlementTraceStage[];
  firstMissingStage: SettlementTraceStageId | null;
  regressionStage: SettlementTraceStageId | null;
}): { likelyRootCause: string; recommendedNextAction: string } {
  const { firstMissingStage, regressionStage, stages } = options;

  if (regressionStage) {
    return {
      likelyRootCause: `Settlement was present upstream but missing at ${regressionStage}.`,
      recommendedNextAction: `Inspect artifacts at ${regressionStage} and the preceding stage to find where settlement was dropped.`,
    };
  }

  if (!firstMissingStage) {
    return {
      likelyRootCause: "Settlement appears present across all settlement-bearing stages.",
      recommendedNextAction: "If downstream research still skips settlement, re-run calibration/mispricing atlas and compare strategySummaries.",
    };
  }

  switch (firstMissingStage) {
    case "import-config":
      return {
        likelyRootCause: "Import config is missing; market may not have been discovered or configured for import.",
        recommendedNextAction: "Run discovery and discovery:import-configs for this ticker, then re-import.",
      };
    case "import-result":
      return {
        likelyRootCause: "Settlement was not captured in the bronze import result.",
        recommendedNextAction: "Re-run historical import for this market and verify Kalshi settlement API returned payload.result.",
      };
    case "fixture":
      return {
        likelyRootCause: "Fixture build did not retain settlement bronze records from import.",
        recommendedNextAction: "Rebuild fixtures from import-result.json and confirm kalshi.historical.settlement bronze record exists.",
      };
    case "registry":
      return {
        likelyRootCause: "Market is absent from or flagged without settlement in the research dataset registry.",
        recommendedNextAction: "Run research:registry and inspect dataset-registry.json entry for settlementPresent.",
      };
    case "research-output-replay-input":
      return {
        likelyRootCause: "Research output dataset snapshots do not include settlement even though upstream fixture/registry may.",
        recommendedNextAction: "Re-run research sweep for this market and inspect dataset.snapshots[].settlement in research-output.json.",
      };
    case "research-output-replay-steps":
      return {
        likelyRootCause: "Replay steps do not carry sourceSnapshot.settlement into research output.",
        recommendedNextAction: "Inspect researchRun.backtestResult.replayResult.results[].sourceSnapshot.settlement in research-output.json.",
      };
    case "calibration-report":
      return {
        likelyRootCause: "Calibration report lacks settlementOutcome for this market.",
        recommendedNextAction: "Run research:calibration after confirming research-output settlement, then inspect markets[].settlementOutcome.",
      };
    case "mispricing-atlas":
      return {
        likelyRootCause: "Mispricing atlas recorded a missing-settlement warning for this market.",
        recommendedNextAction: "Fix upstream research-output settlement, then rebuild mispricing atlas.",
      };
    default:
      break;
  }

  const stage = stages.find((entry) => entry.stageId === firstMissingStage);
  return {
    likelyRootCause: stage
      ? `Settlement gap detected at ${firstMissingStage} (${stage.status}).`
      : "Settlement gap detected in pipeline trace.",
    recommendedNextAction: "Inspect the first failing stage path listed in the trace report.",
  };
}

function resolveFirstMissingStage(
  stages: readonly SettlementTraceStage[],
): SettlementTraceStageId | null {
  for (const stageId of SETTLEMENT_TRACE_STAGE_ORDER) {
    const stage = stages.find((entry) => entry.stageId === stageId);
    if (!stage) {
      continue;
    }

    if (stage.status === "missing" || stage.status === "malformed") {
      return stageId;
    }

    if (!stageExpectsSettlement(stageId)) {
      continue;
    }

    if (stage.settlementPresent === false) {
      return stageId;
    }

    if (
      stage.stageId === "mispricing-atlas"
      && stage.warnings.some((warning) => warning.includes("missing-settlement"))
    ) {
      return stageId;
    }
  }

  return null;
}

/** Builds a deterministic settlement trace report for one market ticker. */
export function buildSettlementTraceReport(
  input: BuildSettlementTraceReportInput,
): SettlementTraceReport {
  const seriesTicker = resolveSeriesTicker(input.config.marketTicker);
  const traceConfig: TraceContext = {
    ...input.config,
    seriesTicker,
  };

  const strategySummaries = buildStrategySummaries(traceConfig, input.io);

  const stages: SettlementTraceStage[] = [
    traceImportConfig(traceConfig, input.io),
    traceImportResult(traceConfig, input.io),
    traceFixture(traceConfig, input.io),
    traceRegistry(traceConfig, input.io),
    traceResearchOutputReplayInput(traceConfig, strategySummaries),
    traceResearchOutputReplaySteps(traceConfig, strategySummaries),
    traceAggregateSummary(traceConfig, strategySummaries, input.io),
    traceCalibrationReport(traceConfig, strategySummaries, input.io),
    traceMispricingAtlas(traceConfig, input.io),
  ];

  const regressionStage = detectRegression(stages);
  const firstMissingStage = regressionStage ?? resolveFirstMissingStage(stages);
  const { likelyRootCause, recommendedNextAction } = inferRootCause({
    stages,
    firstMissingStage,
    regressionStage,
  });

  return {
    generatedAt: input.generatedAt,
    marketTicker: input.config.marketTicker,
    seriesTicker,
    outputPath: input.outputPath,
    config: input.config,
    stages,
    strategySummaries,
    firstMissingStage,
    likelyRootCause,
    recommendedNextAction,
  };
}

export function serializeSettlementTraceReport(report: SettlementTraceReport): string {
  return stableStringify(report);
}

export function formatSettlementTraceConsoleSummary(
  report: SettlementTraceReport,
): string {
  const lines = [
    `Settlement trace: ${report.marketTicker}`,
    `Series: ${report.seriesTicker}`,
    `First missing stage: ${report.firstMissingStage ?? "none"}`,
    `Likely root cause: ${report.likelyRootCause}`,
    `Recommended next action: ${report.recommendedNextAction}`,
    "",
    "Stages:",
  ];

  for (const stage of report.stages) {
    lines.push(
      `- ${stage.stageId}: ${stage.status} | settlementPresent=${stage.settlementPresent} | path=${stage.path ?? "n/a"}`,
    );
  }

  if (report.strategySummaries.length > 0) {
    lines.push("", "Strategy summaries:");
    for (const summary of report.strategySummaries) {
      lines.push(
        `- ${summary.strategyId}: replayInput=${summary.replayInputSettlementPresent} replaySteps=${summary.replayStepsWithSettlement}/${summary.replayStepsTotal} calibrationOutcome=${summary.calibrationSettlementOutcome ?? "null"}`,
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

export function buildDefaultSettlementTraceOutputPath(marketTicker: string): string {
  return posix.join("data", "audits", `settlement-trace-${marketTicker}.json`);
}

export function buildSettlementTraceConfigFromTicker(
  marketTicker: string,
  overrides: Partial<Omit<SettlementTraceConfig, "marketTicker">> = {},
): SettlementTraceConfig {
  return {
    marketTicker,
    importsDir: overrides.importsDir ?? DEFAULT_SETTLEMENT_TRACE_IMPORTS_DIR,
    importConfigsDir:
      overrides.importConfigsDir ?? DEFAULT_SETTLEMENT_TRACE_IMPORT_CONFIGS_DIR,
    fixturesDir: overrides.fixturesDir ?? DEFAULT_SETTLEMENT_TRACE_FIXTURES_DIR,
    registryDir: overrides.registryDir ?? DEFAULT_SETTLEMENT_TRACE_REGISTRY_DIR,
    researchResultsDir:
      overrides.researchResultsDir ?? DEFAULT_SETTLEMENT_TRACE_RESEARCH_RESULTS_DIR,
  };
}
