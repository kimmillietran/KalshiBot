import type {
  CandidateIncidenceSummary,
  EvaluatedMarketInput,
  RunConcentrationRow,
  UtcHourConcentrationRow,
} from "./calibrationFadeV2EvidenceStrengthTypes";
import { meanOrNull, roundProbability } from "./enumerateExactCalibratedNull";

export function buildRunConcentration(
  markets: readonly EvaluatedMarketInput[],
): readonly RunConcentrationRow[] {
  const byRun = new Map<string, { count: number; gaps: number[] }>();
  for (const market of markets) {
    const entry = byRun.get(market.selectedRunId) ?? { count: 0, gaps: [] };
    entry.count += 1;
    if (market.calibrationGapSigned !== null && Number.isFinite(market.calibrationGapSigned)) {
      entry.gaps.push(market.calibrationGapSigned);
    }
    byRun.set(market.selectedRunId, entry);
  }
  const total = markets.length;
  return [...byRun.entries()]
    .map(([selectedRunId, entry]) => ({
      selectedRunId,
      candidateCount: entry.count,
      candidateShare: total > 0 ? roundProbability(entry.count / total, 6) : null,
      meanSignedCalibrationGap:
        entry.gaps.length > 0 ? roundProbability(meanOrNull(entry.gaps) ?? 0, 12) : null,
    }))
    .sort((left, right) => left.selectedRunId.localeCompare(right.selectedRunId));
}

export function buildUtcHourConcentration(
  markets: readonly EvaluatedMarketInput[],
): readonly UtcHourConcentrationRow[] {
  const byHour = new Map<string, number>();
  for (const market of markets) {
    if (!market.entryTimestamp) {
      continue;
    }
    const ms = Date.parse(market.entryTimestamp);
    if (!Number.isFinite(ms)) {
      continue;
    }
    const hour = new Date(ms).toISOString().slice(0, 13) + ":00:00.000Z";
    byHour.set(hour, (byHour.get(hour) ?? 0) + 1);
  }
  const total = [...byHour.values()].reduce((sum, count) => sum + count, 0);
  return [...byHour.entries()]
    .map(([utcHour, candidateCount]) => ({
      utcHour,
      candidateCount,
      candidateShare: total > 0 ? roundProbability(candidateCount / total, 6) : null,
    }))
    .sort((left, right) => left.utcHour.localeCompare(right.utcHour));
}

export function buildCandidateIncidence(input: {
  markets: readonly EvaluatedMarketInput[];
  selectedRunIds: readonly string[];
  perRun: readonly {
    selectedRunId: string;
    captureDurationSeconds: number | null;
    recordsScanned: number | null;
    qualifyingObservationCount: number | null;
    candidateEpisodeCount: number | null;
    candidateMarketCount: number;
  }[];
  source: string;
}): CandidateIncidenceSummary {
  const totalCaptureDurationSeconds = sumNullable(
    input.perRun.map((row) => row.captureDurationSeconds),
  );
  const totalRecordsScanned = sumNullable(input.perRun.map((row) => row.recordsScanned));
  const totalQualifyingObservations = sumNullable(
    input.perRun.map((row) => row.qualifyingObservationCount),
  );
  const totalCandidateEpisodes = sumNullable(input.perRun.map((row) => row.candidateEpisodeCount));
  const independentCandidateMarkets = input.markets.length;
  const captureHours =
    totalCaptureDurationSeconds !== null && totalCaptureDurationSeconds > 0
      ? totalCaptureDurationSeconds / 3600
      : null;

  return {
    selectedRunCount: input.selectedRunIds.length,
    totalCaptureDurationSeconds,
    totalRecordsScanned,
    totalQualifyingObservations,
    totalCandidateEpisodes,
    independentCandidateMarkets,
    candidatesPerCaptureHour:
      captureHours !== null && captureHours > 0
        ? roundProbability(independentCandidateMarkets / captureHours, 6)
        : null,
    candidatesPerMillionScannedRecords:
      totalRecordsScanned !== null && totalRecordsScanned > 0
        ? roundProbability((independentCandidateMarkets * 1_000_000) / totalRecordsScanned, 6)
        : null,
    perRun: [...input.perRun].sort((left, right) =>
      left.selectedRunId.localeCompare(right.selectedRunId),
    ),
    source: input.source,
  };
}

function sumNullable(values: readonly (number | null)[]): number | null {
  if (values.length === 0) {
    return null;
  }
  if (values.some((value) => value === null || !Number.isFinite(value))) {
    return null;
  }
  return values.reduce<number>((sum, value) => sum + (value as number), 0);
}
