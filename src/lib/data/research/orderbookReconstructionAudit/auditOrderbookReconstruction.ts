import { posix } from "node:path";

import {
  kalshiOrderbookDeltaMessageSchema,
  kalshiOrderbookSnapshotMessageSchema,
} from "@/features/market-data/orderbook/schemas";
import { parseKalshiDollarToCents } from "@/features/market-data/pricing";

import { compareTopOfBookToReplay, type CapturedTopOfBookRecord } from "./compareTopOfBookToReplay";
import {
  OrderbookReconstructionAuditError,
  type DeltaSemanticsFinding,
  type MarketReconstructionFinding,
  type OppositeSideAskDerivationFinding,
  type OrderbookReconstructionAuditConfig,
  type OrderbookReconstructionAuditIo,
  type OrderbookReconstructionAuditResult,
  type RawMessageInventory,
  type ReconstructionRootCauseClassification,
  type SnapshotSemanticsFinding,
  type StalenessFinding,
} from "./orderbookReconstructionAuditTypes";
import {
  levelsMatchSnapshot,
  parseRawWsLine,
  replayRawOrderbookMessages,
  type RawWsLine,
} from "./replayRawOrderbookMessages";
import { SequenceTracker } from "@/features/market-data/orderbook/sequenceTracker";

function joinPath(root: string, child: string): string {
  return posix.join(root.replaceAll("\\", "/"), child);
}

function parseIsoMs(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[index] ?? null;
}

function incrementCount(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

function collectFieldNames(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) {
    return [];
  }

  const names: string[] = [];
  for (const [key, nested] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    names.push(path);
    if (typeof nested === "object" && nested !== null && !Array.isArray(nested)) {
      names.push(...collectFieldNames(nested, path));
    }
  }

  return names;
}

function inventoryRawMessages(lines: readonly string[], maxMessages: number): {
  inventory: RawMessageInventory;
  parsedLines: RawWsLine[];
} {
  const messageTypeCounts: Record<string, number> = {};
  const channels = new Set<string>();
  const marketTickers = new Set<string>();
  const snapshotFields = new Set<string>();
  const deltaFields = new Set<string>();
  const sideValues = new Set<string>();
  const priceFormats = new Set<string>();
  const quantityFormats = new Set<string>();
  const parsedLines: RawWsLine[] = [];
  let malformedLineCount = 0;
  let messagesScanned = 0;
  let snapshotCount = 0;
  let deltaCount = 0;
  let subscribedOkErrorCount = 0;
  let sequenceFieldPresentCount = 0;
  const notes: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    if (messagesScanned >= maxMessages) {
      break;
    }

    const parsed = parseRawWsLine(trimmed);
    if (!parsed) {
      malformedLineCount += 1;
      continue;
    }

    messagesScanned += 1;
    parsedLines.push(parsed);

    const type = parsed.messageType ?? "unknown";
    incrementCount(messageTypeCounts, type);

    if (parsed.marketTicker) {
      marketTickers.add(parsed.marketTicker);
    }
    if (parsed.sequence !== null) {
      sequenceFieldPresentCount += 1;
    }

    if (type.includes("subscribed") || type === "ok" || type === "error") {
      subscribedOkErrorCount += 1;
    }

    if (type === "orderbook_snapshot") {
      snapshotCount += 1;
      const snap = kalshiOrderbookSnapshotMessageSchema.safeParse(parsed.rawPayload);
      if (snap.success) {
        for (const field of collectFieldNames(snap.data.msg)) {
          snapshotFields.add(field);
        }
        if ((snap.data.msg.yes_dollars_fp?.length ?? 0) > 0) {
          priceFormats.add("yes_dollars_fp[string,string]");
          quantityFormats.add("yes_dollars_fp.quantity_fp");
        }
        if ((snap.data.msg.no_dollars_fp?.length ?? 0) > 0) {
          priceFormats.add("no_dollars_fp[string,string]");
          quantityFormats.add("no_dollars_fp.quantity_fp");
        }
      }
    }

    if (type === "orderbook_delta") {
      deltaCount += 1;
      const delta = kalshiOrderbookDeltaMessageSchema.safeParse(parsed.rawPayload);
      if (delta.success) {
        for (const field of collectFieldNames(delta.data.msg)) {
          deltaFields.add(field);
        }
        sideValues.add(delta.data.msg.side);
        priceFormats.add("price_dollars");
        quantityFormats.add("delta_fp");
      }
    }

    if (typeof parsed.rawPayload === "object" && parsed.rawPayload !== null) {
      const channel =
        "channel" in parsed.rawPayload && typeof parsed.rawPayload.channel === "string"
          ? parsed.rawPayload.channel
          : type.includes("orderbook") ? "orderbook" : null;
      if (channel) {
        channels.add(channel);
      }
    }
  }

  if (snapshotCount > 0 && !snapshotFields.has("yes_dollars_fp") && !snapshotFields.has("no_dollars_fp")) {
    notes.push("Snapshots lacked yes_dollars_fp/no_dollars_fp fields.");
  }

  return {
    inventory: {
      messagesScanned,
      malformedLineCount,
      messageTypeCounts,
      channelsSeen: [...channels].sort(),
      marketTickersSeen: [...marketTickers].sort(),
      snapshotCount,
      deltaCount,
      subscribedOkErrorCount,
      snapshotFieldsPresent: [...snapshotFields].sort(),
      deltaFieldsPresent: [...deltaFields].sort(),
      sequenceFieldPresentCount,
      sideValuesSeen: [...sideValues].sort(),
      priceFieldFormats: [...priceFormats].sort(),
      quantityFieldFormats: [...quantityFormats].sort(),
      notes,
    },
    parsedLines,
  };
}

