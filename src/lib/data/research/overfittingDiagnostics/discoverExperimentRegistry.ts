import { posix } from "node:path";

import { stableStringify } from "@/lib/trading/config/hashConfig";

import { normalizeRootPath } from "../aggregation/researchAggregatePaths";
import {
  DEFAULT_EXPERIMENTS_ROOT,
  EXPERIMENT_RECORD_FILENAME,
  type ExperimentRecord,
} from "../experiment-registry/experimentRegistryTypes";

import type {
  ExperimentRegistryDiagnostics,
  OverfittingDiagnosticsIo,
  ParsedExperimentRecord,
} from "./overfittingDiagnosticsTypes";

function hashStrategyConfig(
  strategyId: string,
  strategyConfig: Record<string, unknown>,
): string {
  return stableStringify({ strategyId, strategyConfig });
}

function parseExperimentRecordJson(
  json: string,
  sourcePath: string,
): ParsedExperimentRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error(`Invalid experiment record JSON: ${sourcePath}`);
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as ExperimentRecord).experimentId !== "string" ||
    typeof (parsed as ExperimentRecord).strategyId !== "string" ||
    typeof (parsed as ExperimentRecord).strategyConfig !== "object" ||
    (parsed as ExperimentRecord).strategyConfig === null
  ) {
    throw new Error(`Incomplete experiment record: ${sourcePath}`);
  }

  const record = parsed as ExperimentRecord;
  return {
    experimentId: record.experimentId,
    strategyId: record.strategyId,
    strategyConfig: record.strategyConfig,
  };
}

function collectExperimentRecords(
  experimentsRoot: string,
  io: OverfittingDiagnosticsIo,
): { records: ParsedExperimentRecord[]; warnings: string[] } {
  const warnings: string[] = [];
  const records: ParsedExperimentRecord[] = [];

  if (!io.fileExists(experimentsRoot) || !io.isDirectory(experimentsRoot)) {
    return { records, warnings };
  }

  const experimentDirs = [...io.readdir(experimentsRoot)].sort();
  for (const experimentDir of experimentDirs) {
    const recordPath = posix.join(
      experimentsRoot,
      experimentDir,
      EXPERIMENT_RECORD_FILENAME,
    );
    if (!io.fileExists(recordPath)) {
      continue;
    }

    try {
      records.push(parseExperimentRecordJson(io.readFile(recordPath), recordPath));
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? error.message
          : `Failed to parse experiment record at ${recordPath}`,
      );
    }
  }

  return { records, warnings };
}

/** Discovers experiment registry records, returning empty when registry is missing. */
export function discoverExperimentRegistry(
  experimentsRoot: string,
  io: OverfittingDiagnosticsIo,
): ExperimentRegistryDiagnostics {
  const normalizedRoot = normalizeRootPath(experimentsRoot);
  const { records, warnings } = collectExperimentRecords(normalizedRoot, io);

  if (!io.fileExists(normalizedRoot) || !io.isDirectory(normalizedRoot)) {
    return {
      available: false,
      experimentCount: 0,
      uniqueConfigCount: 0,
      warnings: [
        `Experiment registry not found at ${normalizedRoot}; registry counts default to zero.`,
      ],
    };
  }

  if (records.length === 0) {
    return {
      available: true,
      experimentCount: 0,
      uniqueConfigCount: 0,
      warnings: [
        ...warnings,
        "Experiment registry directory exists but contains no experiment records.",
      ],
    };
  }

  const uniqueConfigs = new Set(
    records.map((record) => hashStrategyConfig(record.strategyId, record.strategyConfig)),
  );

  return {
    available: true,
    experimentCount: records.length,
    uniqueConfigCount: uniqueConfigs.size,
    warnings,
  };
}

export function resolveConfigCount(input: {
  experimentRegistry: ExperimentRegistryDiagnostics;
  parameterSweepConfigCount: number;
  strategyFamilyCount: number;
}): number {
  if (input.experimentRegistry.uniqueConfigCount > 0) {
    return input.experimentRegistry.uniqueConfigCount;
  }
  if (input.parameterSweepConfigCount > 0) {
    return input.parameterSweepConfigCount;
  }
  return input.strategyFamilyCount;
}

export const DEFAULT_EXPERIMENTS_ROOT_PATH = DEFAULT_EXPERIMENTS_ROOT;
