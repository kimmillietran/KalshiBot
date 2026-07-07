import { DEFAULT_STRATEGY_LEADERBOARD_OUTPUT_PATH } from "@/lib/data/research/leaderboard/strategyLeaderboardTypes";
import { DEFAULT_HYPOTHESIS_VALIDATION_INPUT_PATH } from "@/lib/data/research/strategySynthesis/strategySynthesisTypes";
import type {
  StrategySynthesisCandidate,
  StrategySynthesisDirection,
} from "@/lib/data/research/strategySynthesis/strategySynthesisTypes";

import {
  HarnessResultsError,
  HarnessResultsErrorCode,
} from "./harnessResultsTypes";
import type {
  HarnessResultsIo,
  ParsedHarnessMarketResult,
  ParsedHarnessValidationEntry,
  ParsedStrategyHarnessSummary,
} from "./harnessResultsTypes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

function parseJsonDocument<T>(
  json: string,
  label: string,
  validate: (value: unknown) => T,
): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new HarnessResultsError(
      `${label} contains invalid JSON`,
      HarnessResultsErrorCode.INVALID_JSON,
    );
  }

  return validate(parsed);
}

export function parseStrategySynthesisCandidatesReport(json: string): {
  strategies: readonly StrategySynthesisCandidate[];
} {
  return parseJsonDocument(json, "strategy-synthesis-candidates.json", (value) => {
    if (!isRecord(value) || !Array.isArray(value.strategies)) {
      throw new HarnessResultsError(
        "strategy-synthesis-candidates.json missing strategies array",
        HarnessResultsErrorCode.INVALID_DOCUMENT,
      );
    }

    const strategies = value.strategies.map((entry, index) => {
      if (!isRecord(entry)) {
        throw new HarnessResultsError(
          `Invalid synthesis strategy at index ${index}`,
          HarnessResultsErrorCode.INVALID_DOCUMENT,
        );
      }

      const direction = entry.direction as StrategySynthesisDirection;
      if (
        direction !== "buy-yes"
        && direction !== "buy-no"
        && direction !== "fade-yes"
        && direction !== "fade-no"
      ) {
        throw new HarnessResultsError(
          `Invalid direction for strategy ${entry.strategyId ?? index}`,
          HarnessResultsErrorCode.INVALID_DOCUMENT,
        );
      }

      const entryConditions = isRecord(entry.entryConditions)
        ? entry.entryConditions
        : {};

      const validationSummary = isRecord(entry.validationSummary)
        ? entry.validationSummary
        : {};

      return {
        strategyId: String(entry.strategyId ?? ""),
        hypothesisId: String(entry.hypothesisId ?? ""),
        strategyFamily: String(entry.strategyFamily ?? ""),
        direction,
        entryConditions: {
          summary: String(entryConditions.summary ?? ""),
          marketCondition: String(entryConditions.marketCondition ?? ""),
          atlasGroupId:
            typeof entryConditions.atlasGroupId === "string"
              ? entryConditions.atlasGroupId
              : null,
          bucketId:
            typeof entryConditions.bucketId === "string"
              ? entryConditions.bucketId
              : null,
          calibrationDirection:
            entryConditions.calibrationDirection === "over"
            || entryConditions.calibrationDirection === "under"
              ? entryConditions.calibrationDirection
              : null,
          minCalibrationError:
            typeof entryConditions.minCalibrationError === "number"
              ? entryConditions.minCalibrationError
              : null,
          leadLagCandles:
            typeof entryConditions.leadLagCandles === "number"
              ? entryConditions.leadLagCandles
              : null,
        },
        exitAssumption: String(entry.exitAssumption ?? ""),
        requiredData: readStringArray(entry.requiredData),
        riskNotes: readStringArray(entry.riskNotes),
        validationSummary: {
          robustnessScore:
            typeof validationSummary.robustnessScore === "number"
              ? validationSummary.robustnessScore
              : null,
          passes: validationSummary.passes === true,
          observationCount:
            typeof validationSummary.observationCount === "number"
              ? validationSummary.observationCount
              : null,
          reasons: readStringArray(validationSummary.reasons),
          summary: String(validationSummary.summary ?? ""),
        },
        promotionStatus:
          entry.promotionStatus === "candidate"
          || entry.promotionStatus === "experimental"
          || entry.promotionStatus === "rejected"
            ? entry.promotionStatus
            : "rejected",
      } satisfies StrategySynthesisCandidate;
    });

    return { strategies };
  });
}

function parseHarnessMarketResult(value: unknown): ParsedHarnessMarketResult {
  if (!isRecord(value)) {
    throw new HarnessResultsError(
      "Invalid harness market result",
      HarnessResultsErrorCode.INVALID_DOCUMENT,
    );
  }

  const status =
    value.status === "success"
    || value.status === "failed"
    || value.status === "skipped"
      ? value.status
      : "failed";

  return {
    synthesizedStrategyId: String(value.synthesizedStrategyId ?? ""),
    hypothesisId: String(value.hypothesisId ?? ""),
    strategyFamily: String(value.strategyFamily ?? ""),
    seriesTicker: String(value.seriesTicker ?? ""),
    marketTicker: String(value.marketTicker ?? ""),
    outputPath: String(value.outputPath ?? ""),
    status,
    errorMessage:
      typeof value.errorMessage === "string" ? value.errorMessage : null,
  };
}