function auditSnapshotSemantics(parsedLines: readonly RawWsLine[]): SnapshotSemanticsFinding {
  const evidence: string[] = [];
  let yesBidLevelsPresent = false;
  let noBidLevelsPresent = false;
  let sampleYesBestBidCents: number | null = null;
  let sampleNoBestBidCents: number | null = null;

  for (const line of parsedLines) {
    if (line.messageType !== "orderbook_snapshot") {
      continue;
    }

    const parsed = kalshiOrderbookSnapshotMessageSchema.safeParse(line.rawPayload);
    if (!parsed.success) {
      continue;
    }

    if ((parsed.data.msg.yes_dollars_fp?.length ?? 0) > 0) {
      yesBidLevelsPresent = true;
      const [price] = parsed.data.msg.yes_dollars_fp![0]!;
      sampleYesBestBidCents = parseKalshiDollarToCents(price);
    }
    if ((parsed.data.msg.no_dollars_fp?.length ?? 0) > 0) {
      noBidLevelsPresent = true;
      const [price] = parsed.data.msg.no_dollars_fp![0]!;
      sampleNoBestBidCents = parseKalshiDollarToCents(price);
    }
  }

  if (yesBidLevelsPresent && noBidLevelsPresent) {
    evidence.push("Snapshots provide separate YES and NO bid ladders via yes_dollars_fp/no_dollars_fp.");
  }
  evidence.push("No explicit ask ladders observed in snapshot payloads; asks are derived in capture.");
  evidence.push("Prices are dollar strings (e.g. 0.4500) converted to integer cents.");

  return {
    yesBidLevelsPresent,
    noBidLevelsPresent,
    yesAskLevelsPresent: false,
    noAskLevelsPresent: false,
    bothSidesPresentInSnapshot: yesBidLevelsPresent && noBidLevelsPresent,
    pricesInDollarsFp: true,
    sampleYesBestBidCents,
    sampleNoBestBidCents,
    asksDerivedFromOppositeBids: true,
    evidence,
  };
}

