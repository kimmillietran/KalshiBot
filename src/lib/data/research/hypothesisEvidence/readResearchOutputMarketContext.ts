import {
  findLastDatasetSnapshot,
  findSettlementInDatasetSnapshots,
  readSettlementOutcomeFromRecord,
} from "@/lib/data/research/settlement";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value === "string") {
    return JSON.parse(value);
  }

  return value;
}

export type ResearchOutputMarketContext = {
  marketTicker: string;
  closeTime: string | null;
  closeTimeMs: number | null;
  settlement: "yes" | "no" | null;
};

/** Reads market close time and settlement from a runner-format research output. */
export function readResearchOutputMarketContext(
  json: string,
): ResearchOutputMarketContext | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }

  if (!isRecord(parsed) || !("dataset" in parsed)) {
    return null;
  }

  const dataset = parseJsonValue(parsed.dataset);
  if (!isRecord(dataset) || !Array.isArray(dataset.snapshots)) {
    return null;
  }

  const snapshot = findLastDatasetSnapshot(dataset.snapshots);
  if (!snapshot) {
    return null;
  }

  const marketWindow = isRecord(snapshot.marketWindow) ? snapshot.marketWindow : null;
  const marketTicker =
    (typeof snapshot.ticker === "string" ? snapshot.ticker : null)
    ?? (marketWindow && typeof marketWindow.ticker === "string"
      ? marketWindow.ticker
      : null)
    ?? "";

  const closeTime =
    marketWindow && typeof marketWindow.closeTime === "string"
      ? marketWindow.closeTime
      : null;
  const closeTimeMs = closeTime ? Date.parse(closeTime) : Number.NaN;

  const settlementResolution = findSettlementInDatasetSnapshots(dataset.snapshots);
  const settlementRecord =
    settlementResolution.snapshotIndex !== null
      ? dataset.snapshots[settlementResolution.snapshotIndex]
      : null;
  const settlementValue = isRecord(settlementRecord)
    ? settlementRecord.settlement
    : null;
  const settlementOutcome = readSettlementOutcomeFromRecord(settlementValue);
  const settlement =
    settlementOutcome === 1 ? "yes" : settlementOutcome === 0 ? "no" : null;

  if (!marketTicker) {
    return null;
  }

  return {
    marketTicker,
    closeTime,
    closeTimeMs: Number.isFinite(closeTimeMs) ? closeTimeMs : null,
    settlement,
  };
}
