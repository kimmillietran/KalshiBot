import {
  StrategyHarnessError,
  type StrategyHarnessIo,
  type StrategySynthesisCandidatesReport,
  type SynthesizedStrategySpec,
} from "./strategyHarnessTypes";
import { loadHypothesisFailureAnalysisForHarness } from "./loadHypothesisFailureAnalysisForHarness";
import {
  parseRawStrategySynthesisCandidatesReport,
  parseStrategySynthesisCandidatesReport,
  type RawSynthesizedStrategySpec,
} from "./normalizeSynthesizedStrategySpec";
import {
  resolveHarnessStrategySelection,
  type HarnessStrategySelectionResult,
  type ResolveHarnessStrategySelectionOptions,
} from "./resolveHarnessStrategySelection";

export { HARNESS_DEFAULT_PROMOTION_STATUSES } from "./strategyHarnessTypes";

export const HARNESS_NO_MATCH_WARNING =
  "No synthesized strategies matched harness filters; wrote empty strategy-harness-summary.json";

export type LoadHarnessStrategySpecsOptions = ResolveHarnessStrategySelectionOptions & {
  failureAnalysisPath?: string;
};

function parseJson(path: string, json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    throw new StrategyHarnessError(`Invalid JSON in ${path}`);
  }
}

export function loadStrategySynthesisCandidatesReport(
  io: StrategyHarnessIo,
  path: string,
): StrategySynthesisCandidatesReport {
  if (!io.fileExists(path)) {
    throw new StrategyHarnessError(`Missing strategy synthesis file: ${path}`);
  }

  const parsed = parseJson(path, io.readFile(path));
  return parseStrategySynthesisCandidatesReport(path, parsed);
}

/** Resolves harness-eligible specs after promotion gate and CLI filters, without validating rejected rows. */
export function resolveHarnessStrategySpecs(
  strategies: readonly RawSynthesizedStrategySpec[],
  options?: ResolveHarnessStrategySelectionOptions,
): SynthesizedStrategySpec[] {
  return resolveHarnessStrategySelection(strategies, options).specs;
}

export function resolveHarnessStrategySpecsWithSelection(
  strategies: readonly RawSynthesizedStrategySpec[],
  options?: ResolveHarnessStrategySelectionOptions,
): HarnessStrategySelectionResult {
  return resolveHarnessStrategySelection(strategies, options);
}

export function loadHarnessStrategySelection(
  io: StrategyHarnessIo,
  path: string,
  options?: LoadHarnessStrategySpecsOptions,
): HarnessStrategySelectionResult {
  if (!io.fileExists(path)) {
    throw new StrategyHarnessError(`Missing strategy synthesis file: ${path}`);
  }

  const parsed = parseJson(path, io.readFile(path));
  const report = parseRawStrategySynthesisCandidatesReport(path, parsed);
  const failureAnalysisByHypothesisId = options?.researchOnlyBacktest
    ? loadHypothesisFailureAnalysisForHarness(
        io,
        options.failureAnalysisPath,
      )
    : null;

  return resolveHarnessStrategySelection(report.strategies, {
    ...options,
    failureAnalysisByHypothesisId,
  });
}

export function loadHarnessStrategySpecs(
  io: StrategyHarnessIo,
  path: string,
  options?: LoadHarnessStrategySpecsOptions,
): SynthesizedStrategySpec[] {
  return loadHarnessStrategySelection(io, path, options).specs;
}

/** @deprecated Use resolveHarnessStrategySpecs after raw synthesis parse. */
export function filterHarnessStrategySpecs(
  strategies: readonly SynthesizedStrategySpec[],
  options?: ResolveHarnessStrategySelectionOptions,
): SynthesizedStrategySpec[] {
  return resolveHarnessStrategySpecs(
    strategies.map((spec) => ({
      strategyId: spec.strategyId,
      hypothesisId: spec.hypothesisId,
      strategyFamily: spec.strategyFamily,
      direction: spec.direction,
      entryConditions: spec.entryConditions,
      exitAssumption: spec.exitAssumption,
      requiredData: [...spec.requiredData],
      riskNotes: [...spec.riskNotes],
      validationSummary: spec.validationSummary,
      promotionStatus: spec.promotionStatus,
    })),
    options,
  );
}