function auditDeltaSemantics(parsedLines: readonly RawWsLine[]): DeltaSemanticsFinding {
  let relativeMatches = 0;
  let absoluteMatches = 0;
  const evidence: string[] = [];

  type BookState = {
    yesBids: Map<number, number>;
    noBids: Map<number, number>;
    bookState: string;
    lastSeq: number | null;
    sequenceTracker: SequenceTracker;
  };

  function createBookState(): BookState {
    return {
      yesBids: new Map(),
      noBids: new Map(),
      bookState: "awaiting-snapshot",
      lastSeq: null,
      sequenceTracker: new SequenceTracker(),
    };
  }

  const books = new Map<string, { relative: BookState; absolute: BookState }>();

  for (const line of parsedLines) {
    if (line.messageType === "orderbook_snapshot") {
      const parsed = kalshiOrderbookSnapshotMessageSchema.safeParse(line.rawPayload);
      if (!parsed.success) {
        continue;
      }
      const ticker = parsed.data.msg.market_ticker;
      const state = books.get(ticker) ?? {
        relative: createBookState(),
        absolute: createBookState(),
      };

      if (state.relative.bookState === "valid") {
        if (levelsMatchSnapshot(state.relative, parsed.data)) {
          relativeMatches += 1;
        }
        if (levelsMatchSnapshot(state.absolute, parsed.data)) {
          absoluteMatches += 1;
        }
      }

      applySnapshotState(state.relative, parsed.data);
      applySnapshotState(state.absolute, parsed.data);
      books.set(ticker, state);
      continue;
    }

    if (line.messageType !== "orderbook_delta") {
      continue;
    }

    const parsed = kalshiOrderbookDeltaMessageSchema.safeParse(line.rawPayload);
    if (!parsed.success) {
      continue;
    }

    const ticker = parsed.data.msg.market_ticker;
    const state = books.get(ticker) ?? {
      relative: createBookState(),
      absolute: createBookState(),
    };

    applyRelativeDelta(state.relative, parsed.data);
    applyAbsoluteDelta(state.absolute, parsed.data);
    if (state.relative.bookState === "awaiting-snapshot") {
      state.relative.bookState = "valid";
    }
    if (state.absolute.bookState === "awaiting-snapshot") {
      state.absolute.bookState = "valid";
    }
    books.set(ticker, state);
  }

  let preferredSemantics: DeltaSemanticsFinding["preferredSemantics"] = "inconclusive";
  if (relativeMatches > absoluteMatches) {
    preferredSemantics = "relative";
    evidence.push(`Relative delta replay matched ${relativeMatches} snapshots vs ${absoluteMatches} for absolute.`);
  } else if (absoluteMatches > relativeMatches) {
    preferredSemantics = "absolute";
    evidence.push(`Absolute delta replay matched ${absoluteMatches} snapshots vs ${relativeMatches} for relative.`);
  } else {
    evidence.push("Relative and absolute delta replays matched snapshots equally.");
  }

  evidence.push("delta_fp is applied as a size change in capture (current + delta_fp).");
  evidence.push("Zero or negative resulting size removes the price level.");

  return {
    deltaFieldName: "delta_fp",
    sideFieldValues: ["yes", "no"],
    treatsQuantityAsRelativeChange: preferredSemantics !== "absolute",
    treatsZeroQuantityAsRemove: true,
    relativeReplayMatchesSnapshots: relativeMatches,
    absoluteReplayMatchesSnapshots: absoluteMatches,
    preferredSemantics,
    evidence,
  };
}

function applySnapshotState(
  book: {
    yesBids: Map<number, number>;
    noBids: Map<number, number>;
    bookState: string;
    lastSeq: number | null;
    sequenceTracker: SequenceTracker;
  },
  snapshot: ReturnType<typeof kalshiOrderbookSnapshotMessageSchema.parse>,
): void {
  book.yesBids.clear();
  book.noBids.clear();
  for (const [priceDollars, quantityFp] of snapshot.msg.yes_dollars_fp ?? []) {
    const priceCents = parseKalshiDollarToCents(priceDollars);
    const size = Number.parseFloat(quantityFp);
    if (priceCents !== null && Number.isFinite(size) && size > 0) {
      book.yesBids.set(priceCents, size);
    }
  }
  for (const [priceDollars, quantityFp] of snapshot.msg.no_dollars_fp ?? []) {
    const priceCents = parseKalshiDollarToCents(priceDollars);
    const size = Number.parseFloat(quantityFp);
    if (priceCents !== null && Number.isFinite(size) && size > 0) {
      book.noBids.set(priceCents, size);
    }
  }
  book.sequenceTracker.reset(snapshot.seq);
  book.lastSeq = snapshot.seq;
  book.bookState = "valid";
}