export function parseStrategyHarnessSummary(
  json: string,
): ParsedStrategyHarnessSummary {
  return parseJsonDocument(json, "strategy-harness-summary.json", (value) => {
    if (!isRecord(value) || !Array.isArray(value.results)) {
      throw new HarnessResultsError(
        "strategy-harness-summary.json missing results array",
        HarnessResultsErrorCode.INVALID_DOCUMENT,
      );
    }

    return {
      synthesisPath: String(value.synthesisPath ?? ""),
      outputDir: String(value.outputDir ?? ""),
      summaryPath: String(value.summaryPath ?? ""),
      evaluatedStrategies:
        typeof value.evaluatedStrategies === "number"
          ? value.evaluatedStrategies
          : 0,
      totalRuns: typeof value.totalRuns === "number" ? value.totalRuns : 0,
      successfulRuns:
        typeof value.successfulRuns === "number" ? value.successfulRuns : 0,
      failedRuns: typeof value.failedRuns === "number" ? value.failedRuns : 0,
      skippedRuns: typeof value.skippedRuns === "number" ? value.skippedRuns : 0,
      runMode: value.runMode === "research-only" ? "research-only" : "production",
      researchOnlyBacktest: value.researchOnlyBacktest === true,
      includedRejectedStrategies: value.includedRejectedStrategies === true,
      promotionEligible: value.promotionEligible !== false,
      skippedRejectedStrategyCount:
        typeof value.skippedRejectedStrategyCount === "number"
          ? value.skippedRejectedStrategyCount
          : 0,
      strategySelection: Array.isArray(value.strategySelection)
        ? value.strategySelection.map((entry) => {
            if (!isRecord(entry)) {
              return {
                strategyId: "",
                hypothesisId: "",
                promotionStatus: "",
                decision: "skipped" as const,
                reason: "Invalid selection entry",
              };
            }

            return {
              strategyId: String(entry.strategyId ?? ""),
              hypothesisId: String(entry.hypothesisId ?? ""),
              promotionStatus: String(entry.promotionStatus ?? ""),
              decision: entry.decision === "included" ? "included" : "skipped",
              reason: String(entry.reason ?? ""),
            };
          })
        : [],
      results: value.results.map(parseHarnessMarketResult),
    };
  });
}

export function parseHarnessValidationReport(
  json: string,
): readonly ParsedHarnessValidationEntry[] {
  return parseJsonDocument(json, "hypothesis-validation.json", (value) => {
    if (!isRecord(value) || !Array.isArray(value.validations)) {
      throw new HarnessResultsError(
        "hypothesis-validation.json missing validations array",
        HarnessResultsErrorCode.INVALID_DOCUMENT,
      );
    }

    return value.validations.map((entry) => {
      if (!isRecord(entry) || typeof entry.hypothesisId !== "string") {
        throw new HarnessResultsError(
          "Invalid validation entry",
          HarnessResultsErrorCode.INVALID_DOCUMENT,
        );
      }

      return {
        hypothesisId: entry.hypothesisId,
        robustnessScore:
          typeof entry.robustnessScore === "number" ? entry.robustnessScore : 0,
        passes: entry.passes === true,
        reasons: readStringArray(entry.reasons),
      };
    });
  });
}

export function parseLeaderboardStrategyIds(json: string): ReadonlySet<string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return new Set();
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.strategies)) {
    return new Set();
  }

  const ids = parsed.strategies
    .map((entry) => (isRecord(entry) ? entry.strategyId : null))
    .filter((id): id is string => typeof id === "string");

  return new Set(ids);
}

export function assertHarnessResultsInputFiles(
  io: HarnessResultsIo,
  synthesisPath: string,
): void {
  if (!io.fileExists(synthesisPath)) {
    throw new HarnessResultsError(
      `Missing strategy synthesis input: ${synthesisPath}`,
      HarnessResultsErrorCode.MISSING_INPUT,
    );
  }
}

export function loadHarnessResultsInputs(
  io: HarnessResultsIo,
  paths: {
    synthesisPath: string;
    harnessSummaryPath: string;
    hypothesisValidationPath: string | null;
    strategyLeaderboardPath: string | null;
  },
): {
  synthesisStrategies: readonly StrategySynthesisCandidate[];
  harnessSummary: ParsedStrategyHarnessSummary | null;
  validationByHypothesisId: ReadonlyMap<string, ParsedHarnessValidationEntry>;
  leaderboardStrategyIds: ReadonlySet<string>;
} {
  assertHarnessResultsInputFiles(io, paths.synthesisPath);

  const synthesis = parseStrategySynthesisCandidatesReport(
    io.readFile(paths.synthesisPath),
  );

  const harnessSummary = io.fileExists(paths.harnessSummaryPath)
    ? parseStrategyHarnessSummary(io.readFile(paths.harnessSummaryPath))
    : null;

  const validationPath =
    paths.hypothesisValidationPath ?? DEFAULT_HYPOTHESIS_VALIDATION_INPUT_PATH;
  const validationByHypothesisId = new Map<string, ParsedHarnessValidationEntry>();

  if (io.fileExists(validationPath)) {
    for (const entry of parseHarnessValidationReport(io.readFile(validationPath))) {
      validationByHypothesisId.set(entry.hypothesisId, entry);
    }
  }

  const leaderboardPath =
    paths.strategyLeaderboardPath ?? DEFAULT_STRATEGY_LEADERBOARD_OUTPUT_PATH;
  const leaderboardStrategyIds = io.fileExists(leaderboardPath)
    ? parseLeaderboardStrategyIds(io.readFile(leaderboardPath))
    : new Set<string>();

  return {
    synthesisStrategies: synthesis.strategies,
    harnessSummary,
    validationByHypothesisId,
    leaderboardStrategyIds,
  };
}
