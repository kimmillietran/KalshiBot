import { z } from "zod";

import {
  DEFAULT_STRATEGY_SYNTHESIS_CANDIDATES_PATH,
  normalizeSynthesizedStrategySpec,
  SYNTHESIZED_STRATEGY_DIRECTIONS,
  SYNTHESIZED_PROMOTION_STATUSES,
  translateSynthesizedStrategySpec,
} from "@/lib/data/research/strategyHarness";

import {
  StrategySweepError,
  StrategySweepErrorCode,
  type SynthesizedStrategySweepEntry,
} from "./strategySweepTypes";

const rawStrategySchema = z
  .object({
    strategyId: z.string().trim().min(1),
    hypothesisId: z.string().trim().min(1),
    strategyFamily: z.string().trim().min(1),
    direction: z.enum(SYNTHESIZED_STRATEGY_DIRECTIONS),
    entryConditions: z.record(z.string(), z.unknown()),
    exitAssumption: z.string().trim().min(1),
    requiredData: z.array(z.string().trim().min(1)),
    riskNotes: z.array(z.string().trim().min(1)),
    validationSummary: z
      .object({
        robustnessScore: z.number().finite().nullable(),
        passes: z.boolean(),
        observationCount: z.number().finite().int().nonnegative().nullable(),
        reasons: z.array(z.string()).optional(),
        summary: z.string().optional(),
      })
      .passthrough(),
    promotionStatus: z.enum(SYNTHESIZED_PROMOTION_STATUSES),
  })
  .passthrough();

const rawReportSchema = z.object({
  strategies: z.array(rawStrategySchema),
});

export const SYNTHESIZED_SWEEP_STRATEGY_PREFIX = "synthesized";

export function buildSynthesizedSweepStrategyId(synthesizedStrategyId: string): string {
  return `${SYNTHESIZED_SWEEP_STRATEGY_PREFIX}/${synthesizedStrategyId}`;
}

function parseJson(path: string, json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    throw new StrategySweepError(
      `Invalid JSON in strategy synthesis file: ${path}`,
      StrategySweepErrorCode.INVALID_SYNTHESIS_FILE,
    );
  }
}

/** Loads synthesized strategy specs for sweep execution, skipping unsupported entries with warnings. */
export function resolveSynthesizedStrategySweepEntries(input: {
  synthesisPath?: string;
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  includeRejected?: boolean;
}): {
  entries: readonly SynthesizedStrategySweepEntry[];
  warnings: readonly string[];
} {
  const synthesisPath = input.synthesisPath ?? DEFAULT_STRATEGY_SYNTHESIS_CANDIDATES_PATH;

  if (!input.fileExists(synthesisPath)) {
    throw new StrategySweepError(
      `Missing strategy synthesis file: ${synthesisPath}`,
      StrategySweepErrorCode.MISSING_SYNTHESIS_FILE,
    );
  }

  const parsed = parseJson(synthesisPath, input.readFile(synthesisPath));
  const reportResult = rawReportSchema.safeParse(parsed);
  if (!reportResult.success) {
    throw new StrategySweepError(
      `Invalid strategy-synthesis-candidates.json schema in ${synthesisPath}: ${reportResult.error.message}`,
      StrategySweepErrorCode.INVALID_SYNTHESIS_FILE,
    );
  }

  const entries: SynthesizedStrategySweepEntry[] = [];
  const warnings: string[] = [];

  for (const rawStrategy of reportResult.data.strategies) {
    if (!input.includeRejected && rawStrategy.promotionStatus === "rejected") {
      warnings.push(
        `Skipped rejected synthesized strategy "${rawStrategy.strategyId}" (${rawStrategy.hypothesisId}).`,
      );
      continue;
    }

    try {
      const normalized = normalizeSynthesizedStrategySpec(
        rawStrategy as Parameters<typeof normalizeSynthesizedStrategySpec>[0],
      );
      const translated = translateSynthesizedStrategySpec(normalized);

      entries.push({
        sweepStrategyId: buildSynthesizedSweepStrategyId(translated.synthesizedStrategyId),
        synthesizedStrategyId: translated.synthesizedStrategyId,
        hypothesisId: translated.hypothesisId,
        strategyFamily: translated.strategyFamily,
        pluginStrategyId: translated.pluginStrategyId,
        strategyConfig: translated.strategyConfig,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unsupported synthesized strategy";
      warnings.push(
        `Skipped unsupported synthesized strategy "${rawStrategy.strategyId}" (${rawStrategy.hypothesisId}): ${message}`,
      );
    }
  }

  return {
    entries: entries.sort((left, right) =>
      left.sweepStrategyId.localeCompare(right.sweepStrategyId),
    ),
    warnings,
  };
}