function applyRelativeDelta(
  book: { yesBids: Map<number, number>; noBids: Map<number, number> },
  delta: ReturnType<typeof kalshiOrderbookDeltaMessageSchema.parse>,
): void {
  const priceCents = parseKalshiDollarToCents(delta.msg.price_dollars);
  if (priceCents === null) {
    return;
  }
  const levels = delta.msg.side === "yes" ? book.yesBids : book.noBids;
  const change = Number.parseFloat(delta.msg.delta_fp);
  const next = (levels.get(priceCents) ?? 0) + change;
  if (!Number.isFinite(next) || next <= 0) {
    levels.delete(priceCents);
  } else {
    levels.set(priceCents, next);
  }
}

function applyAbsoluteDelta(
  book: { yesBids: Map<number, number>; noBids: Map<number, number> },
  delta: ReturnType<typeof kalshiOrderbookDeltaMessageSchema.parse>,
): void {
  const priceCents = parseKalshiDollarToCents(delta.msg.price_dollars);
  if (priceCents === null) {
    return;
  }
  const levels = delta.msg.side === "yes" ? book.yesBids : book.noBids;
  const next = Number.parseFloat(delta.msg.delta_fp);
  if (!Number.isFinite(next) || next <= 0) {
    levels.delete(priceCents);
  } else {
    levels.set(priceCents, next);
  }
}

function auditOppositeSideAskDerivation(
  captured: readonly CapturedTopOfBookRecord[],
): OppositeSideAskDerivationFinding {
  const evidence: string[] = [];
  let yesBidGreaterThanDerivedYesAskCount = 0;
  let noBidGreaterThanDerivedNoAskCount = 0;
  let yesAskMatchesComplementOfNoBidCount = 0;
  let noAskMatchesComplementOfYesBidCount = 0;
  let crossedFromDerivationAloneCount = 0;

  for (const record of captured) {
    const { yesBestBidCents, noBestBidCents, yesBestAskCents, noBestAskCents } = record;
    if (
      yesBestBidCents !== null
      && noBestBidCents !== null
      && yesBestAskCents !== null
      && noBestAskCents !== null
    ) {
      const derivedYesAsk = Math.max(100 - noBestBidCents, 0);
      const derivedNoAsk = Math.max(100 - yesBestBidCents, 0);
      if (yesBestAskCents === derivedYesAsk) {
        yesAskMatchesComplementOfNoBidCount += 1;
      }
      if (noBestAskCents === derivedNoAsk) {
        noAskMatchesComplementOfYesBidCount += 1;
      }
      if (yesBestBidCents > derivedYesAsk) {
        yesBidGreaterThanDerivedYesAskCount += 1;
      }
      if (noBestBidCents > derivedNoAsk) {
        noBidGreaterThanDerivedNoAskCount += 1;
      }
      if (yesBestBidCents > yesBestAskCents || noBestBidCents > noBestAskCents) {
        crossedFromDerivationAloneCount += 1;
      }
    }
  }

  const recordsCompared = captured.length;
  const crossedShare =
    recordsCompared > 0 ? crossedFromDerivationAloneCount / recordsCompared : null;

  evidence.push("Capture derives yesAsk=100-noBid and noAsk=100-yesBid from opposite-side best bids.");
  if (crossedShare !== null && crossedShare > 0.5) {
    evidence.push(
      `Crossed implied books appear in ${Math.round(crossedShare * 100)}% of captured records under complement transform.`,
    );
  }

  return {
    recordsCompared,
    yesBidGreaterThanDerivedYesAskCount,
    noBidGreaterThanDerivedNoAskCount,
    yesAskMatchesComplementOfNoBidCount,
    noAskMatchesComplementOfYesBidCount,
    crossedFromDerivationAloneCount,
    crossedShare,
    evidence,
  };
}

