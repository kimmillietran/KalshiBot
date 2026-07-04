import { buildExperimentRecord } from "./buildExperimentRecord";
import { compareExperimentPair, parseExperimentRecord } from "./compareExperiments";
import {
  ResearchExperimentManagerError,
  ResearchExperimentManagerErrorCode,
  type RegisterResearchExperimentInput,
  type RegisterResearchExperimentResult,
  type ResearchExperimentIndex,
  type ResearchExperimentIndexEntry,
  type ResearchExperimentRecord,
} from "./experimentManagerTypes";
import { loadExperimentInputs } from "./loadExperimentInputs";

function parseExistingIndex(json: string): ResearchExperimentIndex | null {
  try {
    return JSON.parse(json) as ResearchExperimentIndex;
  } catch {
    return null;
  }
}

function loadExistingRecord(
  io: RegisterResearchExperimentInput["io"],
  entry: ResearchExperimentIndexEntry,
): ResearchExperimentRecord | null {
  if (!entry.present || !io.fileExists(entry.recordPath)) {
    return null;
  }

  try {
    return parseExperimentRecord(io.readFile(entry.recordPath));
  } catch {
    return null;
  }
}

function refreshIndexEntries(
  io: RegisterResearchExperimentInput["io"],
  entries: readonly ResearchExperimentIndexEntry[],
): ResearchExperimentIndexEntry[] {
  return entries.map((entry) => ({
    ...entry,
    present: io.fileExists(entry.recordPath),
  }));
}

function appendIndexEntry(
  existing: ResearchExperimentIndex | null,
  record: ResearchExperimentRecord,
  io: RegisterResearchExperimentInput["io"],
): ResearchExperimentIndexEntry[] {
  const previousEntries = existing
    ? refreshIndexEntries(io, existing.experiments)
    : [];

  const nextEntry: ResearchExperimentIndexEntry = {
    experimentId: record.experimentId,
    timestamp: record.timestamp,
    recordPath: record.recordPath,
    present: true,
  };

  if (previousEntries.some((entry) => entry.experimentId === record.experimentId)) {
    return previousEntries;
  }

  return [...previousEntries, nextEntry];
}

export function registerResearchExperiment(
  input: RegisterResearchExperimentInput,
): RegisterResearchExperimentResult {
  const inputs = loadExperimentInputs(input.io, input.inputPaths);
  const record = buildExperimentRecord(input, inputs);

  if (input.io.fileExists(record.recordPath)) {
    throw new ResearchExperimentManagerError(
      `Experiment record already exists and is immutable: ${record.recordPath}`,
      ResearchExperimentManagerErrorCode.IMMUTABLE_RECORD_CONFLICT,
      { experimentId: record.experimentId },
    );
  }

  const existingIndex = input.io.fileExists(input.indexOutputPath)
    ? parseExistingIndex(input.io.readFile(input.indexOutputPath))
    : null;

  const experiments = appendIndexEntry(existingIndex, record, input.io);
  const previousEntry =
    experiments.length >= 2 ? experiments[experiments.length - 2] : null;
  const previousRecord = previousEntry
    ? loadExistingRecord(input.io, previousEntry)
    : null;

  const latestComparison =
    previousRecord !== null
      ? compareExperimentPair(previousRecord, record, {
          baselinePresent: previousEntry?.present ?? false,
          comparePresent: true,
        })
      : null;

  const index: ResearchExperimentIndex = {
    generatedAt: input.generatedAt,
    outputPath: input.indexOutputPath,
    htmlOutputPath: input.htmlOutputPath,
    latestExperimentId: record.experimentId,
    experiments,
    latestComparison,
  };

  return {
    record,
    index,
    indexOutputPath: input.indexOutputPath,
    htmlOutputPath: input.htmlOutputPath,
  };
}

export function loadExperimentRecordsFromIndex(
  io: RegisterResearchExperimentInput["io"],
  index: ResearchExperimentIndex,
): ResearchExperimentRecord[] {
  const records: ResearchExperimentRecord[] = [];

  for (const entry of index.experiments) {
    const record = loadExistingRecord(io, entry);
    if (record) {
      records.push(record);
    }
  }

  return records;
}

export function serializeExperimentRecord(record: ResearchExperimentRecord): string {
  return JSON.stringify(record, null, 2);
}

export function serializeExperimentIndex(index: ResearchExperimentIndex): string {
  return JSON.stringify(index, null, 2);
}
