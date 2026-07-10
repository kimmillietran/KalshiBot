import { z } from "zod";

import { parseIsoTimestampMs } from "@/lib/data/research/forwardCaptureReadiness/forwardCaptureReadinessMath";
import {
  M12_3_EXPECTED_TOP_OF_BOOK_FIELDS,
  type CrossedImpliedAskDiagnostics,
  type InvalidSampleRecord,
  type InvestigatedRunSummary,
  type MarketValidityBreakdown,
  type RootCauseClassification,
  type ThrottleDiagnostics,
  type TimingDiagnostics,
  type ValidBookCoverageInvestigationIo,
  type ValidBookCoverageSummary,
  type ValidityBreakdown,
  type YesNoPairingDiagnostics,
} from "./validBookCoverageInvestigationTypes";
import {
  classifyTopOfBookValidity,
  type TopOfBookValidityClass,
} from "./classifyTopOfBookValidity";

const MAX_INVALID_SAMPLES = 30;
const NEAR_CLOSE_MS = 10_000;
const FIRST_SECONDS_MS = 10_000;
const THROTTLE_TOLERANCE_MS = 150;

const captureHealthSchema = z
  .object({
    runId: z.string(),
    startedAt: z.string().optional(),
    endedAt: z.string().optional(),
    config: z
      .object({
        topOfBookThrottleMs: z.number().optional(),
        durationMinutes: z.number().optional(),
      })
      .passthrough()
      .optional(),
    capture: z
      .object({
        topOfBookRecordCount: z.number().optional(),
      })
      .passthrough()
      .optional(),
    marketDiscovery: z
      .object({
        marketsSubscribed: z.number().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const topOfBookRecordSchema = z
  .object({
    runId: z.string().optional(),
    marketTicker: z.string(),
    eventTicker: z.string().nullable().optional(),
    receivedAtLocal: z.string(),
    bookState: z.string(),
    yesBestBidCents: z.number().nullable().optional(),
    yesBestAskCents: z.number().nullable().optional(),
    noBestBidCents: z.number().nullable().optional(),
    noBestAskCents: z.number().nullable().optional(),
    yesBestBidSize: z.number().nullable().optional(),
    yesBestAskSize: z.number().nullable().optional(),
    noBestBidSize: z.number().nullable().optional(),
    noBestAskSize: z.number().nullable().optional(),
    yesSpreadCents: z.number().nullable().optional(),
    noSpreadCents: z.number().nullable().optional(),
  })
  .passthrough();

const marketMetadataSchema = z
  .object({
    runId: z.string().optional(),
    recordedAtLocal: z.string(),
    marketTicker: z.string(),
    action: z.string(),
    status: z.string().optional(),
    closeTime: z.string().nullable().optional(),
  })
  .passthrough();

function joinPath(root: string, child: string): string {
  return `${root.replace(/[\\/]+$/, "")}/${child}`;
}

function createEmptyValidityBreakdown(): ValidityBreakdown {
  return {
    totalTopOfBookRecords: 0,
    captureValidRecords: 0,
    captureInvalidRecords: 0,
    economicallyValidRecords: 0,
    parityUsableRecords: 0,
    invalidBookStateRecords: 0,
    insufficientDepthRecords: 0,
    missingYesBidRecords: 0,
    missingYesAskRecords: 0,
    missingNoBidRecords: 0,
    missingNoAskRecords: 0,
    missingYesSideRecords: 0,
    missingNoSideRecords: 0,
    crossedYesBookRecords: 0,
    crossedNoBookRecords: 0,
    lockedYesBookRecords: 0,
    lockedNoBookRecords: 0,
    impossiblePriceRecords: 0,
    outOfRangePriceRecords: 0,
    zeroOrNullSizeRecords: 0,
    captureValidShare: null,
    economicValidShare: null,
    parityUsableShare: null,
  };
}

function createEmptyCrossedDiagnostics(): CrossedImpliedAskDiagnostics {
  return {
    yesBidGreaterThanYesAskCount: 0,
    yesBidEqualsYesAskCount: 0,
    noBidGreaterThanNoAskCount: 0,
    noBidEqualsNoAskCount: 0,
    yesAskMatchesDerivedFromNoBidCount: 0,
    noAskMatchesDerivedFromYesBidCount: 0,
    negativeImpliedSpreadBeforeClampCount: 0,
    spreadClampedToZeroSuspicionCount: 0,
  };
}

function safeShare(numerator: number, denominator: number): number | null {
  if (denominator <= 0) {
    return null;
  }

  return numerator / denominator;
}

function finalizeValidityBreakdown(
  breakdown: ValidityBreakdown,
): ValidityBreakdown {
  return {
    ...breakdown,
    captureValidShare: safeShare(
      breakdown.captureValidRecords,
      breakdown.totalTopOfBookRecords,
    ),
    economicValidShare: safeShare(
      breakdown.economicallyValidRecords,
      breakdown.totalTopOfBookRecords,
    ),
    parityUsableShare: safeShare(
      breakdown.parityUsableRecords,
      breakdown.totalTopOfBookRecords,
    ),
  };
}

function accumulateValidityBreakdown(
  breakdown: ValidityBreakdown,
  validity: ReturnType<typeof classifyTopOfBookValidity>,
): void {
  breakdown.totalTopOfBookRecords += 1;
  if (validity.captureValid) {
    breakdown.captureValidRecords += 1;
  } else {
    breakdown.captureInvalidRecords += 1;
  }
  if (validity.economicallyValid) {
    breakdown.economicallyValidRecords += 1;
  }
  if (validity.parityUsable) {
    breakdown.parityUsableRecords += 1;
  }
  if (
    validity.primaryClass === "invalid-book-state"
    || validity.primaryClass === "capture-invalid"
  ) {
    breakdown.invalidBookStateRecords += 1;
  }
  if (validity.primaryClass === "insufficient-depth") {
    breakdown.insufficientDepthRecords += 1;
  }
  if (validity.missingYesBid) {
    breakdown.missingYesBidRecords += 1;
  }
  if (validity.missingYesAsk) {
    breakdown.missingYesAskRecords += 1;
  }
  if (validity.missingNoBid) {
    breakdown.missingNoBidRecords += 1;
  }
  if (validity.missingNoAsk) {
    breakdown.missingNoAskRecords += 1;
  }
  if (validity.missingYesSide) {
    breakdown.missingYesSideRecords += 1;
  }
  if (validity.missingNoSide) {
    breakdown.missingNoSideRecords += 1;
  }
  if (validity.crossedYes) {
    breakdown.crossedYesBookRecords += 1;
  }
  if (validity.crossedNo) {
    breakdown.crossedNoBookRecords += 1;
  }
  if (validity.lockedYes) {
    breakdown.lockedYesBookRecords += 1;
  }
  if (validity.lockedNo) {
    breakdown.lockedNoBookRecords += 1;
  }
  if (validity.impossiblePrice) {
    breakdown.impossiblePriceRecords += 1;
  }
  if (validity.outOfRangePrice) {
    breakdown.outOfRangePriceRecords += 1;
  }
  if (validity.zeroOrNullSize) {
    breakdown.zeroOrNullSizeRecords += 1;
  }
}

function accumulateCrossedDiagnostics(
  crossed: CrossedImpliedAskDiagnostics,
  validity: ReturnType<typeof classifyTopOfBookValidity>,
): void {
  if (validity.yesBidGreaterThanYesAsk) {
    crossed.yesBidGreaterThanYesAskCount += 1;
  }
  if (validity.yesBidEqualsYesAsk) {
    crossed.yesBidEqualsYesAskCount += 1;
  }
  if (validity.noBidGreaterThanNoAsk) {
    crossed.noBidGreaterThanNoAskCount += 1;
  }
  if (validity.noBidEqualsNoAsk) {
    crossed.noBidEqualsNoAskCount += 1;
  }
  if (validity.yesAskDerivedFromNoBid) {
    crossed.yesAskMatchesDerivedFromNoBidCount += 1;
  }
  if (validity.noAskDerivedFromYesBid) {
    crossed.noAskMatchesDerivedFromYesBidCount += 1;
  }
  if (validity.negativeImpliedSpreadBeforeClamp) {
    crossed.negativeImpliedSpreadBeforeClampCount += 1;
  }
  if (validity.spreadClampedToZeroSuspicion) {
    crossed.spreadClampedToZeroSuspicionCount += 1;
  }
}

type MarketAccumulator = {
  marketTicker: string;
  recordsSeen: number;
  captureValidRecords: number;
  economicallyValidRecords: number;
  parityUsableRecords: number;
  invalidRecords: number;
  firstSeenTimestamp: string | null;
  firstCaptureValidTimestamp: string | null;
  firstEconomicallyValidTimestamp: string | null;
  lastEconomicallyValidTimestamp: string | null;
  firstInvalidTimestamp: string | null;
  lastInvalidTimestamp: string | null;
  yesBidPresentCount: number;
  yesAskPresentCount: number;
  noBidPresentCount: number;
  noAskPresentCount: number;
  invalidReasonCounts: Map<string, number>;
};

function getOrCreateMarketAccumulator(
  markets: Map<string, MarketAccumulator>,
  marketTicker: string,
): MarketAccumulator {
  const existing = markets.get(marketTicker);
  if (existing) {
    return existing;
  }

  const created: MarketAccumulator = {
    marketTicker,
    recordsSeen: 0,
    captureValidRecords: 0,
    economicallyValidRecords: 0,
    parityUsableRecords: 0,
    invalidRecords: 0,
    firstSeenTimestamp: null,
    firstCaptureValidTimestamp: null,
    firstEconomicallyValidTimestamp: null,
    lastEconomicallyValidTimestamp: null,
    firstInvalidTimestamp: null,
    lastInvalidTimestamp: null,
    yesBidPresentCount: 0,
    yesAskPresentCount: 0,
    noBidPresentCount: 0,
    noAskPresentCount: 0,
    invalidReasonCounts: new Map(),
  };
  markets.set(marketTicker, created);
  return created;
}

function updateMarketAccumulator(
  market: MarketAccumulator,
  timestamp: string,
  validity: ReturnType<typeof classifyTopOfBookValidity>,
  record: z.infer<typeof topOfBookRecordSchema>,
): void {
  market.recordsSeen += 1;
  if (!market.firstSeenTimestamp) {
    market.firstSeenTimestamp = timestamp;
  }
  if (validity.captureValid) {
    market.captureValidRecords += 1;
    if (!market.firstCaptureValidTimestamp) {
      market.firstCaptureValidTimestamp = timestamp;
    }
  }
  if (validity.economicallyValid) {
    market.economicallyValidRecords += 1;
    if (!market.firstEconomicallyValidTimestamp) {
      market.firstEconomicallyValidTimestamp = timestamp;
    }
    market.lastEconomicallyValidTimestamp = timestamp;
  } else {
    market.invalidRecords += 1;
    if (!market.firstInvalidTimestamp) {
      market.firstInvalidTimestamp = timestamp;
    }
    market.lastInvalidTimestamp = timestamp;
    const count = market.invalidReasonCounts.get(validity.primaryClass) ?? 0;
    market.invalidReasonCounts.set(validity.primaryClass, count + 1);
  }
  if (validity.parityUsable) {
    market.parityUsableRecords += 1;
  }
  if (record.yesBestBidCents !== null && record.yesBestBidCents !== undefined) {
    market.yesBidPresentCount += 1;
  }
  if (record.yesBestAskCents !== null && record.yesBestAskCents !== undefined) {
    market.yesAskPresentCount += 1;
  }
  if (record.noBestBidCents !== null && record.noBestBidCents !== undefined) {
    market.noBidPresentCount += 1;
  }
  if (record.noBestAskCents !== null && record.noBestAskCents !== undefined) {
    market.noAskPresentCount += 1;
  }
}

function finalizeMarketBreakdown(
  market: MarketAccumulator,
): MarketValidityBreakdown {
  let dominantInvalidReason: string | null = null;
  let dominantCount = 0;
  for (const [reason, count] of market.invalidReasonCounts.entries()) {
    if (count > dominantCount) {
      dominantInvalidReason = reason;
      dominantCount = count;
    }
  }

  return {
    marketTicker: market.marketTicker,
    recordsSeen: market.recordsSeen,
    captureValidRecords: market.captureValidRecords,
    economicallyValidRecords: market.economicallyValidRecords,
    parityUsableRecords: market.parityUsableRecords,
    invalidRecords: market.invalidRecords,
    firstSeenTimestamp: market.firstSeenTimestamp,
    firstCaptureValidTimestamp: market.firstCaptureValidTimestamp,
    firstEconomicallyValidTimestamp: market.firstEconomicallyValidTimestamp,
    lastEconomicallyValidTimestamp: market.lastEconomicallyValidTimestamp,
    firstInvalidTimestamp: market.firstInvalidTimestamp,
    lastInvalidTimestamp: market.lastInvalidTimestamp,
    yesBidPresentCount: market.yesBidPresentCount,
    yesAskPresentCount: market.yesAskPresentCount,
    noBidPresentCount: market.noBidPresentCount,
    noAskPresentCount: market.noAskPresentCount,
    dominantInvalidReason,
  };
}

function maybePushInvalidSample(
  samples: InvalidSampleRecord[],
  seenClasses: Set<string>,
  input: {
    timestamp: string;
    runId: string;
    marketTicker: string;
    validityClass: TopOfBookValidityClass;
    record: z.infer<typeof topOfBookRecordSchema>;
    reason: string;
  },
): void {
  if (samples.length >= MAX_INVALID_SAMPLES) {
    return;
  }

  const key = `${input.validityClass}:${input.record.yesBestBidCents}:${input.record.yesBestAskCents}:${input.record.noBestBidCents}:${input.record.noBestAskCents}`;
  if (seenClasses.has(key)) {
    return;
  }

  seenClasses.add(key);
  samples.push({
    timestamp: input.timestamp,
    runId: input.runId,
    marketTicker: input.marketTicker,
    validityClass: input.validityClass,
    yesBidCents: input.record.yesBestBidCents ?? null,
    yesAskCents: input.record.yesBestAskCents ?? null,
    noBidCents: input.record.noBestBidCents ?? null,
    noAskCents: input.record.noBestAskCents ?? null,
    bookState: input.record.bookState,
    reason: input.reason,
  });
}

function discoverRunDirectories(
  io: ValidBookCoverageInvestigationIo,
  rootPath: string,
): string[] {
  if (!io.fileExists(rootPath) || !io.isDirectory(rootPath)) {
    return [];
  }

  return io
    .readdir(rootPath)
    .map((entry) => joinPath(rootPath, entry))
    .filter((entryPath) => io.isDirectory(entryPath))
    .filter((entryPath) => io.fileExists(joinPath(entryPath, "capture-health.json")));
}

function loadMarketMetadata(
  io: ValidBookCoverageInvestigationIo,
  runDir: string,
): z.infer<typeof marketMetadataSchema>[] {
  const metadataPath = joinPath(runDir, "market-metadata.jsonl");
  if (!io.fileExists(metadataPath)) {
    return [];
  }

  const records: z.infer<typeof marketMetadataSchema>[] = [];
  for (const line of io.readFile(metadataPath).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    try {
      const parsed = marketMetadataSchema.safeParse(JSON.parse(trimmed));
      if (parsed.success) {
        records.push(parsed.data);
      }
    } catch {
      // skip malformed
    }
  }

  return records;
}

function investigateRunDirectory(input: {
  io: ValidBookCoverageInvestigationIo;
  runDir: string;
  invalidSamples: InvalidSampleRecord[];
  invalidSampleKeys: Set<string>;
  observedFieldNames: Set<string>;
}): InvestigatedRunSummary {
  const healthPath = joinPath(input.runDir, "capture-health.json");
  const topOfBookPath = joinPath(input.runDir, "top-of-book.jsonl");
  const runIdFromDir = input.runDir.split(/[\\/]/).pop() ?? input.runDir;

  const emptyBreakdown = createEmptyValidityBreakdown();
  const emptyCrossed = createEmptyCrossedDiagnostics();
  const emptyTiming: TimingDiagnostics = {
    timeFromSubscriptionToFirstRecordMs: null,
    timeFromFirstRecordToFirstEconomicallyValidMs: null,
    invalidDurationBeforeFirstEconomicallyValidMs: null,
    recordsInFirst10Seconds: 0,
    recordsInLast10Seconds: 0,
    recordsAfterRolloverSubscription: 0,
    recordsNearMarketClose: 0,
    invalidToValidTransitionCount: 0,
    validToInvalidTransitionCount: 0,
  };
  const emptyThrottle: ThrottleDiagnostics = {
    topOfBookThrottleMs: null,
    recordsNearThrottleIntervalCount: 0,
    invalidShareNearThrottleEmits: null,
    invalidToValidTransitionsCaptured: 0,
    validToInvalidTransitionsCaptured: 0,
    firstEconomicallyValidBriefWindowSuspected: false,
    recommendedCapturePolicyFixes: [],
  };

  if (!input.io.fileExists(topOfBookPath)) {
    return {
      runId: runIdFromDir,
      scanned: false,
      skipReason: "missing top-of-book.jsonl",
      validityBreakdown: emptyBreakdown,
      crossedImpliedAsk: emptyCrossed,
      timing: emptyTiming,
      throttle: emptyThrottle,
      markets: [],
      crossedImpliedBookRecords: 0,
    };
  }

  let health: z.infer<typeof captureHealthSchema>;
  try {
    health = captureHealthSchema.parse(JSON.parse(input.io.readFile(healthPath)));
  } catch {
    return {
      runId: runIdFromDir,
      scanned: false,
      skipReason: "invalid capture-health.json",
      validityBreakdown: emptyBreakdown,
      crossedImpliedAsk: emptyCrossed,
      timing: emptyTiming,
      throttle: emptyThrottle,
      markets: [],
      crossedImpliedBookRecords: 0,
    };
  }

  const metadata = loadMarketMetadata(input.io, input.runDir);
  const subscriptionTimes = new Map<string, number>();
  const closeTimes = new Map<string, number>();
  const rolloverSubscriptionTimes: number[] = [];

  for (const entry of metadata) {
    const timestampMs = parseIsoTimestampMs(entry.recordedAtLocal);
    if (timestampMs === null) {
      continue;
    }

    if (entry.action === "subscribed") {
      subscriptionTimes.set(entry.marketTicker, timestampMs);
      rolloverSubscriptionTimes.push(timestampMs);
    }

    if (entry.closeTime) {
      const closeMs = parseIsoTimestampMs(entry.closeTime);
      if (closeMs !== null) {
        closeTimes.set(entry.marketTicker, closeMs);
      }
    }
  }

  const validityBreakdown = createEmptyValidityBreakdown();
  let crossedImpliedBookRecords = 0;
  const crossedImpliedAsk = createEmptyCrossedDiagnostics();
  const markets = new Map<string, MarketAccumulator>();
  const throttleMs = health.config?.topOfBookThrottleMs ?? null;
  const runStartedMs = parseIsoTimestampMs(health.startedAt);
  const runEndedMs = parseIsoTimestampMs(health.endedAt);

  let firstRecordMs: number | null = null;
  let firstEconomicallyValidMs: number | null = null;
  let firstSubscriptionMs: number | null = null;
  for (const timestampMs of subscriptionTimes.values()) {
    if (firstSubscriptionMs === null || timestampMs < firstSubscriptionMs) {
      firstSubscriptionMs = timestampMs;
    }
  }

  let previousValidity: ReturnType<typeof classifyTopOfBookValidity> | null = null;
  let previousTimestampMs: number | null = null;
  let previousMarketTicker: string | null = null;
  let nearThrottleInvalid = 0;
  let nearThrottleTotal = 0;
  let economicallyValidStreak = 0;
  let maxEconomicallyValidStreak = 0;

  for (const line of input.io.readFile(topOfBookPath).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    let record: z.infer<typeof topOfBookRecordSchema>;
    try {
      const raw = JSON.parse(trimmed) as Record<string, unknown>;
      for (const key of Object.keys(raw)) {
        input.observedFieldNames.add(key);
      }

      const parsed = topOfBookRecordSchema.safeParse(raw);
      if (!parsed.success) {
        continue;
      }
      record = parsed.data;
    } catch {
      continue;
    }

    const timestampMs = parseIsoTimestampMs(record.receivedAtLocal);
    const validity = classifyTopOfBookValidity({
      bookState: record.bookState,
      yesBestBidCents: record.yesBestBidCents ?? null,
      yesBestAskCents: record.yesBestAskCents ?? null,
      noBestBidCents: record.noBestBidCents ?? null,
      noBestAskCents: record.noBestAskCents ?? null,
      yesBestBidSize: record.yesBestBidSize ?? null,
      yesBestAskSize: record.yesBestAskSize ?? null,
      noBestBidSize: record.noBestBidSize ?? null,
      noBestAskSize: record.noBestAskSize ?? null,
      yesSpreadCents: record.yesSpreadCents ?? null,
      noSpreadCents: record.noSpreadCents ?? null,
      economicBookState:
        typeof record.economicBookState === "string"
          ? record.economicBookState as never
          : undefined,
      isEconomicallyValid:
        typeof record.isEconomicallyValid === "boolean"
          ? record.isEconomicallyValid
          : undefined,
      isParityUsable:
        typeof record.isParityUsable === "boolean"
          ? record.isParityUsable
          : undefined,
      yesSignedSpreadCents:
        typeof record.yesSignedSpreadCents === "number"
          ? record.yesSignedSpreadCents
          : undefined,
      noSignedSpreadCents:
        typeof record.noSignedSpreadCents === "number"
          ? record.noSignedSpreadCents
          : undefined,
      yesBookCrossed:
        typeof record.yesBookCrossed === "boolean"
          ? record.yesBookCrossed
          : undefined,
      noBookCrossed:
        typeof record.noBookCrossed === "boolean"
          ? record.noBookCrossed
          : undefined,
      yesBookLocked:
        typeof record.yesBookLocked === "boolean"
          ? record.yesBookLocked
          : undefined,
      noBookLocked:
        typeof record.noBookLocked === "boolean"
          ? record.noBookLocked
          : undefined,
    });

    accumulateValidityBreakdown(validityBreakdown, validity);
    if (validity.crossedYes || validity.crossedNo) {
      crossedImpliedBookRecords += 1;
    }
    accumulateCrossedDiagnostics(crossedImpliedAsk, validity);
    updateMarketAccumulator(
      getOrCreateMarketAccumulator(markets, record.marketTicker),
      record.receivedAtLocal,
      validity,
      record,
    );

    if (!validity.economicallyValid && !validity.parityUsable) {
      maybePushInvalidSample(input.invalidSamples, input.invalidSampleKeys, {
        timestamp: record.receivedAtLocal,
        runId: health.runId,
        marketTicker: record.marketTicker,
        validityClass: validity.primaryClass,
        record,
        reason: validity.reason,
      });
    }

    if (timestampMs !== null) {
      if (firstRecordMs === null) {
        firstRecordMs = timestampMs;
      }
      if (validity.economicallyValid && firstEconomicallyValidMs === null) {
        firstEconomicallyValidMs = timestampMs;
      }

      if (runStartedMs !== null && timestampMs - runStartedMs <= FIRST_SECONDS_MS) {
        emptyTiming.recordsInFirst10Seconds += 1;
      }
      if (runEndedMs !== null && runEndedMs - timestampMs <= FIRST_SECONDS_MS) {
        emptyTiming.recordsInLast10Seconds += 1;
      }

      const marketCloseMs = closeTimes.get(record.marketTicker);
      if (
        marketCloseMs !== null
        && marketCloseMs !== undefined
        && Math.abs(marketCloseMs - timestampMs) <= NEAR_CLOSE_MS
      ) {
        emptyTiming.recordsNearMarketClose += 1;
      }

      for (const rolloverMs of rolloverSubscriptionTimes) {
        if (
          timestampMs >= rolloverMs
          && timestampMs - rolloverMs <= FIRST_SECONDS_MS
        ) {
          emptyTiming.recordsAfterRolloverSubscription += 1;
          break;
        }
      }

      if (
        throttleMs !== null
        && throttleMs > 0
        && previousTimestampMs !== null
        && previousMarketTicker === record.marketTicker
      ) {
        const gap = timestampMs - previousTimestampMs;
        if (Math.abs(gap - throttleMs) <= THROTTLE_TOLERANCE_MS) {
          emptyThrottle.recordsNearThrottleIntervalCount += 1;
          nearThrottleTotal += 1;
          if (!validity.economicallyValid) {
            nearThrottleInvalid += 1;
          }
        }
      }
    }

    if (previousValidity !== null) {
      if (!previousValidity.economicallyValid && validity.economicallyValid) {
        emptyTiming.invalidToValidTransitionCount += 1;
        emptyThrottle.invalidToValidTransitionsCaptured += 1;
      }
      if (previousValidity.economicallyValid && !validity.economicallyValid) {
        emptyTiming.validToInvalidTransitionCount += 1;
        emptyThrottle.validToInvalidTransitionsCaptured += 1;
      }
    }

    if (validity.economicallyValid) {
      economicallyValidStreak += 1;
      maxEconomicallyValidStreak = Math.max(
        maxEconomicallyValidStreak,
        economicallyValidStreak,
      );
    } else {
      economicallyValidStreak = 0;
    }

    previousValidity = validity;
    previousTimestampMs = timestampMs;
    previousMarketTicker = record.marketTicker;
  }

  if (firstSubscriptionMs !== null && firstRecordMs !== null) {
    emptyTiming.timeFromSubscriptionToFirstRecordMs =
      firstRecordMs - firstSubscriptionMs;
  }
  if (firstRecordMs !== null && firstEconomicallyValidMs !== null) {
    emptyTiming.timeFromFirstRecordToFirstEconomicallyValidMs =
      firstEconomicallyValidMs - firstRecordMs;
    emptyTiming.invalidDurationBeforeFirstEconomicallyValidMs =
      firstEconomicallyValidMs - firstRecordMs;
  }

  emptyThrottle.topOfBookThrottleMs = throttleMs;
  emptyThrottle.invalidShareNearThrottleEmits = safeShare(
    nearThrottleInvalid,
    nearThrottleTotal,
  );
  emptyThrottle.firstEconomicallyValidBriefWindowSuspected =
    validityBreakdown.economicallyValidRecords > 0
    && maxEconomicallyValidStreak <= 3;

  const recommendedCapturePolicyFixes: string[] = [];
  if (crossedImpliedAsk.yesBidGreaterThanYesAskCount > 0) {
    recommendedCapturePolicyFixes.push(
      "Add economicBookState and stop counting sequence-valid-but-crossed records as validTopOfBookRecords.",
    );
  }
  if (emptyThrottle.topOfBookThrottleMs !== null && emptyThrottle.topOfBookThrottleMs > 0) {
    recommendedCapturePolicyFixes.push(
      "Emit immediately on invalid -> economically-valid transition, bypassing throttle once.",
    );
    recommendedCapturePolicyFixes.push(
      "Emit immediately on economically-valid -> invalid transition.",
    );
  }
  if (validityBreakdown.missingYesSideRecords > 0 || validityBreakdown.missingNoSideRecords > 0) {
    recommendedCapturePolicyFixes.push(
      "Avoid writing empty initialized-market records before snapshot unless marked awaiting-snapshot.",
    );
  }
  recommendedCapturePolicyFixes.push(
    "Write all records but label economicBookState clearly for research filtering.",
  );
  emptyThrottle.recommendedCapturePolicyFixes = [...new Set(recommendedCapturePolicyFixes)];

  return {
    runId: health.runId,
    scanned: true,
    skipReason: null,
    validityBreakdown: finalizeValidityBreakdown(validityBreakdown),
    crossedImpliedAsk,
    timing: emptyTiming,
    throttle: emptyThrottle,
    markets: [...markets.values()]
      .map(finalizeMarketBreakdown)
      .sort((left, right) => left.marketTicker.localeCompare(right.marketTicker)),
    crossedImpliedBookRecords,
  };
}

function mergeValidityBreakdown(
  left: ValidityBreakdown,
  right: ValidityBreakdown,
): ValidityBreakdown {
  return finalizeValidityBreakdown({
    totalTopOfBookRecords:
      left.totalTopOfBookRecords + right.totalTopOfBookRecords,
    captureValidRecords: left.captureValidRecords + right.captureValidRecords,
    captureInvalidRecords: left.captureInvalidRecords + right.captureInvalidRecords,
    economicallyValidRecords:
      left.economicallyValidRecords + right.economicallyValidRecords,
    parityUsableRecords: left.parityUsableRecords + right.parityUsableRecords,
    invalidBookStateRecords:
      left.invalidBookStateRecords + right.invalidBookStateRecords,
    insufficientDepthRecords:
      left.insufficientDepthRecords + right.insufficientDepthRecords,
    missingYesBidRecords: left.missingYesBidRecords + right.missingYesBidRecords,
    missingYesAskRecords: left.missingYesAskRecords + right.missingYesAskRecords,
    missingNoBidRecords: left.missingNoBidRecords + right.missingNoBidRecords,
    missingNoAskRecords: left.missingNoAskRecords + right.missingNoAskRecords,
    missingYesSideRecords: left.missingYesSideRecords + right.missingYesSideRecords,
    missingNoSideRecords: left.missingNoSideRecords + right.missingNoSideRecords,
    crossedYesBookRecords:
      left.crossedYesBookRecords + right.crossedYesBookRecords,
    crossedNoBookRecords: left.crossedNoBookRecords + right.crossedNoBookRecords,
    lockedYesBookRecords: left.lockedYesBookRecords + right.lockedYesBookRecords,
    lockedNoBookRecords: left.lockedNoBookRecords + right.lockedNoBookRecords,
    impossiblePriceRecords:
      left.impossiblePriceRecords + right.impossiblePriceRecords,
    outOfRangePriceRecords:
      left.outOfRangePriceRecords + right.outOfRangePriceRecords,
    zeroOrNullSizeRecords:
      left.zeroOrNullSizeRecords + right.zeroOrNullSizeRecords,
    captureValidShare: null,
    economicValidShare: null,
    parityUsableShare: null,
  });
}

function mergeCrossedDiagnostics(
  left: CrossedImpliedAskDiagnostics,
  right: CrossedImpliedAskDiagnostics,
): CrossedImpliedAskDiagnostics {
  return {
    yesBidGreaterThanYesAskCount:
      left.yesBidGreaterThanYesAskCount + right.yesBidGreaterThanYesAskCount,
    yesBidEqualsYesAskCount:
      left.yesBidEqualsYesAskCount + right.yesBidEqualsYesAskCount,
    noBidGreaterThanNoAskCount:
      left.noBidGreaterThanNoAskCount + right.noBidGreaterThanNoAskCount,
    noBidEqualsNoAskCount:
      left.noBidEqualsNoAskCount + right.noBidEqualsNoAskCount,
    yesAskMatchesDerivedFromNoBidCount:
      left.yesAskMatchesDerivedFromNoBidCount
      + right.yesAskMatchesDerivedFromNoBidCount,
    noAskMatchesDerivedFromYesBidCount:
      left.noAskMatchesDerivedFromYesBidCount
      + right.noAskMatchesDerivedFromYesBidCount,
    negativeImpliedSpreadBeforeClampCount:
      left.negativeImpliedSpreadBeforeClampCount
      + right.negativeImpliedSpreadBeforeClampCount,
    spreadClampedToZeroSuspicionCount:
      left.spreadClampedToZeroSuspicionCount
      + right.spreadClampedToZeroSuspicionCount,
  };
}

function buildYesNoPairingDiagnostics(
  breakdown: ValidityBreakdown,
  observedFieldNames: Set<string>,
): YesNoPairingDiagnostics {
  const total = breakdown.totalTopOfBookRecords;
  const notes: string[] = [];
  const expected = M12_3_EXPECTED_TOP_OF_BOOK_FIELDS;
  const scannerFieldMappingOk = expected.every((field) =>
    observedFieldNames.has(field),
  );

  if (scannerFieldMappingOk) {
    notes.push("M12.3 reads the same top-of-book fields the capture writer emits.");
  } else {
    notes.push("Expected M12.3 field names were not observed in capture records.");
  }

  notes.push(
    "YES and NO quotes are paired within the same market row; no separate YES/NO record join is required.",
  );

  return {
    yesBestBidCentsPresentShare: safeShare(
      total - breakdown.missingYesBidRecords,
      total,
    ),
    yesBestAskCentsPresentShare: safeShare(
      total - breakdown.missingYesAskRecords,
      total,
    ),
    noBestBidCentsPresentShare: safeShare(
      total - breakdown.missingNoBidRecords,
      total,
    ),
    noBestAskCentsPresentShare: safeShare(
      total - breakdown.missingNoAskRecords,
      total,
    ),
    yesNoFieldsPopulatedTogetherShare: safeShare(
      total - breakdown.missingYesSideRecords - breakdown.missingNoSideRecords,
      total,
    ),
    expectedFieldNames: expected,
    observedFieldNames: [...observedFieldNames].sort(),
    scannerFieldMappingOk,
    pairingNotes: notes,
  };
}

function classifyRootCause(input: {
  breakdown: ValidityBreakdown;
  crossed: CrossedImpliedAskDiagnostics;
  crossedImpliedBookRecords: number;
  yesNoPairing: YesNoPairingDiagnostics;
  runs: InvestigatedRunSummary[];
}): {
  primary: RootCauseClassification;
  secondary: RootCauseClassification[];
  recommendedNextFix: string;
  whyOnlyFewParityUsable: string;
} {
  const secondary = new Set<RootCauseClassification>();

  if (!input.yesNoPairing.scannerFieldMappingOk) {
    return {
      primary: "scanner-field-mapping-issue",
      secondary: [],
      recommendedNextFix:
        "Align M12.3 parity scanner field mapping with capture top-of-book schema.",
      whyOnlyFewParityUsable:
        "Parity scanner may be reading fields that do not exist or are named differently in capture output.",
    };
  }

  if (input.breakdown.totalTopOfBookRecords < 50) {
    return {
      primary: "insufficient-sample-size",
      secondary: [],
      recommendedNextFix: "Continue capturing more forward quote runs before drawing conclusions.",
      whyOnlyFewParityUsable:
        "Too few top-of-book records were available for stable parity usability analysis.",
    };
  }

  const crossedCount =
    input.breakdown.crossedYesBookRecords + input.breakdown.crossedNoBookRecords;

  if (crossedCount > input.breakdown.parityUsableRecords * 3) {
    secondary.add("throttle-policy-issue");
  }

  const marketSpread = input.runs.flatMap((run) => run.markets);
  const healthyMarket = marketSpread.find((m) => m.parityUsableRecords > 0);
  const unhealthyMarket = marketSpread.find(
    (m) => m.recordsSeen > 20 && m.parityUsableRecords === 0,
  );
  if (healthyMarket && unhealthyMarket) {
    secondary.add("market-selection-issue");
  }

  const rolloverHeavy = input.runs.some(
    (run) => run.timing.recordsAfterRolloverSubscription > 10,
  );
  if (
    input.breakdown.missingYesSideRecords > 0
    || input.breakdown.missingNoSideRecords > 0
    || rolloverHeavy
  ) {
    secondary.add("rollover-timing-issue");
  }

  if (
    input.crossed.spreadClampedToZeroSuspicionCount > 0
    || crossedCount > 0
  ) {
    const primary: RootCauseClassification = "capture-reconstruction-issue";
    if (input.breakdown.insufficientDepthRecords > input.breakdown.parityUsableRecords) {
      secondary.add("market-depth-actually-missing");
    }

    return {
      primary,
      secondary: [...secondary],
      recommendedNextFix:
        "Build M12.4B capture economic validity gate: add economicBookState, stop counting crossed implied books as validTopOfBookRecords, emit on invalid->valid transitions, and re-run M12.3.",
      whyOnlyFewParityUsable:
        `Capture marks ${input.breakdown.captureValidRecords}/${input.breakdown.totalTopOfBookRecords} records as bookState=valid, but only ${input.breakdown.parityUsableRecords} are parity-usable. ${input.crossedImpliedBookRecords} records have crossed implied YES/NO books from opposite-side bid derivation, and ${input.crossed.spreadClampedToZeroSuspicionCount} show spread clamped to zero despite negative implied spread.`,
    };
  }

  if (input.breakdown.insufficientDepthRecords > input.breakdown.parityUsableRecords) {
    return {
      primary: "market-depth-actually-missing",
      secondary: [...secondary],
      recommendedNextFix:
        "Continue capture on more liquid windows/markets; depth may be too thin for parity analysis.",
      whyOnlyFewParityUsable:
        "Most records fail parity usability due to insufficient displayed size, not field mapping or crossed books.",
    };
  }

  return {
    primary: "unknown",
    secondary: [...secondary],
    recommendedNextFix:
      "Extend investigation with optional raw WS diagnostics and additional capture runs.",
    whyOnlyFewParityUsable:
      "Validity breakdown does not match a single dominant known failure mode.",
  };
}

export type InvestigateValidBookCoverageResult = {
  runs: InvestigatedRunSummary[];
  aggregateValidityBreakdown: ValidityBreakdown;
  aggregateCrossedImpliedAsk: CrossedImpliedAskDiagnostics;
  yesNoPairing: YesNoPairingDiagnostics;
  summary: ValidBookCoverageSummary;
  invalidSamples: InvalidSampleRecord[];
  warnings: string[];
};

export function investigateValidBookCoverage(input: {
  io: ValidBookCoverageInvestigationIo;
  forwardQuotesDir: string;
}): InvestigateValidBookCoverageResult {
  const invalidSamples: InvalidSampleRecord[] = [];
  const invalidSampleKeys = new Set<string>();
  const warnings: string[] = [];
  const runs: InvestigatedRunSummary[] = [];
  const observedFieldNames = new Set<string>();

  for (const runDir of discoverRunDirectories(input.io, input.forwardQuotesDir)) {
    const investigated = investigateRunDirectory({
      io: input.io,
      runDir,
      invalidSamples,
      invalidSampleKeys,
      observedFieldNames,
    });
    runs.push(investigated);
    if (!investigated.scanned && investigated.skipReason) {
      warnings.push(`${investigated.runId}: ${investigated.skipReason}`);
    }
  }

  let aggregateValidityBreakdown = createEmptyValidityBreakdown();
  let aggregateCrossedImpliedAsk = createEmptyCrossedDiagnostics();
  let aggregateCrossedImpliedBookRecords = 0;
  for (const run of runs.filter((entry) => entry.scanned)) {
    aggregateValidityBreakdown = mergeValidityBreakdown(
      aggregateValidityBreakdown,
      run.validityBreakdown,
    );
    aggregateCrossedImpliedAsk = mergeCrossedDiagnostics(
      aggregateCrossedImpliedAsk,
      run.crossedImpliedAsk,
    );
    aggregateCrossedImpliedBookRecords += run.crossedImpliedBookRecords;
  }

  const yesNoPairing = buildYesNoPairingDiagnostics(
    aggregateValidityBreakdown,
    observedFieldNames,
  );
  const rootCause = classifyRootCause({
    breakdown: aggregateValidityBreakdown,
    crossed: aggregateCrossedImpliedAsk,
    crossedImpliedBookRecords: aggregateCrossedImpliedBookRecords,
    yesNoPairing,
    runs,
  });

  const crossedImpliedBookRecords = aggregateCrossedImpliedBookRecords;

  const summary: ValidBookCoverageSummary = {
    captureValidRecords: aggregateValidityBreakdown.captureValidRecords,
    economicallyValidRecords: aggregateValidityBreakdown.economicallyValidRecords,
    parityUsableRecords: aggregateValidityBreakdown.parityUsableRecords,
    crossedImpliedBookRecords,
    insufficientDepthRecords: aggregateValidityBreakdown.insufficientDepthRecords,
    scannerFieldMappingOk: yesNoPairing.scannerFieldMappingOk,
    rootCauseClassification: rootCause.primary,
    secondaryContributors: rootCause.secondary,
    recommendedNextFix: rootCause.recommendedNextFix,
    whyOnlyFewParityUsable: rootCause.whyOnlyFewParityUsable,
    isCaptureReconstructingCorrectly:
      crossedImpliedBookRecords
      <= aggregateValidityBreakdown.economicallyValidRecords,
    isCaptureValidDifferentFromEconomicallyValid:
      aggregateValidityBreakdown.captureValidRecords
      !== aggregateValidityBreakdown.economicallyValidRecords,
    areYesNoBooksAvailable:
      (yesNoPairing.yesNoFieldsPopulatedTogetherShare ?? 0) > 0.5,
    invalidConcentrationSummary: [
      aggregateValidityBreakdown.crossedYesBookRecords > 0
        ? "crossed implied YES books"
        : null,
      aggregateValidityBreakdown.crossedNoBookRecords > 0
        ? "crossed implied NO books"
        : null,
      aggregateValidityBreakdown.missingYesSideRecords > 0
        ? "missing YES side"
        : null,
      aggregateValidityBreakdown.missingNoSideRecords > 0
        ? "missing NO side"
        : null,
      aggregateValidityBreakdown.impossiblePriceRecords > 0
        ? "impossible/out-of-range prices"
        : null,
    ]
      .filter((value): value is string => Boolean(value))
      .join("; ") || "no dominant concentration identified",
  };

  return {
    runs: runs.sort((left, right) => left.runId.localeCompare(right.runId)),
    aggregateValidityBreakdown,
    aggregateCrossedImpliedAsk,
    yesNoPairing,
    summary,
    invalidSamples,
    warnings,
  };
}