function auditStaleness(input: {
  captured: readonly CapturedTopOfBookRecord[];
  metadataLines: readonly string[];
  parsedLines: readonly RawWsLine[];
  replayPoints: readonly { marketTicker: string; receivedAtLocal: string; yesBookCrossed: boolean; noBookCrossed: boolean }[];
}): StalenessFinding {
  const evidence: string[] = [];
  const oppositeGaps: number[] = [];
  let crossedStatesWithStaleOppositeSide = 0;
  let crossedAfterOneSidedBurstCount = 0;
  let crossedNearRolloverCount = 0;
  let crossedNearMarketCloseCount = 0;

  const subscriptionTimes = new Map<string, number>();
  const closeTimes = new Map<string, number>();
  for (const line of input.metadataLines) {
    try {
      const record = JSON.parse(line) as Record<string, unknown>;
      const ticker = typeof record.marketTicker === "string" ? record.marketTicker : null;
      const action = typeof record.action === "string" ? record.action : null;
      const ts = parseIsoMs(typeof record.recordedAtLocal === "string" ? record.recordedAtLocal : null);
      if (!ticker || ts === null) {
        continue;
      }
      if (action === "subscribed") {
        subscriptionTimes.set(ticker, ts);
      }
      if (typeof record.closeTime === "string") {
        const closeMs = parseIsoMs(record.closeTime);
        if (closeMs !== null) {
          closeTimes.set(ticker, closeMs);
        }
      }
    } catch {
      // skip malformed metadata
    }
  }

  const lastYesUpdate = new Map<string, number>();
  const lastNoUpdate = new Map<string, number>();
  let marketsWithCrossedStates = 0;
  const marketsCrossed = new Set<string>();

  for (const line of input.parsedLines) {
    const ts = parseIsoMs(line.receivedAtLocal);
    if (ts === null || !line.marketTicker) {
      continue;
    }
    if (line.messageType === "orderbook_snapshot") {
      lastYesUpdate.set(line.marketTicker, ts);
      lastNoUpdate.set(line.marketTicker, ts);
      continue;
    }
    if (line.messageType === "orderbook_delta") {
      const parsed = kalshiOrderbookDeltaMessageSchema.safeParse(line.rawPayload);
      if (!parsed.success) {
        continue;
      }
      if (parsed.data.msg.side === "yes") {
        lastYesUpdate.set(line.marketTicker, ts);
      } else {
        lastNoUpdate.set(line.marketTicker, ts);
      }
    }
  }

  for (const point of input.replayPoints) {
    const ts = parseIsoMs(point.receivedAtLocal);
    if (ts === null) {
      continue;
    }

    if (point.yesBookCrossed || point.noBookCrossed) {
      marketsCrossed.add(point.marketTicker);
      const yesTs = lastYesUpdate.get(point.marketTicker) ?? ts;
      const noTs = lastNoUpdate.get(point.marketTicker) ?? ts;
      const gap = Math.abs(yesTs - noTs);
      oppositeGaps.push(gap);
      if (gap > 500) {
        crossedStatesWithStaleOppositeSide += 1;
      }

      const subTs = subscriptionTimes.get(point.marketTicker);
      if (subTs !== undefined && ts - subTs <= 10_000) {
        crossedNearRolloverCount += 1;
      }

      const closeTs = closeTimes.get(point.marketTicker);
      if (closeTs !== undefined && closeTs - ts <= 60_000) {
        crossedNearMarketCloseCount += 1;
      }
    }

    if (point.yesBookCrossed) {
      const noTs = lastNoUpdate.get(point.marketTicker);
      const yesTs = lastYesUpdate.get(point.marketTicker);
      if (noTs !== undefined && yesTs !== undefined && yesTs - noTs > 250) {
        crossedAfterOneSidedBurstCount += 1;
      }
    }
  }

  marketsWithCrossedStates = marketsCrossed.size;
  if (crossedStatesWithStaleOppositeSide > 0) {
    evidence.push("Crossed states often follow gaps >500ms between YES and NO ladder updates.");
  }
  if (crossedNearRolloverCount > 0) {
    evidence.push("Crossed states cluster within 10s of subscription/rollover metadata.");
  }

  return {
    marketsWithCrossedStates,
    crossedStatesWithStaleOppositeSide,
    medianOppositeSideUpdateGapMs: percentile(oppositeGaps, 50),
    p90OppositeSideUpdateGapMs: percentile(oppositeGaps, 90),
    crossedAfterOneSidedBurstCount,
    crossedNearRolloverCount,
    crossedNearMarketCloseCount,
    evidence,
  };
}

