import {
  StrategyHarnessError,
  SYNTHESIZED_PROMOTION_STATUSES,
  type StrategyHarnessIo,
  type StrategySynthesisCandidatesReport,
  type SynthesizedPromotionStatus,
  type SynthesizedStrategySpec,
} from "./strategyHarnessTypes";
import {
  normalizeSynthesizedStrategySpec,
  parseRawStrategySynthesisCandidatesReport,
  parseStrategySynthesisCandidatesReport,
  type RawSynthesizedStrategySpec,
} from "./normalizeSynthesizedStrategySpec";

function parseJson(path: string, json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    throw new StrategyHarnessError(`Invalid JSON in ${path}`);
  }
}

export const HARNESS_DEFAULT_PROMOTION_STATUSES = [
  "experimental",
  "candidate",
] as const satisfies readonly SynthesizedPromotionStatus[];

export const HARNESS_NO_MATCH_WARNING =
  "No synthesized strategies matched harness filters; wrote empty strategy-harness-summary.json";

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

function isHarnessPromotionEligible(
  promotionStatus: SynthesizedPromotionStatus,
  includeRejected: boolean,
): boolean {
  if (includeRejected) {
    return SYNTHESIZED_PROMOTION_STATUSES.includes(promotionStatus);
  }

  return HARNESS_DEFAULT_PROMOTION_STATUSES.includes(
    promotionStatus as (typeof HARNESS_DEFAULT_PROMOTION_STATUSES)[number],
  );
}

/** Resolves harness-eligible specs after promotion gate and CLI filters, without validating rejected rows. */
export function resolveHarnessStrategySpecs(
  strategies: readonly RawSynthesizedStrategySpec[],
  options?: {
    strategyFamily?: string;
    synthesizedStrategyId?: string;
    includeRejected?: boolean;
  },
): SynthesizedStrategySpec[] {
  const includeRejected = options?.includeRejected === true;
  const specs: SynthesizedStrategySpec[] = [];

  for (const rawStrategy of strategies) {
    if (
      options?.strategyFamily
      && rawStrategy.strategyFamily !== options.strategyFamily
    ) {
      continue;
    }

    if (
      options?.synthesizedStrategyId
      && rawStrategy.strategyId !== options.synthesizedStrategyId
    ) {
      continue;
    }

    if (!isHarnessPromotionEligible(rawStrategy.promotionStatus, includeRejected)) {
      continue;
    }

    try {
      specs.push(normalizeSynthesizedStrategySpec(rawStrategy));
    } catch {
      continue;
    }
  }

  return specs.sort((left, right) => left.strategyId.localeCompare(right.strategyId));
}

export function loadHarnessStrategySpecs(
  io: StrategyHarnessIo,
  path: string,
  options?: {
    strategyFamily?: string;
    synthesizedStrategyId?: string;
    includeRejected?: boolean;
  },
): SynthesizedStrategySpec[] {
  if (!io.fileExists(path)) {
    throw new StrategyHarnessError(`Missing strategy synthesis file: ${path}`);
  }

  const parsed = parseJson(path, io.readFile(path));
  const report = parseRawStrategySynthesisCandidatesReport(path, parsed);

  return resolveHarnessStrategySpecs(report.strategies, options);
}

/** @deprecated Use resolveHarnessStrategySpecs after raw synthesis parse. */
export function filterHarnessStrategySpecs(
  strategies: readonly SynthesizedStrategySpec[],
  options?: {
    strategyFamily?: string;
    synthesizedStrategyId?: string;
    includeRejected?: boolean;
  },
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
