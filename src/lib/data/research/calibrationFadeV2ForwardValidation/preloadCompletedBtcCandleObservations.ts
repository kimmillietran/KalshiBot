import { failClosedIfCompletedCandleSourceUnavailable } from "../calibrationFadeV2Preregistration";
import { joinPath } from "../calibrationFadeForwardValidation/calibrationFadeForwardValidationUtils";

import {
  CalibrationFadeV2ForwardValidationError,
  V2_CANDLE_ARTIFACT_FILENAME,
  type CalibrationFadeV2EvidenceMode,
  type CalibrationFadeV2ForwardValidationIo,
  type ClosedMinuteObservation,
} from "./calibrationFadeV2ForwardValidationTypes";
import { parseClosedMinuteObservation } from "./parseClosedMinuteObservation";

export function normalizeV2ArtifactPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

export function defaultInRunCandlePath(captureRunDir: string): string {
  return joinPath(normalizeV2ArtifactPath(captureRunDir), V2_CANDLE_ARTIFACT_FILENAME);
}

export function isDefaultInRunCandlePath(candlesPath: string, captureRunDir: string): boolean {
  return normalizeV2ArtifactPath(candlesPath) === defaultInRunCandlePath(captureRunDir);
}

/**
 * Confirmatory records always require an explicit matching runId.
 * Diagnostic default in-run artifacts may omit runId for synthetic compatibility.
 * Any non-default --candles-path requires an explicit matching runId.
 */
export function requireExplicitCandleRunId(input: {
  evidenceMode: CalibrationFadeV2EvidenceMode;
  candlesPath: string;
  captureRunDir: string;
}): boolean {
  return input.evidenceMode === "confirmatory" || !isDefaultInRunCandlePath(input.candlesPath, input.captureRunDir);
}

function describeRunId(runId: string | null): string {
  return runId === null ? "<missing>" : JSON.stringify(runId);
}

function assertCandleRunProvenance(input: {
  observation: ClosedMinuteObservation;
  expectedRunId: string;
  requireExplicitRunId: boolean;
  candlesPath: string;
  recordNumber: number;
}): void {
  const actualRunId = input.observation.runId;
  if (actualRunId !== null && actualRunId !== input.expectedRunId) {
    throw new CalibrationFadeV2ForwardValidationError(
      `Candle observation runId is incompatible with the selected capture run `
        + `(file=${input.candlesPath} record=${input.recordNumber} `
        + `expectedRunId=${input.expectedRunId} actualRunId=${describeRunId(actualRunId)})`,
    );
  }
  if (input.requireExplicitRunId && actualRunId === null) {
    throw new CalibrationFadeV2ForwardValidationError(
      `Candle observation is missing an explicit runId required for this load `
        + `(file=${input.candlesPath} record=${input.recordNumber} `
        + `expectedRunId=${input.expectedRunId} actualRunId=<missing>)`,
    );
  }
}

export type MinuteRevisionHistory = {
  openTimeMs: number;
  closeTimeMs: number;
  timingConflict: boolean;
  observations: readonly ClosedMinuteObservation[];
};

export type CompletedCandleObservationIndex = {
  candlesPath: string;
  observations: readonly ClosedMinuteObservation[];
  byOpenTimeMs: ReadonlyMap<number, MinuteRevisionHistory>;
  minutesByCloseTimeMs: readonly MinuteRevisionHistory[];
};

function ohlcEqual(left: ClosedMinuteObservation, right: ClosedMinuteObservation): boolean {
  return (
    left.open === right.open
    && left.high === right.high
    && left.low === right.low
    && left.close === right.close
  );
}

/**
 * Loads run-scoped `btc-candles-1m.jsonl`. Missing file fails closed — never
 * constructed from spot. Groups revisions by exchange open time.
 */
export async function preloadCompletedBtcCandleObservations(input: {
  io: CalibrationFadeV2ForwardValidationIo;
  captureRunDir: string;
  candlesPath?: string | null;
  evidenceMode: CalibrationFadeV2EvidenceMode;
  expectedRunId: string;
  requireExplicitRunId: boolean;
}): Promise<CompletedCandleObservationIndex> {
  const candlesPath = normalizeV2ArtifactPath(
    input.candlesPath ?? defaultInRunCandlePath(input.captureRunDir),
  );

  const sourceAvailable = input.io.fileExists(candlesPath);
  failClosedIfCompletedCandleSourceUnavailable({
    sourceRecordType: "exchange-completed-1m-ohlc",
    sourceAvailable,
  });

  const requireObservationTimestamp = input.evidenceMode === "confirmatory";
  const observations: ClosedMinuteObservation[] = [];
  let recordNumber = 0;

  await input.io.iterateJsonl(candlesPath, {
    onLine: (line, lineNumber) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return "skip";
      }
      recordNumber += 1;
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        throw new CalibrationFadeV2ForwardValidationError(
          `Malformed JSON in ${candlesPath}`,
        );
      }
      const observation = parseClosedMinuteObservation(parsed, { requireObservationTimestamp });
      assertCandleRunProvenance({
        observation,
        expectedRunId: input.expectedRunId,
        requireExplicitRunId: input.requireExplicitRunId,
        candlesPath,
        recordNumber: lineNumber ?? recordNumber,
      });
      observations.push(observation);
      return "continue";
    },
  });

  const byOpenTimeMs = new Map<number, MinuteRevisionHistory>();
  for (const observation of observations) {
    const existing = byOpenTimeMs.get(observation.openTimeMs);
    if (!existing) {
      byOpenTimeMs.set(observation.openTimeMs, {
        openTimeMs: observation.openTimeMs,
        closeTimeMs: observation.closeTimeMs,
        timingConflict: false,
        observations: [observation],
      });
      continue;
    }
    const timingConflict =
      existing.timingConflict || existing.closeTimeMs !== observation.closeTimeMs;
    byOpenTimeMs.set(observation.openTimeMs, {
      openTimeMs: observation.openTimeMs,
      closeTimeMs: existing.closeTimeMs,
      timingConflict,
      observations: [...existing.observations, observation],
    });
  }

  for (const [openTimeMs, history] of byOpenTimeMs) {
    const sorted = [...history.observations].sort(
      (left, right) => left.observedAtLocalMs - right.observedAtLocalMs,
    );
    byOpenTimeMs.set(openTimeMs, { ...history, observations: sorted });
  }

  const minutesByCloseTimeMs = [...byOpenTimeMs.values()].sort(
    (left, right) => left.closeTimeMs - right.closeTimeMs || left.openTimeMs - right.openTimeMs,
  );

  return {
    candlesPath,
    observations,
    byOpenTimeMs,
    minutesByCloseTimeMs,
  };
}

export function selectCausalClosedMinuteAsOfT(
  history: MinuteRevisionHistory,
  timestampMs: number,
): ClosedMinuteObservation | null {
  if (history.timingConflict) {
    return null;
  }
  let selected: ClosedMinuteObservation | null = null;
  for (const observation of history.observations) {
    if (observation.observedAtLocalMs <= timestampMs && observation.firstObservedAtLocalMs <= timestampMs) {
      selected = observation;
    }
  }
  return selected;
}

export function ohlcUnchanged(left: ClosedMinuteObservation, right: ClosedMinuteObservation): boolean {
  return ohlcEqual(left, right);
}