function classifyRootCause(input: {
  comparison: ReturnType<typeof compareTopOfBookToReplay>;
  deltaSemantics: DeltaSemanticsFinding;
  oppositeSide: OppositeSideAskDerivationFinding;
  staleness: StalenessFinding;
  crossedReplayShare: number | null;
}): {
  primary: ReconstructionRootCauseClassification;
  secondary: ReconstructionRootCauseClassification[];
  recommendedNextFix: string;
  crossedRecordsExplained: number;
} {
  const secondary: ReconstructionRootCauseClassification[] = [];

  if (input.deltaSemantics.preferredSemantics === "absolute") {
    return {
      primary: "delta-absolute-vs-relative-bug",
      secondary: ["stale-opposite-side-ladder"],
      recommendedNextFix:
        "Patch OrderbookCaptureBook.applyDelta to treat delta_fp as absolute level size (not relative change) and add regression tests against raw snapshots.",
      crossedRecordsExplained: input.oppositeSide.crossedFromDerivationAloneCount,
    };
  }

  if (
    input.staleness.crossedStatesWithStaleOppositeSide > 0
    && (input.oppositeSide.crossedShare ?? 0) > 0.5
  ) {
    if (input.staleness.crossedNearRolloverCount > 0) {
      secondary.push("rollover-subscription-artifact");
    }
    if (input.comparison.mismatched > input.comparison.matched) {
      secondary.push("throttle-sampling-artifact");
    }

    return {
      primary: "stale-opposite-side-ladder",
      secondary,
      recommendedNextFix:
        "Emit top-of-book only when both YES and NO ladders have fresh updates within a bounded window, or resnapshot after one-sided bursts before deriving complement asks.",
      crossedRecordsExplained: input.staleness.crossedStatesWithStaleOppositeSide,
    };
  }

  if (input.comparison.mismatched > input.comparison.matched * 0.1) {
    return {
      primary: "throttle-sampling-artifact",
      secondary: ["stale-opposite-side-ladder"],
      recommendedNextFix:
        "Align throttle emit points with replay sequence boundaries and compare emitted records against replay-at-sequence before writing top-of-book.",
      crossedRecordsExplained: input.comparison.mismatched,
    };
  }

  if ((input.crossedReplayShare ?? 0) > 0.5 && input.comparison.mismatched === 0) {
    return {
      primary: "real-crossed-market-state",
      secondary: ["stale-opposite-side-ladder", "price-transform-bug"],
      recommendedNextFix:
        "Replay matches capture and remains crossed: validate whether complement ask transform is valid for Kalshi BTC 15m markets or switch to synchronized dual-side snapshots before parity research.",
      crossedRecordsExplained: input.oppositeSide.crossedFromDerivationAloneCount,
    };
  }

  if ((input.oppositeSide.crossedShare ?? 0) > 0.5) {
    return {
      primary: "price-transform-bug",
      secondary: ["stale-opposite-side-ladder"],
      recommendedNextFix:
        "Revisit yesAsk=100-noBid transform against Kalshi docs and REST orderbook; consider explicit ask ladders if present in alternate channels.",
      crossedRecordsExplained: input.oppositeSide.crossedFromDerivationAloneCount,
    };
  }

  return {
    primary: "unknown",
    secondary: [],
    recommendedNextFix:
      "Collect additional raw snapshot/delta pairs and compare REST top-of-book against WS replay at identical timestamps.",
    crossedRecordsExplained: 0,
  };
}

