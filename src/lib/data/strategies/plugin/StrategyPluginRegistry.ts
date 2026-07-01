import { ALL_BASELINE_STRATEGY_PLUGINS } from "../baseline/baselineStrategyPlugins";
import { adaptStrategyPluginToBacktestStrategy } from "./adaptStrategyPlugin";
import { buyFirstAskStrategyPlugin } from "./builtins/buyFirstAskStrategyPlugin";
import { noopStrategyPlugin } from "./builtins/noopStrategyPlugin";
import {
  StrategyPluginError,
  StrategyPluginErrorCode,
} from "./strategyPluginErrors";
import type {
  CreateStrategyPluginRegistryInput,
  StrategyPlugin,
  StrategyPluginConfig,
  StrategyPluginRegistrySnapshot,
} from "./strategyPluginTypes";

function normalizeStrategyId(strategyId: string): string {
  return strategyId.trim();
}

function assertNonEmptyStrategyId(strategyId: string): string {
  const normalized = normalizeStrategyId(strategyId);
  if (!normalized) {
    throw new StrategyPluginError(
      "strategyId must be a non-empty string",
      StrategyPluginErrorCode.INVALID_STRATEGY_ID,
    );
  }

  return normalized;
}

function buildPluginsMap(
  plugins: readonly StrategyPlugin[],
): ReadonlyMap<string, StrategyPlugin> {
  const map = new Map<string, StrategyPlugin>();

  for (const plugin of plugins) {
    const normalizedId = assertNonEmptyStrategyId(plugin.strategyId);
    if (map.has(normalizedId)) {
      throw new StrategyPluginError(
        `Duplicate strategy plugin id "${normalizedId}"`,
        StrategyPluginErrorCode.DUPLICATE_STRATEGY_ID,
        normalizedId,
      );
    }

    map.set(normalizedId, plugin);
  }

  return map;
}

function sortStrategyIds(strategyIds: Iterable<string>): string[] {
  return [...strategyIds].sort((left, right) => left.localeCompare(right));
}

const BUILTIN_PLUGINS: StrategyPlugin[] = [...ALL_BASELINE_STRATEGY_PLUGINS];

export class StrategyPluginRegistry {
  private readonly plugins: ReadonlyMap<string, StrategyPlugin>;

  private constructor(plugins: ReadonlyMap<string, StrategyPlugin>) {
    this.plugins = plugins;
  }

  static create(input: CreateStrategyPluginRegistryInput = {}): StrategyPluginRegistry {
    const plugins = input.plugins ?? [];
    return new StrategyPluginRegistry(buildPluginsMap(plugins));
  }

  static createBuiltIn(): StrategyPluginRegistry {
    return StrategyPluginRegistry.create({
      plugins: [...BUILTIN_PLUGINS],
    });
  }

  register(plugin: StrategyPlugin): StrategyPluginRegistry {
    const normalizedId = assertNonEmptyStrategyId(plugin.strategyId);
    const nextPlugins = new Map(this.plugins);

    if (nextPlugins.has(normalizedId)) {
      throw new StrategyPluginError(
        `Strategy plugin "${normalizedId}" is already registered`,
        StrategyPluginErrorCode.DUPLICATE_STRATEGY_ID,
        normalizedId,
      );
    }

    nextPlugins.set(normalizedId, plugin);
    return new StrategyPluginRegistry(nextPlugins);
  }

  has(strategyId: string): boolean {
    const normalizedId = normalizeStrategyId(strategyId);
    return normalizedId.length > 0 && this.plugins.has(normalizedId);
  }

  listStrategyIds(): string[] {
    return sortStrategyIds(this.plugins.keys());
  }

  getPlugin(strategyId: string): StrategyPlugin {
    const normalizedId = assertNonEmptyStrategyId(strategyId);
    const plugin = this.plugins.get(normalizedId);
    if (!plugin) {
      throw new StrategyPluginError(
        `Unknown strategy plugin "${normalizedId}"`,
        StrategyPluginErrorCode.UNKNOWN_STRATEGY_ID,
        normalizedId,
      );
    }

    return plugin;
  }

  parseConfig(strategyId: string, strategyConfig: unknown = {}): StrategyPluginConfig {
    const plugin = this.getPlugin(strategyId);

    const parsed = plugin.configSchema.safeParse(strategyConfig);
    if (!parsed.success) {
      throw new StrategyPluginError(
        `Invalid strategy config for "${strategyId}": ${parsed.error.message}`,
        StrategyPluginErrorCode.INVALID_STRATEGY_CONFIG,
        strategyId,
      );
    }

    return parsed.data;
  }

  resolveBacktestStrategy(
    strategyId: string,
    strategyConfig: unknown = {},
  ): ReturnType<typeof adaptStrategyPluginToBacktestStrategy> {
    const plugin = this.getPlugin(strategyId);
    const config = this.parseConfig(strategyId, strategyConfig);
    return adaptStrategyPluginToBacktestStrategy(plugin, config);
  }

  snapshot(): StrategyPluginRegistrySnapshot {
    const strategyIds = this.listStrategyIds();
    const descriptions: Record<string, string> = {};

    for (const strategyId of strategyIds) {
      descriptions[strategyId] = this.getPlugin(strategyId).description;
    }

    return Object.freeze({
      strategyIds: Object.freeze(strategyIds),
      descriptions: Object.freeze(descriptions),
    });
  }
}

export { noopStrategyPlugin, buyFirstAskStrategyPlugin };
