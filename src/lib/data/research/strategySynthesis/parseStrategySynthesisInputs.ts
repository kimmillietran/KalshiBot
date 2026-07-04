import type { HypothesisCandidateConfig, HypothesisCandidatesReport } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import {
  DEFAULT_MIN_UNIQUE_TRADING_DAYS,
  createDefaultHypothesisBucketSampleThresholds,
} from "@/lib/data/research/hypothesisCandidates";

import {
  StrategySynthesisError,
  StrategySynthesisErrorCode,
} from "./strategySynthesisTypes";
import type {
  ParsedHypothesisValidationEntry,
  ParsedHypothesisValidationReport,
  ParsedStrategySynthesisInputs,
  StrategySynthesisIo,
} from "./strategySynthesisTypes";

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
    throw new StrategySynthesisError(
      `${label} contains invalid JSON`,
      StrategySynthesisErrorCode.INVALID_JSON,
    );
  }

  return validate(parsed);
}

function parseHypothesisCandidate(value: unknown): HypothesisCandidatesReport["candidates"][number] {
  if (!isRecord(value)) {
    throw new StrategySynthesisError(
      "Invalid hypothesis candidate entry",
      StrategySynthesisErrorCode.INVALID_DOCUMENT,
    );
  }

  const requiredStringFields = [
    "candidateId",
    "sourceArtifact",
    "hypothesis",
    "rationale",
    "marketCondition",
    "suggestedStrategyFamily",
    "proposedEntryCondition",
    "proposedExitSettlementAssumption",
    "expectedFailureMode",
    "killCriterion",
    "confidence",
  ] as const;

  for (const field of requiredStringFields) {
    if (typeof value[field] !== "string") {
      throw new StrategySynthesisError(
        `Hypothesis candidate missing string field: ${field}`,
        StrategySynthesisErrorCode.INVALID_DOCUMENT,
      );
    }
  }

  if (
    value.confidence !== "low"
    && value.confidence !== "medium"
    && value.confidence !== "high"
  ) {
    throw new StrategySynthesisError(
      "Hypothesis candidate has invalid confidence",
      StrategySynthesisErrorCode.INVALID_DOCUMENT,
    );
  }

  return {
    candidateId: value.candidateId as string,
    sourceArtifact: value.sourceArtifact as string,
    hypothesis: value.hypothesis as string,
    rationale: value.rationale as string,
    marketCondition: value.marketCondition as string,
    suggestedStrategyFamily: value.suggestedStrategyFamily as string,
    requiredData: readStringArray(value.requiredData),
    proposedEntryCondition: value.proposedEntryCondition as string,
    proposedExitSettlementAssumption: value.proposedExitSettlementAssumption as string,
    expectedFailureMode: value.expectedFailureMode as string,
    killCriterion: value.killCriterion as string,
    confidence: value.confidence as HypothesisCandidatesReport["candidates"][number]["confidence"],
    warnings: readStringArray(value.warnings),
  };
}

function resolveHypothesisCandidateConfig(
  config: Record<string, unknown> | undefined,
): HypothesisCandidateConfig {
  const minSampleSizeByGroup = isRecord(config?.minSampleSizeByGroup)
    ? Object.fromEntries(
        Object.entries(config.minSampleSizeByGroup).filter(
          (entry): entry is [string, number] => typeof entry[1] === "number",
        ),
      )
    : {};

  return {
    minSampleSize:
      typeof config?.minSampleSize === "number" ? config.minSampleSize : 30,
    minCalibrationError:
      typeof config?.minCalibrationError === "number"
        ? config.minCalibrationError
        : 0.05,
    minLeadLagCorrelation:
      typeof config?.minLeadLagCorrelation === "number"
        ? config.minLeadLagCorrelation
        : 0.2,
    minUniqueTradingDays:
      typeof config?.minUniqueTradingDays === "number"
        ? config.minUniqueTradingDays
        : DEFAULT_MIN_UNIQUE_TRADING_DAYS,
    minSampleSizeByGroup: {
      ...createDefaultHypothesisBucketSampleThresholds(),
      ...minSampleSizeByGroup,
    },
  };
}