function parseCapturedTopOfBook(lines: readonly string[], marketTicker: string | null): CapturedTopOfBookRecord[] {
  const records: CapturedTopOfBookRecord[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const ticker = typeof parsed.marketTicker === "string" ? parsed.marketTicker : null;
      if (!ticker || (marketTicker && ticker !== marketTicker)) {
        continue;
      }
      records.push({
        marketTicker: ticker,
        sequence: typeof parsed.sequence === "number" ? parsed.sequence : null,
        receivedAtLocal:
          typeof parsed.receivedAtLocal === "string"
            ? parsed.receivedAtLocal
            : new Date(0).toISOString(),
        bookState: typeof parsed.bookState === "string" ? parsed.bookState : "unknown",
        yesBestBidCents:
          typeof parsed.yesBestBidCents === "number" ? parsed.yesBestBidCents : null,
        yesBestAskCents:
          typeof parsed.yesBestAskCents === "number" ? parsed.yesBestAskCents : null,
        noBestBidCents:
          typeof parsed.noBestBidCents === "number" ? parsed.noBestBidCents : null,
        noBestAskCents:
          typeof parsed.noBestAskCents === "number" ? parsed.noBestAskCents : null,
        economicBookState:
          typeof parsed.economicBookState === "string" ? parsed.economicBookState : undefined,
      });
    } catch {
      // skip malformed
    }
  }
  return records;
}

function buildMarketFindings(input: {
  captured: readonly CapturedTopOfBookRecord[];
  inventory: RawMessageInventory;
  primaryRootCause: ReconstructionRootCauseClassification;
}): MarketReconstructionFinding[] {
  const byMarket = new Map<string, MarketReconstructionFinding>();

  for (const ticker of input.inventory.marketTickersSeen) {
    byMarket.set(ticker, {
      marketTicker: ticker,
      rawSnapshotCount: 0,
      rawDeltaCount: 0,
      topOfBookEmittedCount: 0,
      economicallyValidCount: 0,
      crossedCount: 0,
      firstCrossedTimestamp: null,
      lastCrossedTimestamp: null,
      dominantCrossedSide: null,
      candidateReconstructionIssue: input.primaryRootCause,
    });
  }

  for (const record of input.captured) {
    const market = byMarket.get(record.marketTicker);
    if (!market) {
      continue;
    }
    market.topOfBookEmittedCount += 1;
    if (record.economicBookState === "economically-valid") {
      market.economicallyValidCount += 1;
    }
    const crossedYes =
      record.yesBestBidCents !== null
      && record.yesBestAskCents !== null
      && record.yesBestBidCents > record.yesBestAskCents;
    const crossedNo =
      record.noBestBidCents !== null
      && record.noBestAskCents !== null
      && record.noBestBidCents > record.noBestAskCents;
    if (crossedYes || crossedNo) {
      market.crossedCount += 1;
      if (!market.firstCrossedTimestamp) {
        market.firstCrossedTimestamp = record.receivedAtLocal;
      }
      market.lastCrossedTimestamp = record.receivedAtLocal;
      if (crossedYes && crossedNo) {
        market.dominantCrossedSide = "both";
      } else if (crossedYes) {
        market.dominantCrossedSide = "yes";
      } else {
        market.dominantCrossedSide = "no";
      }
    }
  }

  return [...byMarket.values()].sort((left, right) => right.crossedCount - left.crossedCount);
}

