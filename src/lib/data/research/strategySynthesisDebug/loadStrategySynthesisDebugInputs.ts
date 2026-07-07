import type { HypothesisCandidatesReport } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import type { ParsedStrategyHarnessSummary } from "@/lib/data/research/harnessResults/harnessResultsTypes";
import { parseStrategyHarnessSummary } from "@/lib/data/research/harnessResults/parseHarnessResultsInputs";
import {
  parseHypothesisCandidatesReport,
  parseHypothesisValidationReport,
} from "@/lib/data/research/strategySynthesis/parseStrategySynthesisInputs";
import type { ParsedHypothesisValidationReport } from "@/lib/data/research/strategySynthesis/strategySynthesisTypes";
import {
  parseRawStrategySynthesisCandidatesReport,
  type RawStrategySynthesisCandidatesReport,
} from "@/lib/data/research/strategyHarness/normalizeSynthesizedStrategySpec";

import {
  StrategySynthesisDebugError,
  StrategySynthesisDebugErrorCode,
  type StrategySynthesisDebugInputPaths,
  type StrategySynthesisDebugInputStatus,
  type StrategySynthesisDebugIo,
} from "./strategySynthesisDebugTypes";

export type LoadedStrategySynthesisDebugInputs = {
  inputStatus: StrategySynthesisDebugInputStatus;
  candidatesReport: HypothesisCandidatesReport | null;
  validationReport: ParsedHypothesisValidationReport | null;
  synthesisReport: RawStrategySynthesisCandidatesReport | null;
  harnessSummary: ParsedStrategyHarnessSummary | null;
  harnessWarnings: readonly string[];
  synthesisParseError: string | null;
};

function parseJson(path: string, raw: string): unknown {
  try {
    return JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch {
    throw new StrategySynthesisDebugError(
      `Invalid JSON in ${path}`,
      StrategySynthesisDebugErrorCode.INVALID_JSON,
    );
  }
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

function tryLoadCandidates(
  io: StrategySynthesisDebugIo,
  path: string,
): HypothesisCandidatesReport | null {
  if (!io.fileExists(path)) {
    return null;
  }

  return parseHypothesisCandidatesReport(io.readFile(path));
}

function tryLoadValidation(
  io: StrategySynthesisDebugIo,
  path: string,
): ParsedHypothesisValidationReport | null {
  if (!io.fileExists(path)) {
    return null;
  }

  return parseHypothesisValidationReport(io.readFile(path));
}

function tryLoadSynthesisReport(
  io: StrategySynthesisDebugIo,
  path: string,
): {
  report: RawStrategySynthesisCandidatesReport | null;
  parseError: string | null;
} {
  if (!io.fileExists(path)) {
    return { report: null, parseError: null };
  }

  try {
    const parsed = parseJson(path, io.readFile(path));
    return {
      report: parseRawStrategySynthesisCandidatesReport(path, parsed),
      parseError: null,
    };
  } catch (error) {
    return {
      report: null,
      parseError: error instanceof Error ? error.message : "Invalid synthesis document",
    };
  }
}

function tryLoadHarnessSummary(
  io: StrategySynthesisDebugIo,
  path: string,
): {
  summary: ParsedStrategyHarnessSummary | null;
  warnings: readonly string[];
} {
  if (!io.fileExists(path)) {
    return { summary: null, warnings: [] };
  }

  const raw = io.readFile(path);
  const parsed = parseJson(path, raw) as { warnings?: unknown };
  return {
    summary: parseStrategyHarnessSummary(raw),
    warnings: readStringArray(parsed.warnings),
  };
}

/** Loads upstream artifacts for strategy synthesis debug analysis. */
export function loadStrategySynthesisDebugInputs(
  io: StrategySynthesisDebugIo,
  inputPaths: StrategySynthesisDebugInputPaths,
): LoadedStrategySynthesisDebugInputs {
  const inputStatus: StrategySynthesisDebugInputStatus = {
    hypothesisCandidatesPresent: io.fileExists(inputPaths.hypothesisCandidatesPath),
    hypothesisValidationPresent: io.fileExists(inputPaths.hypothesisValidationPath),
    strategySynthesisPresent: io.fileExists(inputPaths.strategySynthesisPath),
    harnessSummaryPresent: io.fileExists(inputPaths.harnessSummaryPath),
    harnessResultsPresent: io.fileExists(inputPaths.harnessResultsPath),
  };

  if (!inputStatus.hypothesisCandidatesPresent) {
    throw new StrategySynthesisDebugError(
      `Missing required input: ${inputPaths.hypothesisCandidatesPath}`,
      StrategySynthesisDebugErrorCode.MISSING_INPUT,
    );
  }

  const synthesisLoad = tryLoadSynthesisReport(io, inputPaths.strategySynthesisPath);
  const harnessLoad = tryLoadHarnessSummary(io, inputPaths.harnessSummaryPath);

  return {
    inputStatus,
    candidatesReport: tryLoadCandidates(io, inputPaths.hypothesisCandidatesPath),
    validationReport: tryLoadValidation(io, inputPaths.hypothesisValidationPath),
    synthesisReport: synthesisLoad.report,
    harnessSummary: harnessLoad.summary,
    harnessWarnings: harnessLoad.warnings,
    synthesisParseError: synthesisLoad.parseError,
  };
}