export function parseHypothesisCandidatesReport(json: string): HypothesisCandidatesReport {
  return parseJsonDocument(json, "hypothesis-candidates.json", (value) => {
    if (!isRecord(value)) {
      throw new StrategySynthesisError(
        "hypothesis-candidates.json must be an object",
        StrategySynthesisErrorCode.INVALID_DOCUMENT,
      );
    }

    if (typeof value.generatedAt !== "string" || typeof value.outputPath !== "string") {
      throw new StrategySynthesisError(
        "hypothesis-candidates.json missing generatedAt or outputPath",
        StrategySynthesisErrorCode.INVALID_DOCUMENT,
      );
    }

    if (!Array.isArray(value.candidates)) {
      throw new StrategySynthesisError(
        "hypothesis-candidates.json missing candidates array",
        StrategySynthesisErrorCode.INVALID_DOCUMENT,
      );
    }

    return {
      generatedAt: value.generatedAt,
      outputPath: value.outputPath,
      config: resolveHypothesisCandidateConfig(
        isRecord(value.config) ? value.config : undefined,
      ),
      inputs: isRecord(value.inputs)
        ? {
            mispricingAtlasPath:
              typeof value.inputs.mispricingAtlasPath === "string"
                ? value.inputs.mispricingAtlasPath
                : "",
            leadLagAnalysisPath:
              typeof value.inputs.leadLagAnalysisPath === "string"
                ? value.inputs.leadLagAnalysisPath
                : "",
            statisticalSignificancePath:
              typeof value.inputs.statisticalSignificancePath === "string"
                ? value.inputs.statisticalSignificancePath
                : "",
            regimeTagsPath:
              typeof value.inputs.regimeTagsPath === "string"
                ? value.inputs.regimeTagsPath
                : "",
            strategyLeaderboardPath:
              typeof value.inputs.strategyLeaderboardPath === "string"
                ? value.inputs.strategyLeaderboardPath
                : "",
            mispricingAtlasPresent: value.inputs.mispricingAtlasPresent === true,
            leadLagAnalysisPresent: value.inputs.leadLagAnalysisPresent === true,
            statisticalSignificancePresent:
              value.inputs.statisticalSignificancePresent === true,
            regimeTagsPresent: value.inputs.regimeTagsPresent === true,
            strategyLeaderboardPresent:
              value.inputs.strategyLeaderboardPresent === true,
          }
        : {
            mispricingAtlasPath: "",
            leadLagAnalysisPath: "",
            statisticalSignificancePath: "",
            regimeTagsPath: "",
            strategyLeaderboardPath: "",
            mispricingAtlasPresent: false,
            leadLagAnalysisPresent: false,
            statisticalSignificancePresent: false,
            regimeTagsPresent: false,
            strategyLeaderboardPresent: false,
          },
      candidates: value.candidates.map(parseHypothesisCandidate),
      summary: isRecord(value.summary)
        ? {
            candidateCount:
              typeof value.summary.candidateCount === "number"
                ? value.summary.candidateCount
                : value.candidates.length,
            noCandidateReasons: readStringArray(value.summary.noCandidateReasons),
            atlasCoverageDiagnostics: null,
          }
        : {
            candidateCount: value.candidates.length,
            noCandidateReasons: [],
            atlasCoverageDiagnostics: null,
          },
    };
  });
}

function parseValidationEntry(value: unknown): ParsedHypothesisValidationEntry {
  if (!isRecord(value)) {
    throw new StrategySynthesisError(
      "Invalid hypothesis validation entry",
      StrategySynthesisErrorCode.INVALID_DOCUMENT,
    );
  }

  if (typeof value.hypothesisId !== "string") {
    throw new StrategySynthesisError(
      "Validation entry missing hypothesisId",
      StrategySynthesisErrorCode.INVALID_DOCUMENT,
    );
  }

  return {
    hypothesisId: value.hypothesisId,
    robustnessScore:
      typeof value.robustnessScore === "number" ? value.robustnessScore : 0,
    passes: value.passes === true,
    reasons: readStringArray(value.reasons),
    observationCount:
      typeof value.observationCount === "number" ? value.observationCount : 0,
  };
}

export function parseHypothesisValidationReport(
  json: string,
): ParsedHypothesisValidationReport {
  return parseJsonDocument(json, "hypothesis-validation.json", (value) => {
    if (!isRecord(value)) {
      throw new StrategySynthesisError(
        "hypothesis-validation.json must be an object",
        StrategySynthesisErrorCode.INVALID_DOCUMENT,
      );
    }

    if (typeof value.generatedAt !== "string" || typeof value.outputPath !== "string") {
      throw new StrategySynthesisError(
        "hypothesis-validation.json missing generatedAt or outputPath",
        StrategySynthesisErrorCode.INVALID_DOCUMENT,
      );
    }

    if (!Array.isArray(value.validations)) {
      throw new StrategySynthesisError(
        "hypothesis-validation.json missing validations array",
        StrategySynthesisErrorCode.INVALID_DOCUMENT,
      );
    }

    return {
      generatedAt: value.generatedAt,
      outputPath: value.outputPath,
      validations: value.validations.map(parseValidationEntry),
    };
  });
}

export function assertStrategySynthesisInputFiles(
  io: StrategySynthesisIo,
  paths: { hypothesisCandidatesPath: string; hypothesisValidationPath: string },
): void {
  if (!io.fileExists(paths.hypothesisCandidatesPath)) {
    throw new StrategySynthesisError(
      `Missing hypothesis candidates input: ${paths.hypothesisCandidatesPath}`,
      StrategySynthesisErrorCode.MISSING_INPUT,
    );
  }

  if (!io.fileExists(paths.hypothesisValidationPath)) {
    throw new StrategySynthesisError(
      `Missing hypothesis validation input: ${paths.hypothesisValidationPath}`,
      StrategySynthesisErrorCode.MISSING_INPUT,
    );
  }
}

export function loadStrategySynthesisInputs(
  io: StrategySynthesisIo,
  paths: { hypothesisCandidatesPath: string; hypothesisValidationPath: string },
): ParsedStrategySynthesisInputs {
  assertStrategySynthesisInputFiles(io, paths);

  return {
    candidatesReport: parseHypothesisCandidatesReport(
      io.readFile(paths.hypothesisCandidatesPath),
    ),
    validationReport: parseHypothesisValidationReport(
      io.readFile(paths.hypothesisValidationPath),
    ),
  };
}
