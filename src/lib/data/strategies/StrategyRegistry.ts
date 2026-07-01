import type { BacktestStrategy } from "@/lib/data/backtesting/strategyTypes";

import { buyFirstAskIntent } from "./builtins/buyFirstAskIntent";
import {
  StrategyRegistryError,
  StrategyRegistryErrorCode,
} from "./strategyRegistryTypes";
import type {
  CreateStrategyRegistryInput,
  StrategyDefinition,
  StrategyRegistrySnapshot,
} from "./strategyRegistryTypes";

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  Object.freeze(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
  } else {
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }

  return value;
}

export const noopStrategyDefinition: StrategyDefinition = deepFreeze({
  strategyId: "noop",
  description: "Never emits trade intents",
  strategy: {
    strategyId: "noop",
    decide: () => [],
  },
});

export const buyFirstAskStrategyDefinition: StrategyDefinition = deepFreeze({
  strategyId: "buy-first-ask",
  description: "Buys one YES contract at the step yes ask when pricing is available",
  strategy: {
    strategyId: "buy-first-ask",
    decide: buyFirstAskIntent,
  },
});

function normalizeStrategyId(strategyId: string): string {
  return strategyId.trim();
}

function validateStrategyDefinition(definition: StrategyDefinition): void {
  const strategyId = normalizeStrategyId(definition.strategyId);
  if (!strategyId) {
    throw new StrategyRegistryError(
      "strategyId is required",
      StrategyRegistryErrorCode.INVALID_STRATEGY_ID,
    );
  }

  if (definition.strategy.strategyId !== strategyId) {
    throw new StrategyRegistryError(
      "definition.strategy.strategyId must match strategyId",
      StrategyRegistryErrorCode.STRATEGY_ID_MISMATCH,
    );
  }
}

function freezeDefinition(definition: StrategyDefinition): StrategyDefinition {
  return deepFreeze({
    strategyId: normalizeStrategyId(definition.strategyId),
    description: definition.description,
    strategy: definition.strategy,
  });
}

function sortStrategyIds(strategyIds: Iterable<string>): readonly string[] {
  return Object.freeze([...strategyIds].sort((left, right) => left.localeCompare(right)));
}

function buildDefinitionsMap(
  definitions: readonly StrategyDefinition[],
): ReadonlyMap<string, StrategyDefinition> {
  const map = new Map<string, StrategyDefinition>();

  for (const definition of definitions) {
    validateStrategyDefinition(definition);
    const strategyId = normalizeStrategyId(definition.strategyId);
    if (map.has(strategyId)) {
      throw new StrategyRegistryError(
        `Duplicate strategyId: ${strategyId}`,
        StrategyRegistryErrorCode.DUPLICATE_STRATEGY_ID,
      );
    }
    map.set(strategyId, freezeDefinition(definition));
  }

  return map;
}

export class StrategyRegistry {
  private readonly definitions: ReadonlyMap<string, StrategyDefinition>;

  private constructor(definitions: ReadonlyMap<string, StrategyDefinition>) {
    this.definitions = definitions;
  }

  static create(input: CreateStrategyRegistryInput = {}): StrategyRegistry {
    const definitions = input.definitions ?? [];
    return new StrategyRegistry(buildDefinitionsMap(definitions));
  }

  static createBuiltIn(): StrategyRegistry {
    return StrategyRegistry.create({
      definitions: [noopStrategyDefinition, buyFirstAskStrategyDefinition],
    });
  }

  register(definition: StrategyDefinition): StrategyRegistry {
    validateStrategyDefinition(definition);
    const strategyId = normalizeStrategyId(definition.strategyId);

    if (this.definitions.has(strategyId)) {
      throw new StrategyRegistryError(
        `Duplicate strategyId: ${strategyId}`,
        StrategyRegistryErrorCode.DUPLICATE_STRATEGY_ID,
      );
    }

    const nextDefinitions = new Map(this.definitions);
    nextDefinitions.set(strategyId, freezeDefinition(definition));
    return new StrategyRegistry(nextDefinitions);
  }

  resolve(strategyId: string): BacktestStrategy {
    const normalizedId = normalizeStrategyId(strategyId);
    if (!normalizedId) {
      throw new StrategyRegistryError(
        "strategyId is required",
        StrategyRegistryErrorCode.INVALID_STRATEGY_ID,
      );
    }

    const definition = this.definitions.get(normalizedId);
    if (!definition) {
      throw new StrategyRegistryError(
        `Unknown strategyId: ${normalizedId}`,
        StrategyRegistryErrorCode.UNKNOWN_STRATEGY_ID,
      );
    }

    return definition.strategy;
  }

  has(strategyId: string): boolean {
    const normalizedId = normalizeStrategyId(strategyId);
    return normalizedId.length > 0 && this.definitions.has(normalizedId);
  }

  listStrategyIds(): readonly string[] {
    return sortStrategyIds(this.definitions.keys());
  }

  snapshot(): StrategyRegistrySnapshot {
    const strategyIds = this.listStrategyIds();
    const definitions: Record<string, StrategyDefinition> = {};

    for (const strategyId of strategyIds) {
      definitions[strategyId] = this.definitions.get(strategyId)!;
    }

    return deepFreeze({
      strategyIds,
      definitions,
    });
  }
}

export {
  BUILTIN_STRATEGY_IDS,
  StrategyRegistryError,
  StrategyRegistryErrorCode,
} from "./strategyRegistryTypes";
export type {
  BuiltinStrategyId,
  CreateStrategyRegistryInput,
  StrategyDefinition,
  StrategyRegistrySnapshot,
} from "./strategyRegistryTypes";
