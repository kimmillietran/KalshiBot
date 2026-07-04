import { z } from "zod";

import {
  ExpansionRebuildError,
  ExpansionRebuildErrorCode,
  type ExpansionRebuildTargetMarket,
  type HistoricalExpansionImportSummary,
} from "./expansionRebuildTypes";

const marketResultSchema = z.object({
  marketTicker: z.string().trim().min(1),
  seriesTicker: z.string().trim().min(1),
  status: z.enum(["planned", "imported", "skipped", "failed"]),
  importResultPath: z.string().trim().min(1).nullable(),
});

const jobResultSchema = z.object({
  jobId: z.string().trim().min(1),
  seriesTicker: z.string().trim().min(1),
  markets: z.array(marketResultSchema),
});

const summarySchema = z.object({
  generatedAt: z.string().trim().min(1),
  execute: z.boolean(),
  inputPath: z.string().trim().min(1),
  outputPath: z.string().trim().min(1),
  jobs: z.array(jobResultSchema),
});

function parseJson(path: string, json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    throw new ExpansionRebuildError(
      `Invalid JSON in expansion import summary: ${path}`,
      ExpansionRebuildErrorCode.INVALID_EXPANSION_IMPORT_SUMMARY_JSON,
    );
  }
}

export function parseHistoricalExpansionImportSummaryJson(
  path: string,
  json: string,
): HistoricalExpansionImportSummary {
  const parsed = parseJson(path, json);
  const result = summarySchema.safeParse(parsed);
  if (!result.success) {
    throw new ExpansionRebuildError(
      `Invalid historical-expansion-import-summary.json schema in ${path}: ${result.error.message}`,
      ExpansionRebuildErrorCode.INVALID_EXPANSION_IMPORT_SUMMARY,
    );
  }

  return {
    generatedAt: result.data.generatedAt,
    execute: result.data.execute,
    inputPath: result.data.inputPath,
    outputPath: result.data.outputPath,
    jobs: result.data.jobs.map((job) => ({
      jobId: job.jobId,
      seriesTicker: job.seriesTicker,
      markets: job.markets.map((market) => ({
        marketTicker: market.marketTicker,
        seriesTicker: market.seriesTicker,
        status: market.status,
        importResultPath: market.importResultPath,
      })),
    })),
  };
}

export function loadHistoricalExpansionImportSummary(
  io: { readFile: (path: string) => string; fileExists: (path: string) => boolean },
  path: string,
): HistoricalExpansionImportSummary {
  if (!io.fileExists(path)) {
    throw new ExpansionRebuildError(
      `Missing expansion import summary: ${path}`,
      ExpansionRebuildErrorCode.MISSING_EXPANSION_IMPORT_SUMMARY,
    );
  }

  return parseHistoricalExpansionImportSummaryJson(path, io.readFile(path));
}

export function extractImportedExpansionMarkets(
  summary: HistoricalExpansionImportSummary,
): ExpansionRebuildTargetMarket[] {
  const markets: ExpansionRebuildTargetMarket[] = [];
  const seen = new Set<string>();

  for (const job of summary.jobs) {
    for (const market of job.markets) {
      if (market.status !== "imported" || !market.importResultPath) {
        continue;
      }

      const key = `${market.seriesTicker}/${market.marketTicker}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      markets.push({
        marketTicker: market.marketTicker,
        seriesTicker: market.seriesTicker,
        importResultPath: market.importResultPath,
      });
    }
  }

  return markets.sort((left, right) => {
    const bySeries = left.seriesTicker.localeCompare(right.seriesTicker);
    if (bySeries !== 0) {
      return bySeries;
    }

    return left.marketTicker.localeCompare(right.marketTicker);
  });
}
