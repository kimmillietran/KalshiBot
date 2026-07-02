import { stableStringify } from "@/lib/trading/config/hashConfig";

import { buildExperimentRecordOutputPath } from "./experimentRegistryPaths";
import { buildExperimentId } from "./hashExperimentIdentity";
import { parseExperimentResearchDocument } from "./parseExperimentResearchOutput";
import {
  resolveCalibrationReportPath,
  resolveFixtureHash,
  resolveLeaderboardSnapshot,
} from "./resolveExperimentArtifacts";
import {
  ExperimentRegistryError,
  ExperimentRegistryErrorCode,
  type ExperimentRecord,
  type ExperimentRegistryIo,
  type ParsedExperimentResearchDocument,
  type RegisterExperimentsInput,
  type RegisterExperimentsResult,
  type ScannedExperimentResearchOutput,
} from "./experimentRegistryTypes";
import { scanExperimentResearchOutputs } from "./scanExperimentResearchOutputs";

type ExperimentDraft = {
  document: ParsedExperimentResearchDocument;
  fixtureHash: string | null;
  calibrationReportPath: string | null;
  leaderboardSnapshot: ExperimentRecord["leaderboardSnapshot"];
};

function sortLocations(locations: readonly string[]): string[] {
  return [...new Set(locations)].sort((left, right) => left.localeCompare(right));
}

function buildExperimentRecord(
  draft: ExperimentDraft,
  input: RegisterExperimentsInput,
  gitCommit: string | null,
): ExperimentRecord {
  const { document, fixtureHash, calibrationReportPath, leaderboardSnapshot } = draft;
  const experimentId = buildExperimentId({
    strategyId: document.strategyId,
    strategyConfig: document.strategyConfig,
    costModelConfig: document.costModelConfig,
    datasetHash: document.datasetHash,
    fixtureHash,
    engineVersion: document.engineVersion,
  });

  return {
    experimentId,
    runId: document.runId,
    strategyId: document.strategyId,
    strategyConfig: document.strategyConfig,
    costModelConfig: document.costModelConfig,
    datasetHash: document.datasetHash,
    fixtureHash,
    engineVersion: document.engineVersion,
    gitCommit,
    timestamp: document.timestamp,
    seriesTicker: document.seriesTicker,
    marketTicker: document.marketTicker,
    researchOutputLocations: [document.outputPath],
    calibrationReportLocations: calibrationReportPath ? [calibrationReportPath] : [],
    leaderboardSnapshot,
    registeredAt: input.registeredAt,
  };
}

function mergeExperimentRecords(
  left: ExperimentRecord,
  right: ExperimentRecord,
): ExperimentRecord {
  if (left.experimentId !== right.experimentId) {
    throw new ExperimentRegistryError(
      "Cannot merge experiment records with different experiment IDs",
      ExperimentRegistryErrorCode.INVALID_METADATA,
      { experimentId: left.experimentId },
    );
  }

  return {
    ...left,
    researchOutputLocations: sortLocations([
      ...left.researchOutputLocations,
      ...right.researchOutputLocations,
    ]),
    calibrationReportLocations: sortLocations([
      ...left.calibrationReportLocations,
      ...right.calibrationReportLocations,
    ]),
    leaderboardSnapshot: left.leaderboardSnapshot ?? right.leaderboardSnapshot,
    registeredAt: left.registeredAt,
  };
}

function canonicalizeExperimentRecord(record: ExperimentRecord): string {
  return stableStringify({
    experimentId: record.experimentId,
    runId: record.runId,
    strategyId: record.strategyId,
    strategyConfig: record.strategyConfig,
    costModelConfig: record.costModelConfig,
    datasetHash: record.datasetHash,
    fixtureHash: record.fixtureHash,
    engineVersion: record.engineVersion,
    gitCommit: record.gitCommit,
    timestamp: record.timestamp,
    seriesTicker: record.seriesTicker,
    marketTicker: record.marketTicker,
    researchOutputLocations: record.researchOutputLocations,
    calibrationReportLocations: record.calibrationReportLocations,
    leaderboardSnapshot: record.leaderboardSnapshot,
  });
}

