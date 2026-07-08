import type { EvaluationCandleSnapshot } from "@/types/domain/trading";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readFiniteNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Maps replay-engine candle JSON into evaluation candle snapshots. */
export function mapEvaluationCandleSnapshots(
  value: unknown,
): EvaluationCandleSnapshot[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const candles: EvaluationCandleSnapshot[] = [];

  for (const candle of value) {
    if (!isRecord(candle)) {
      continue;
    }

    const timestamp = readFiniteNumber(candle, "timestamp");
    const open = readFiniteNumber(candle, "open");
    const high = readFiniteNumber(candle, "high");
    const low = readFiniteNumber(candle, "low");
    const close = readFiniteNumber(candle, "close");

    if (
      timestamp === undefined
      || open === undefined
      || high === undefined
      || low === undefined
      || close === undefined
    ) {
      continue;
    }

    candles.push({ timestamp, open, high, low, close });
  }

  return candles;
}
