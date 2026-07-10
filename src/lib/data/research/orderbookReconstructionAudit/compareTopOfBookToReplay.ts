import type { TopOfBookComparisonSample } from "./orderbookReconstructionAuditTypes";
import type { ReplayTopOfBookPoint } from "./replayRawOrderbookMessages";

export type CapturedTopOfBookRecord = {
  marketTicker: string;
  sequence: number | null;
  receivedAtLocal: string;
  bookState: string;
  yesBestBidCents: number | null;
  yesBestAskCents: number | null;
  noBestBidCents: number | null;
  noBestAskCents: number | null;
  economicBookState?: string;
};

function priceEqual(left: number | null, right: number | null): boolean {
  return left === right;
}

function mismatchReason(
  captured: CapturedTopOfBookRecord,
  replayed: ReplayTopOfBookPoint,
): string | null {
  const fields: Array<[string, number | null, number | null]> = [
    ["yesBid", captured.yesBestBidCents, replayed.yesBestBidCents],
    ["yesAsk", captured.yesBestAskCents, replayed.yesBestAskCents],
    ["noBid", captured.noBestBidCents, replayed.noBestBidCents],
    ["noAsk", captured.noBestAskCents, replayed.noBestAskCents],
  ];

  const mismatches = fields.filter(([, left, right]) => !priceEqual(left, right));
  if (mismatches.length === 0) {
    return null;
  }

  return mismatches
    .map(([name, left, right]) => `${name} captured=${left ?? "null"} replayed=${right ?? "null"}`)
    .join("; ");
}

export function indexReplayPointsByMarketSequence(
  replayPoints: readonly ReplayTopOfBookPoint[],
): Map<string, ReplayTopOfBookPoint> {
  const index = new Map<string, ReplayTopOfBookPoint>();
  for (const point of replayPoints) {
    if (point.sequence === null) {
      continue;
    }
    index.set(`${point.marketTicker}:${point.sequence}`, point);
  }
  return index;
}

export function compareTopOfBookToReplay(input: {
  captured: readonly CapturedTopOfBookRecord[];
  replayPoints: readonly ReplayTopOfBookPoint[];
  sampleLimit: number;
}): {
  compared: number;
  matched: number;
  mismatched: number;
  samples: TopOfBookComparisonSample[];
} {
  const replayIndex = indexReplayPointsByMarketSequence(input.replayPoints);
  let compared = 0;
  let matched = 0;
  let mismatched = 0;
  const samples: TopOfBookComparisonSample[] = [];

  for (const record of input.captured) {
    if (record.sequence === null) {
      continue;
    }

    const replayed = replayIndex.get(`${record.marketTicker}:${record.sequence}`);
    if (!replayed) {
      continue;
    }

    compared += 1;
    const reason = mismatchReason(record, replayed);
    const isMismatch = reason !== null;
    if (isMismatch) {
      mismatched += 1;
    } else {
      matched += 1;
    }

    if (
      samples.length < input.sampleLimit
      && (isMismatch || samples.length < Math.min(5, input.sampleLimit))
    ) {
      samples.push({
        marketTicker: record.marketTicker,
        sequence: record.sequence,
        receivedAtLocal: record.receivedAtLocal,
        capturedYesBid: record.yesBestBidCents,
        capturedYesAsk: record.yesBestAskCents,
        capturedNoBid: record.noBestBidCents,
        capturedNoAsk: record.noBestAskCents,
        replayedYesBid: replayed.yesBestBidCents,
        replayedYesAsk: replayed.yesBestAskCents,
        replayedNoBid: replayed.noBestBidCents,
        replayedNoAsk: replayed.noBestAskCents,
        capturedEconomicBookState: record.economicBookState ?? "unknown",
        replayedEconomicBookState: replayed.economicBookState,
        mismatch: isMismatch,
        mismatchReason: reason,
      });
    }
  }

  return { compared, matched, mismatched, samples };
}