export function auditOrderbookReconstruction(input: {
  io: OrderbookReconstructionAuditIo;
  config: OrderbookReconstructionAuditConfig;
}): OrderbookReconstructionAuditResult {
  const captureRunDir = input.config.captureRunDir.replaceAll("\\", "/");
  const healthPath = joinPath(captureRunDir, "capture-health.json");
  const rawPath = joinPath(captureRunDir, "raw-kalshi-ws.jsonl");
  const topOfBookPath = joinPath(captureRunDir, "top-of-book.jsonl");
  const metadataPath = joinPath(captureRunDir, "market-metadata.jsonl");

  if (!input.io.fileExists(captureRunDir)) {
    throw new OrderbookReconstructionAuditError(`Capture run directory not found: ${captureRunDir}`);
  }
  if (!input.io.fileExists(rawPath)) {
    throw new OrderbookReconstructionAuditError(`Missing raw-kalshi-ws.jsonl in ${captureRunDir}`);
  }
  if (!input.io.fileExists(topOfBookPath)) {
    throw new OrderbookReconstructionAuditError(`Missing top-of-book.jsonl in ${captureRunDir}`);
  }

  const warnings: string[] = [];
  let runId: string | null = null;
  if (input.io.fileExists(healthPath)) {
    try {
      const health = JSON.parse(input.io.readFile(healthPath)) as { runId?: string };
      runId = health.runId ?? null;
    } catch {
      warnings.push("Malformed capture-health.json; runId unavailable.");
    }
  } else {
    warnings.push("Missing capture-health.json.");
  }

  const rawLines = input.io.readFile(rawPath).split(/\r?\n/);
  const { inventory, parsedLines } = inventoryRawMessages(
    rawLines,
    input.config.maxRawMessages,
  );
  if (inventory.malformedLineCount > 0) {
    warnings.push(`Skipped ${inventory.malformedLineCount} malformed raw JSONL line(s).`);
  }

  const captured = parseCapturedTopOfBook(
    input.io.readFile(topOfBookPath).split(/\r?\n/),
    input.config.marketTicker,
  );
  const metadataLines = input.io.fileExists(metadataPath)
    ? input.io.readFile(metadataPath).split(/\r?\n/)
    : [];

  const { replayPoints } = replayRawOrderbookMessages({
    lines: rawLines,
    marketTicker: input.config.marketTicker,
    maxMessages: input.config.maxRawMessages,
    useCaptureBook: true,
  });

  const comparison = compareTopOfBookToReplay({
    captured,
    replayPoints,
    sampleLimit: input.config.sampleLimit,
  });

  const snapshotSemantics = auditSnapshotSemantics(parsedLines);
  const deltaSemantics = auditDeltaSemantics(parsedLines);
  const oppositeSideAskDerivation = auditOppositeSideAskDerivation(captured);
  const staleness = auditStaleness({
    captured,
    metadataLines,
    parsedLines,
    replayPoints,
  });

  const crossedReplayCount = replayPoints.filter(
    (point) => point.yesBookCrossed || point.noBookCrossed,
  ).length;
  const crossedReplayShare =
    replayPoints.length > 0 ? crossedReplayCount / replayPoints.length : null;

  const rootCause = classifyRootCause({
    comparison,
    deltaSemantics,
    oppositeSide: oppositeSideAskDerivation,
    staleness,
    crossedReplayShare,
  });

  const marketFindings = buildMarketFindings({
    captured,
    inventory,
    primaryRootCause: rootCause.primary,
  });

  for (const market of marketFindings) {
    const deltas = parsedLines.filter(
      (line) => line.marketTicker === market.marketTicker && line.messageType === "orderbook_delta",
    ).length;
    const snapshots = parsedLines.filter(
      (line) => line.marketTicker === market.marketTicker && line.messageType === "orderbook_snapshot",
    ).length;
    market.rawDeltaCount = deltas;
    market.rawSnapshotCount = snapshots;
  }

  return {
    summary: {
      captureRunDir,
      runId,
      messagesScanned: inventory.messagesScanned,
      marketsAudited: inventory.marketTickersSeen.length,
      snapshotCount: inventory.snapshotCount,
      deltaCount: inventory.deltaCount,
      topOfBookRecordsCompared: comparison.compared,
      matchedTopOfBookRecords: comparison.matched,
      mismatchedTopOfBookRecords: comparison.mismatched,
      crossedRecordsExplained: rootCause.crossedRecordsExplained,
      rootCauseClassification: rootCause.primary,
      secondaryContributors: rootCause.secondary,
      recommendedNextFix: rootCause.recommendedNextFix,
    },
    rawMessageInventory: inventory,
    snapshotSemantics,
    deltaSemantics,
    oppositeSideAskDerivation,
    staleness,
    comparisonSamples: comparison.samples,
    marketFindings,
    warnings,
  };
}
