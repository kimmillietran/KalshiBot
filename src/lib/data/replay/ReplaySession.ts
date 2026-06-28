import type { HistoricalTradingSnapshot } from "@/lib/data/snapshots/types";
import { DEFAULT_ENGINE_CONFIG } from "@/lib/trading/config/defaults";
import { stableStringify } from "@/lib/trading/config/hashConfig";
import { evaluate } from "@/lib/trading/evaluate";
import type { EngineConfig } from "@/types/domain/trading";

import { adaptHistoricalSnapshot } from "./adaptHistoricalSnapshot";
import { ReplayTimeline } from "./ReplayTimeline";
import type {
  CreateReplaySessionInput,
  ReplaySessionState,
  ReplayStepAllOutput,
  ReplayStepOutput,
  ReplayStepResult,
} from "./replaySessionTypes";

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

function buildStepResult(
  stepIndex: number,
  adaptation: ReturnType<typeof adaptHistoricalSnapshot>,
  engineOutput: ReturnType<typeof evaluate>,
): ReplayStepResult {
  return deepFreeze({
    stepIndex,
    sourceTicker: adaptation.sourceTicker,
    temporal: adaptation.temporal,
    provenance: adaptation.provenance,
    engineInput: adaptation.engineInput,
    engineOutput,
    sourceSnapshot: adaptation.sourceSnapshot,
  });
}

/** Deterministic replay session that feeds historical snapshots through `evaluate()`. */
export class ReplaySession {
  private readonly timeline: ReplayTimeline;
  private readonly engineConfig: EngineConfig;

  private constructor(timeline: ReplayTimeline, engineConfig: EngineConfig) {
    this.timeline = timeline;
    this.engineConfig = engineConfig;
  }

  static create(
    snapshots: readonly HistoricalTradingSnapshot[],
    engineConfig: EngineConfig = DEFAULT_ENGINE_CONFIG,
  ): ReplaySession {
    return new ReplaySession(
      ReplayTimeline.create({ snapshots }),
      engineConfig,
    );
  }

  static fromInput(input: CreateReplaySessionInput): ReplaySession {
    return ReplaySession.create(input.snapshots, input.engineConfig);
  }

  getState(): ReplaySessionState {
    const timelineState = this.timeline.getState();

    return Object.freeze({
      stepIndex: timelineState.cursor.index,
      totalSteps: timelineState.cursor.totalSteps,
      isEmpty: timelineState.isEmpty,
      isComplete: timelineState.isComplete,
      canStep:
        !timelineState.isEmpty &&
        !timelineState.isComplete &&
        timelineState.current !== null,
    });
  }

  getEngineConfig(): EngineConfig {
    return this.engineConfig;
  }

  getOrderedSnapshots(): readonly HistoricalTradingSnapshot[] {
    return this.timeline.getOrderedSnapshots();
  }

  step(): ReplayStepOutput {
    const timelineState = this.timeline.getState();

    if (
      timelineState.isEmpty ||
      timelineState.isComplete ||
      timelineState.current === null
    ) {
      return { session: this, result: null };
    }

    const stepIndex = timelineState.cursor.index;
    const adaptation = adaptHistoricalSnapshot(timelineState.current);
    const engineOutput = evaluate(adaptation.engineInput, this.engineConfig);
    const result = buildStepResult(stepIndex, adaptation, engineOutput);
    const nextSession = new ReplaySession(
      this.timeline.stepNext(),
      this.engineConfig,
    );

    return {
      session: nextSession,
      result,
    };
  }

  stepAll(): ReplayStepAllOutput {
    const output = this.step();
    if (!output.result) {
      return {
        session: output.session,
        results: Object.freeze([]),
      };
    }

    const rest = output.session.stepAll();
    return {
      session: rest.session,
      results: Object.freeze([output.result, ...rest.results]),
    };
  }

  reset(): ReplaySession {
    return new ReplaySession(this.timeline.reset(), this.engineConfig);
  }
}

export function serializeReplayStepResult(result: ReplayStepResult): string {
  return stableStringify(result);
}

export function serializeReplaySessionState(state: ReplaySessionState): string {
  return stableStringify(state);
}

export function serializeReplayStepResults(
  results: readonly ReplayStepResult[],
): string {
  return stableStringify(results);
}
