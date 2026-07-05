import { z } from "zod";

import { CoveragePlannerError, CoveragePlannerErrorCode } from "../coveragePlannerTypes";

import { normalizeExpansionImportMarketRecords } from "./estimateRecommendationImportability";
import type { ExpansionImportSummaryDocument } from "./importabilityTypes";

const marketSchema = z.object({
  marketTicker: z.string().trim().min(1),
  seriesTicker: z.string().trim().min(1),
  status: z.enum(["planned", "imported", "skipped", "failed"]),
  errorMessage: z.string().nullable().optional(),
  skipReason: z.string().nullable().optional(),
});

const summarySchema = z.object({
  generatedAt: z.string().trim().min(1),
  execute: z.boolean(),
  inputPath: z.string().trim().min(1),
  outputPath: z.string().trim().min(1),
  jobs: z.array(
    z.object({
      jobId: z.string().trim().min(1),
      seriesTicker: z.string().trim().min(1),
      markets: z.array(marketSchema),
    }),
  ),
});

function parseJson(path: string, json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    throw new CoveragePlannerError(
      `Invalid JSON in expansion import summary: ${path}`,
      CoveragePlannerErrorCode.INVALID_JSON,
    );
  }
}

/** Parses an expansion import summary JSON document for coverage planner importability scoring. */
export function parseExpansionImportSummaryJson(
  path: string,
  json: string,
): ExpansionImportSummaryDocument {
  const parsed = parseJson(path, json);
  const result = summarySchema.safeParse(parsed);
  if (!result.success) {
    throw new CoveragePlannerError(
      `Invalid expansion import summary schema in ${path}: ${result.error.message}`,
      CoveragePlannerErrorCode.INVALID_DOCUMENT,
    );
  }

  return {
    generatedAt: result.data.generatedAt,
    inputPath: result.data.inputPath,
    outputPath: result.data.outputPath,
    execute: result.data.execute,
    jobs: result.data.jobs.map((job) => ({
      jobId: job.jobId,
      seriesTicker: job.seriesTicker,
      markets: normalizeExpansionImportMarketRecords(job.markets),
    })),
  };
}

/** Loads an expansion import summary when present; returns null when the file is missing. */
export function tryLoadExpansionImportSummary(
  io: { readFile: (path: string) => string; fileExists: (path: string) => boolean },
  path: string,
): ExpansionImportSummaryDocument | null {
  if (!io.fileExists(path)) {
    return null;
  }

  return parseExpansionImportSummaryJson(path, io.readFile(path));
}