function assertImmutableWrite(
  outputPath: string,
  nextRecord: ExperimentRecord,
  io: ExperimentRegistryIo,
): "write" | "skip" {
  if (!io.fileExists(outputPath)) {
    return "write";
  }

  let existing: unknown;
  try {
    existing = JSON.parse(io.readFile(outputPath));
  } catch {
    throw new ExperimentRegistryError(
      `Existing experiment record is invalid JSON: ${outputPath}`,
      ExperimentRegistryErrorCode.INVALID_METADATA,
      { experimentId: nextRecord.experimentId },
    );
  }

  if (!existing || typeof existing !== "object") {
    throw new ExperimentRegistryError(
      `Existing experiment record must be a plain object: ${outputPath}`,
      ExperimentRegistryErrorCode.INVALID_METADATA,
      { experimentId: nextRecord.experimentId },
    );
  }

  const existingCanonical = canonicalizeExperimentRecord(existing as ExperimentRecord);
  const nextCanonical = canonicalizeExperimentRecord(nextRecord);

  if (existingCanonical === nextCanonical) {
    return "skip";
  }

  throw new ExperimentRegistryError(
    `Experiment record already exists and is immutable: ${outputPath}`,
    ExperimentRegistryErrorCode.IMMUTABLE_RECORD_CONFLICT,
    { experimentId: nextRecord.experimentId },
  );
}

function buildDrafts(
  scanned: readonly ScannedExperimentResearchOutput[],
  input: RegisterExperimentsInput,
  io: ExperimentRegistryIo,
): ExperimentDraft[] {
  const leaderboardCache = new Map<string, ExperimentRecord["leaderboardSnapshot"]>();
  const calibrationCache = new Map<string, string | null>();

  return scanned.map((entry) => {
    const document = parseExperimentResearchDocument(entry.outputJson, entry.outputPath, {
      strategyId: entry.strategyId,
      seriesTicker: entry.seriesTicker,
      marketTicker: entry.marketTicker,
    });

    const fixtureHash = resolveFixtureHash(
      input.fixturesRoot,
      document.seriesTicker,
      document.marketTicker,
      io,
    );

    const calibrationKey = `${document.strategyId}/${document.seriesTicker}`;
    let calibrationReportPath = calibrationCache.get(calibrationKey);
    if (calibrationReportPath === undefined) {
      calibrationReportPath = resolveCalibrationReportPath(
        input.researchRoot,
        document.strategyId,
        document.seriesTicker,
        io,
      );
      calibrationCache.set(calibrationKey, calibrationReportPath);
    }

    let leaderboardSnapshot = leaderboardCache.get(document.seriesTicker);
    if (leaderboardSnapshot === undefined) {
      leaderboardSnapshot = resolveLeaderboardSnapshot(
        input.researchRoot,
        document.seriesTicker,
        io,
      );
      leaderboardCache.set(document.seriesTicker, leaderboardSnapshot);
    }

    return {
      document,
      fixtureHash,
      calibrationReportPath,
      leaderboardSnapshot,
    };
  });
}

function groupDraftsIntoRecords(
  drafts: readonly ExperimentDraft[],
  input: RegisterExperimentsInput,
  gitCommit: string | null,
): ExperimentRecord[] {
  const grouped = new Map<string, ExperimentRecord>();

  for (const draft of drafts) {
    const record = buildExperimentRecord(draft, input, gitCommit);
    const existing = grouped.get(record.experimentId);
    grouped.set(
      record.experimentId,
      existing ? mergeExperimentRecords(existing, record) : record,
    );
  }

  return [...grouped.values()].sort((left, right) =>
    left.experimentId.localeCompare(right.experimentId),
  );
}

export function serializeExperimentRecord(record: ExperimentRecord): string {
  return stableStringify(record);
}

export function registerExperiments(
  input: RegisterExperimentsInput,
  io: ExperimentRegistryIo,
): RegisterExperimentsResult {
  const scanned = scanExperimentResearchOutputs(input.researchRoot, io);

  if (scanned.length === 0) {
    throw new ExperimentRegistryError(
      "No research outputs found for experiment registration",
      ExperimentRegistryErrorCode.EMPTY_DATASET,
    );
  }

  const gitCommit =
    input.gitCommit
    ?? io.resolveGitCommit?.()
    ?? null;

  const drafts = buildDrafts(scanned, input, io);
  const records = groupDraftsIntoRecords(drafts, input, gitCommit);

  let registeredCount = 0;
  let skippedCount = 0;
  const outputPaths: string[] = [];

  for (const record of records) {
    const outputPath = buildExperimentRecordOutputPath(
      input.experimentsRoot,
      record.experimentId,
    );
    const action = assertImmutableWrite(outputPath, record, io);

    if (action === "write") {
      io.writeFile(outputPath, serializeExperimentRecord(record));
      registeredCount += 1;
    } else {
      skippedCount += 1;
    }

    outputPaths.push(outputPath);
  }

  return {
    experimentsRoot: input.experimentsRoot,
    registeredCount,
    skippedCount,
    experimentIds: records.map((record) => record.experimentId),
    outputPaths,
  };
}
