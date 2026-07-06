import { z } from "zod";

import {
  loadExpansionImportPerformanceAuditInputs,
  parseExpansionImportPerformanceAuditSummaryJson,
} from "@/lib/data/research/expansionImportPerformanceAudit";
import { computeExpansionImportPerformanceMetrics } from "@/lib/data/research/expansionImportPerformanceAudit/computeExpansionImportPerformanceMetrics";

import type {
  ExpansionRunHistoryInputPaths,
  ExpansionRunHistoryIo,
} from "./expansionRunHistoryTypes";
import { ExpansionRunHistoryError } from "./expansionRunHistoryTypes";

const expansionRebuildSummarySchema = z.object({
  generatedAt: z.string().trim().min(1),
  after: z
    .object({
      fixtureCount: z.number().finite().nonnegative().optional(),
      atlasMarketCount: z.number().finite().nonnegative().nullable().optional(),
    })
    .optional(),
});

const experimentIndexSchema = z.object({
  generatedAt: z.string().trim().min(1).optional(),
  experiments: z.array(z.unknown()).optional(),
});

export type LoadedExpansionRunHistoryInputs = {
  summaryPath: string;
  summary: ReturnType<typeof parseExpansionImportPerformanceAuditSummaryJson>;
  performanceMetrics: ReturnType<typeof computeExpansionImportPerformanceMetrics>;
  resultingFixtureCount: number | null;
  resultingAtlasMarketCount: number | null;
  discoverySegmentsCacheHit: number;
  discoverySegmentsRefreshed: number;
  estimatedDiscoverySavingsMs: number;
  cacheEnabled: boolean;
  discoverySegmentsCorrupt: number;
  experimentSnapshotCount: number | null;
};

function parseOptionalJson<T>(
  path: string,
  json: string,
  schema: z.ZodType<T>,
): T | null {
  try {
    const parsed = JSON.parse(json);
    const result = schema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** Loads expansion run history inputs from disk without mutating import execution. */
export function loadExpansionRunHistoryInputs(
  io: ExpansionRunHistoryIo,
  inputPaths: ExpansionRunHistoryInputPaths,
): LoadedExpansionRunHistoryInputs {
  if (!io.fileExists(inputPaths.expansionImportSummaryPath)) {
    throw new ExpansionRunHistoryError(
      `Required input not found: ${inputPaths.expansionImportSummaryPath}`,
    );
  }

  const auditInputs = loadExpansionImportPerformanceAuditInputs(
    {
      outputPath: inputPaths.historyPath,
      htmlOutputPath: inputPaths.historyPath.replace(/\.json$/, ".html"),
      expansionImportSummaryPath: inputPaths.expansionImportSummaryPath,
      expansionImportCheckpointPath: inputPaths.expansionImportCheckpointPath,
      importConfigsDir: inputPaths.importConfigsDir,
      importsDir: inputPaths.importsDir,
    },
    io,
  );

  const performanceMetrics = computeExpansionImportPerformanceMetrics({
    summary: auditInputs.summary,
    checkpoint: auditInputs.checkpoint,
    importsDirStats: auditInputs.importsDirStats,
  });

  let resultingFixtureCount: number | null = null;
  let resultingAtlasMarketCount: number | null = null;
  if (io.fileExists(inputPaths.expansionRebuildSummaryPath)) {
    const rebuild = parseOptionalJson(
      inputPaths.expansionRebuildSummaryPath,
      io.readFile(inputPaths.expansionRebuildSummaryPath),
      expansionRebuildSummarySchema,
    );
    resultingFixtureCount = rebuild?.after?.fixtureCount ?? null;
    resultingAtlasMarketCount = rebuild?.after?.atlasMarketCount ?? null;
  }

  const { discoveryDiagnostics } = auditInputs.summary;

  let experimentSnapshotCount: number | null = null;
  if (io.fileExists(inputPaths.experimentIndexPath)) {
    const experimentIndex = parseOptionalJson(
      inputPaths.experimentIndexPath,
      io.readFile(inputPaths.experimentIndexPath),
      experimentIndexSchema,
    );
    experimentSnapshotCount = experimentIndex?.experiments?.length ?? null;
  }

  return {
    summaryPath: inputPaths.expansionImportSummaryPath,
    summary: auditInputs.summary,
    performanceMetrics,
    resultingFixtureCount,
    resultingAtlasMarketCount,
    discoverySegmentsCacheHit: discoveryDiagnostics.discoverySegmentsCacheHit,
    discoverySegmentsRefreshed: discoveryDiagnostics.discoverySegmentsRefreshed,
    estimatedDiscoverySavingsMs: discoveryDiagnostics.estimatedDiscoverySavingsMs,
    cacheEnabled: discoveryDiagnostics.cacheEnabled,
    discoverySegmentsCorrupt: discoveryDiagnostics.discoverySegmentsCorrupt,
    experimentSnapshotCount,
  };
}
