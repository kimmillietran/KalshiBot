import {
  StrategyHarnessError,
  type StrategyHarnessIo,
  type StrategySynthesisCandidatesReport,
  type SynthesizedStrategySpec,
} from "./strategyHarnessTypes";
import { parseStrategySynthesisCandidatesReport } from "./normalizeSynthesizedStrategySpec";

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

export function filterHarnessStrategySpecs(
  strategies: readonly SynthesizedStrategySpec[],
  options?: {
    strategyFamily?: string;
    synthesizedStrategyId?: string;
    includeRejected?: boolean;
  },
): SynthesizedStrategySpec[] {
  return [...strategies]
    .filter((spec) => {
      if (options?.strategyFamily && spec.strategyFamily !== options.strategyFamily) {
        return false;
      }

      if (
        options?.synthesizedStrategyId
        && spec.strategyId !== options.synthesizedStrategyId
      ) {
        return false;
      }

      if (!options?.includeRejected && spec.promotionStatus === "rejected") {
        return false;
      }

      return true;
    })
    .sort((left, right) => left.strategyId.localeCompare(right.strategyId));
}
