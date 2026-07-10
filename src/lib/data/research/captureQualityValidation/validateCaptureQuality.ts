import type {
  CaptureFormatClassification,
  CaptureQualityValidationConfig,
  CaptureQualityValidationIo,
  CaptureQualityValidationThresholds,
  CaptureRunQualityValidation,
  EconomicStateMismatch,
  HealthCountMismatch,
  HealthReportedCounts,
  ParsedTopOfBookValidationRecord,
  RecomputedValidityCounts,
  TransitionCoverageMetrics,
} from "./captureQualityValidationTypes";
import { deriveEconomicFieldsFromRecord } from "./deriveEconomicFields";
import {
  computeSortedGaps,
  joinPath,
  median,
  parseIsoTimestampMs,
  roundShare,
} from "./captureQualityValidationUtils";

type ParsedCaptureHealth = {
  runId: string;
  verdict: string | null;
  reported: HealthReportedCounts;
};

function readOptionalBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readOptionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseTopOfBookLine(
  line: string,
  lineNumber: number,
): ParsedTopOfBookValidationRecord | null {
  const parsed = JSON.parse(line) as Record<string, unknown>;
  const marketTicker = typeof parsed.marketTicker === "string" ? parsed.marketTicker : null;
  const receivedAtLocal = typeof parsed.receivedAtLocal === "string" ? parsed.receivedAtLocal : null;

  if (!marketTicker || !receivedAtLocal) {
    return null;
  }

  const receivedAtMs = parseIsoTimestampMs(receivedAtLocal);
  if (receivedAtMs === null) {
    return null;
  }

  return {
    lineNumber,
    marketTicker,
    eventTicker: typeof parsed.eventTicker === "string" ? parsed.eventTicker : null,
    receivedAtLocal,
    receivedAtMs,
    bookState: typeof parsed.bookState === "string" ? parsed.bookState : "unknown",
    yesBestBidCents:
      typeof parsed.yesBestBidCents === "number" ? parsed.yesBestBidCents : null,
    yesBestAskCents:
      typeof parsed.yesBestAskCents === "number" ? parsed.yesBestAskCents : null,
    noBestBidCents: typeof parsed.noBestBidCents === "number" ? parsed.noBestBidCents : null,
    noBestAskCents: typeof parsed.noBestAskCents === "number" ? parsed.noBestAskCents : null,
    yesBestBidSize: typeof parsed.yesBestBidSize === "number" ? parsed.yesBestBidSize : null,
    yesBestAskSize: typeof parsed.yesBestAskSize === "number" ? parsed.yesBestAskSize : null,
    noBestBidSize: typeof parsed.noBestBidSize === "number" ? parsed.noBestBidSize : null,
    noBestAskSize: typeof parsed.noBestAskSize === "number" ? parsed.noBestAskSize : null,
    yesSpreadCents: typeof parsed.yesSpreadCents === "number" ? parsed.yesSpreadCents : null,
    noSpreadCents: typeof parsed.noSpreadCents === "number" ? parsed.noSpreadCents : null,
    reportedEconomicBookState: readOptionalString(parsed.economicBookState),
    reportedIsEconomicallyValid: readOptionalBoolean(parsed.isEconomicallyValid),
    reportedIsParityUsable: readOptionalBoolean(parsed.isParityUsable),
    reportedIsCrossed: readOptionalBoolean(parsed.isCrossed),
    reportedIsLocked: readOptionalBoolean(parsed.isLocked),
  };
}

function parseCaptureHealth(raw: string): ParsedCaptureHealth | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const orderbook =
      typeof parsed.orderbook === "object" && parsed.orderbook !== null
        ? (parsed.orderbook as Record<string, unknown>)
        : {};
    const capture =
      typeof parsed.capture === "object" && parsed.capture !== null
        ? (parsed.capture as Record<string, unknown>)
        : {};

    return {
      runId: typeof parsed.runId === "string" ? parsed.runId : "unknown-run",
      verdict: typeof parsed.verdict === "string" ? parsed.verdict : null,
      reported: {
        topOfBookRecordCount: readOptionalNumber(capture.topOfBookRecordCount),
        sequenceValidTopOfBookRecords: readOptionalNumber(orderbook.validTopOfBookRecords),
        economicallyValidTopOfBookRecords: readOptionalNumber(
          orderbook.economicallyValidTopOfBookRecords,
        ),
        parityUsableTopOfBookRecords: readOptionalNumber(orderbook.parityUsableTopOfBookRecords),
        crossedTopOfBookRecords: readOptionalNumber(orderbook.crossedTopOfBookRecords),
        insufficientDepthTopOfBookRecords: readOptionalNumber(
          orderbook.insufficientDepthTopOfBookRecords,
        ),
        awaitingSnapshotTopOfBookRecords: readOptionalNumber(
          orderbook.awaitingSnapshotTopOfBookRecords,
        ),
        invalidPriceTopOfBookRecords: readOptionalNumber(orderbook.invalidPriceTopOfBookRecords),
        captureVerdict: typeof parsed.verdict === "string" ? parsed.verdict : null,
      },
    };
  } catch {
    return null;
  }
}

function classifyFormat(records: readonly ParsedTopOfBookValidationRecord[]): CaptureFormatClassification {
  if (records.length === 0) {
    return "unknown-format";
  }

  const withEconomic = records.filter((record) => record.reportedEconomicBookState !== null).length;
  if (withEconomic === 0) {
    return "legacy-format";
  }

  if (withEconomic === records.length) {
    return "economic-state-format";
  }

  return "mixed-format";
}

function createEmptyRecomputedCounts(): RecomputedValidityCounts {
  return {
    topOfBookRecordCount: 0,
    sequenceValidTopOfBookRecords: 0,
    economicallyValidTopOfBookRecords: 0,
    parityUsableTopOfBookRecords: 0,
    bidPairPresentTopOfBookRecords: 0,
    crossedTopOfBookRecords: 0,
    insufficientDepthTopOfBookRecords: 0,
    awaitingSnapshotTopOfBookRecords: 0,
    invalidPriceTopOfBookRecords: 0,
    lockedTopOfBookRecords: 0,
    malformedJsonlLines: 0,
  };
}

function hasBidPairPresent(record: ParsedTopOfBookValidationRecord): boolean {
  const yesBid = record.yesBestBidCents;
  const noBid = record.noBestBidCents;
  return (
    yesBid !== null
    && noBid !== null
    && yesBid >= 0
    && yesBid <= 100
    && noBid >= 0
    && noBid <= 100
  );
}

function accumulateRecomputedCounts(
  counts: RecomputedValidityCounts,
  record: ParsedTopOfBookValidationRecord,
): ReturnType<typeof deriveEconomicFieldsFromRecord> {
  const derived = deriveEconomicFieldsFromRecord(record);
  counts.topOfBookRecordCount += 1;

  if (record.bookState === "valid") {
    counts.sequenceValidTopOfBookRecords += 1;
  }

  if (derived.isEconomicallyValid) {
    counts.economicallyValidTopOfBookRecords += 1;
  }

  if (derived.isParityUsable) {
    counts.parityUsableTopOfBookRecords += 1;
  }

  if (hasBidPairPresent(record)) {
    counts.bidPairPresentTopOfBookRecords += 1;
  }

  if (derived.isCrossed) {
    counts.crossedTopOfBookRecords += 1;
  }

  if (derived.economicBookState === "insufficient-depth") {
    counts.insufficientDepthTopOfBookRecords += 1;
  }

  if (
    record.bookState === "awaiting-snapshot"
    || derived.economicBookState === "awaiting-snapshot"
  ) {
    counts.awaitingSnapshotTopOfBookRecords += 1;
  }

  if (derived.economicBookState === "invalid-price") {
    counts.invalidPriceTopOfBookRecords += 1;
  }

  if (derived.isLocked) {
    counts.lockedTopOfBookRecords += 1;
  }

  return derived;
}

function compareHealthCounts(
  reported: HealthReportedCounts,
  recomputed: RecomputedValidityCounts,
  maxMismatch: number,
): HealthCountMismatch[] {
  const pairs: Array<{
    field: keyof RecomputedValidityCounts;
    healthField: keyof HealthReportedCounts;
  }> = [
    { field: "topOfBookRecordCount", healthField: "topOfBookRecordCount" },
    { field: "sequenceValidTopOfBookRecords", healthField: "sequenceValidTopOfBookRecords" },
    {
      field: "economicallyValidTopOfBookRecords",
      healthField: "economicallyValidTopOfBookRecords",
    },
    { field: "parityUsableTopOfBookRecords", healthField: "parityUsableTopOfBookRecords" },
    { field: "crossedTopOfBookRecords", healthField: "crossedTopOfBookRecords" },
    {
      field: "insufficientDepthTopOfBookRecords",
      healthField: "insufficientDepthTopOfBookRecords",
    },
    {
      field: "awaitingSnapshotTopOfBookRecords",
      healthField: "awaitingSnapshotTopOfBookRecords",
    },
    { field: "invalidPriceTopOfBookRecords", healthField: "invalidPriceTopOfBookRecords" },
  ];

  const mismatches: HealthCountMismatch[] = [];

  for (const pair of pairs) {
    const healthValue = reported[pair.healthField];
    if (typeof healthValue !== "number") {
      continue;
    }

    const recomputedValue = recomputed[pair.field];
    const delta = healthValue - recomputedValue;
    if (Math.abs(delta) > maxMismatch) {
      mismatches.push({
        field: pair.field,
        healthValue,
        recomputedValue,
        delta,
      });
    }
  }

  return mismatches;
}

function compareEconomicState(
  record: ParsedTopOfBookValidationRecord,
  derived: ReturnType<typeof deriveEconomicFieldsFromRecord>,
): EconomicStateMismatch[] {
  const mismatches: EconomicStateMismatch[] = [];

  const checks: Array<{
    field: string;
    reported: string | boolean | null;
    recomputed: string | boolean;
  }> = [
    {
      field: "economicBookState",
      reported: record.reportedEconomicBookState,
      recomputed: derived.economicBookState,
    },
    {
      field: "isEconomicallyValid",
      reported: record.reportedIsEconomicallyValid,
      recomputed: derived.isEconomicallyValid,
    },
    {
      field: "isParityUsable",
      reported: record.reportedIsParityUsable,
      recomputed: derived.isParityUsable,
    },
    {
      field: "isCrossed",
      reported: record.reportedIsCrossed,
      recomputed: derived.isCrossed,
    },
    {
      field: "isLocked",
      reported: record.reportedIsLocked,
      recomputed: derived.isLocked,
    },
  ];

  for (const check of checks) {
    if (check.reported === null) {
      continue;
    }

    if (check.reported !== check.recomputed) {
      mismatches.push({
        lineNumber: record.lineNumber,
        marketTicker: record.marketTicker,
        receivedAtLocal: record.receivedAtLocal,
        field: check.field,
        reportedValue: check.reported,
        recomputedValue: check.recomputed,
      });
    }
  }

  return mismatches;
}

function computeTransitionCoverage(
  records: readonly ParsedTopOfBookValidationRecord[],
): TransitionCoverageMetrics {
  const byMarket = new Map<string, ParsedTopOfBookValidationRecord[]>();

  for (const record of records) {
    const bucket = byMarket.get(record.marketTicker) ?? [];
    bucket.push(record);
    byMarket.set(record.marketTicker, bucket);
  }

  let invalidToValidTransitionsObserved = 0;
  let validToInvalidTransitionsObserved = 0;
  let transitionsWithEmittedRecord = 0;

  for (const marketRecords of byMarket.values()) {
    const sorted = [...marketRecords].sort((left, right) => left.receivedAtMs - right.receivedAtMs);
    let previousEconomicallyValid: boolean | null = null;

    for (const record of sorted) {
      const derived = deriveEconomicFieldsFromRecord(record);
      if (previousEconomicallyValid === false && derived.isEconomicallyValid) {
        invalidToValidTransitionsObserved += 1;
        transitionsWithEmittedRecord += 1;
      }
      if (previousEconomicallyValid === true && !derived.isEconomicallyValid) {
        validToInvalidTransitionsObserved += 1;
        transitionsWithEmittedRecord += 1;
      }
      previousEconomicallyValid = derived.isEconomicallyValid;
    }
  }

  const economicallyValidTimestamps = records
    .filter((record) => deriveEconomicFieldsFromRecord(record).isEconomicallyValid)
    .map((record) => record.receivedAtMs);
  const gaps = computeSortedGaps(economicallyValidTimestamps);

  return {
    invalidToValidTransitionsObserved,
    validToInvalidTransitionsObserved,
    transitionsWithEmittedRecord,
    medianGapBetweenEconomicallyValidMs: median(gaps),
    longestGapBetweenEconomicallyValidMs:
      gaps.length > 0 ? Math.max(...gaps) : null,
  };
}

function buildRegressionWarnings(input: {
  thresholds: CaptureQualityValidationThresholds;
  formatClassification: CaptureFormatClassification;
  healthReported: HealthReportedCounts;
  recomputed: RecomputedValidityCounts;
  healthMismatches: HealthCountMismatch[];
  economicStateMismatches: EconomicStateMismatch[];
  economicallyValidShare: number | null;
  bidPairPresentShare: number | null;
  topOfBookMissing: boolean;
  rolloverEmptyCount: number;
  rolloverTotalCount: number;
}): string[] {
  const warnings: string[] = [];

  if (input.topOfBookMissing) {
    warnings.push("top-of-book file missing");
  }

  if (input.recomputed.malformedJsonlLines > 0) {
    warnings.push(`${input.recomputed.malformedJsonlLines} malformed JSONL line(s) skipped`);
  }

  if (input.healthMismatches.length > 0) {
    warnings.push("health top-of-book counts disagree with file counts");
  }

  if (input.economicStateMismatches.length > input.thresholds.maxEconomicStateMismatchRecords) {
    warnings.push("economicBookState disagrees with recomputed state on one or more records");
  }

  if (
    input.formatClassification === "legacy-format"
    && input.healthReported.sequenceValidTopOfBookRecords !== null
    && input.recomputed.economicallyValidTopOfBookRecords
      < input.healthReported.sequenceValidTopOfBookRecords
  ) {
    warnings.push("validTopOfBookRecords appears to use ambiguous legacy sequence-valid meaning");
  }

  if (
    input.healthReported.captureVerdict === "capture-mvp-success"
    && input.economicallyValidShare !== null
    && input.economicallyValidShare < input.thresholds.minEconomicallyValidShare
    && (input.bidPairPresentShare ?? 0) < input.thresholds.minEconomicallyValidShare
  ) {
    warnings.push("capture says success but economically valid share is below threshold");
  }

  const rolloverShare =
    input.rolloverTotalCount > 0 ? input.rolloverEmptyCount / input.rolloverTotalCount : 0;
  if (rolloverShare > input.thresholds.maxEmptyRolloverRecordShare) {
    warnings.push("too many empty rollover records");
  }

  return warnings;
}

export function listForwardQuoteCaptureRunDirs(
  forwardQuotesDir: string,
  io: CaptureQualityValidationIo,
): string[] {
  if (!io.fileExists(forwardQuotesDir) || !io.isDirectory(forwardQuotesDir)) {
    return [];
  }

  return io
    .readdir(forwardQuotesDir)
    .map((entry) => joinPath(forwardQuotesDir, entry))
    .filter((entryPath) => io.isDirectory(entryPath))
    .filter((entryPath) => io.fileExists(joinPath(entryPath, "capture-health.json")))
    .sort();
}

/** Validates one forward capture run directory against recomputed economic quality metrics. */
export function validateCaptureRunQuality(input: {
  runDir: string;
  config: CaptureQualityValidationConfig;
  io: CaptureQualityValidationIo;
}): CaptureRunQualityValidation {
  const runDir = input.runDir.replace(/\\/g, "/");
  const runId = runDir.split("/").pop() ?? runDir;
  const topOfBookPath = joinPath(runDir, "top-of-book.jsonl");
  const healthPath = joinPath(runDir, "capture-health.json");
  const metadataPath = joinPath(runDir, "market-metadata.jsonl");

  if (!input.io.fileExists(topOfBookPath)) {
    return {
      runId,
      runDir,
      skipped: true,
      skipReason: "top-of-book.jsonl missing",
      formatClassification: "unknown-format",
      healthReported: {
        topOfBookRecordCount: null,
        sequenceValidTopOfBookRecords: null,
        economicallyValidTopOfBookRecords: null,
        parityUsableTopOfBookRecords: null,
        crossedTopOfBookRecords: null,
        insufficientDepthTopOfBookRecords: null,
        awaitingSnapshotTopOfBookRecords: null,
        invalidPriceTopOfBookRecords: null,
        captureVerdict: null,
      },
      recomputed: createEmptyRecomputedCounts(),
      healthMismatches: [],
      economicStateMismatches: [],
      transitionCoverage: {
        invalidToValidTransitionsObserved: 0,
        validToInvalidTransitionsObserved: 0,
        transitionsWithEmittedRecord: 0,
        medianGapBetweenEconomicallyValidMs: null,
        longestGapBetweenEconomicallyValidMs: null,
      },
      warnings: ["top-of-book file missing"],
      economicallyValidShare: null,
      parityUsableShare: null,
      sequenceValidShare: null,
      enoughForParityResearch: false,
      enoughForBidOnlyParityResearch: false,
      bidPairPresentShare: null,
    };
  }

  const health = input.io.fileExists(healthPath)
    ? parseCaptureHealth(input.io.readFile(healthPath))
    : null;

  const records: ParsedTopOfBookValidationRecord[] = [];
  const recomputed = createEmptyRecomputedCounts();
  const economicStateMismatches: EconomicStateMismatch[] = [];

  for (const [index, line] of input.io.readFile(topOfBookPath).split("\n").entries()) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    try {
      const record = parseTopOfBookLine(trimmed, index + 1);
      if (!record) {
        recomputed.malformedJsonlLines += 1;
        continue;
      }

      const derived = accumulateRecomputedCounts(recomputed, record);
      economicStateMismatches.push(...compareEconomicState(record, derived));
      records.push(record);
    } catch {
      recomputed.malformedJsonlLines += 1;
    }
  }

  let rolloverEmptyCount = 0;
  let rolloverTotalCount = 0;
  if (input.io.fileExists(metadataPath)) {
    for (const line of input.io.readFile(metadataPath).split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        if (parsed.action === "closed") {
          rolloverTotalCount += 1;
          if (parsed.status === "closed" || parsed.status === "") {
            rolloverEmptyCount += 1;
          }
        }
      } catch {
        // ignore malformed metadata lines
      }
    }
  }

  const formatClassification = classifyFormat(records);
  const healthReported = health?.reported ?? {
    topOfBookRecordCount: null,
    sequenceValidTopOfBookRecords: null,
    economicallyValidTopOfBookRecords: null,
    parityUsableTopOfBookRecords: null,
    crossedTopOfBookRecords: null,
    insufficientDepthTopOfBookRecords: null,
    awaitingSnapshotTopOfBookRecords: null,
    invalidPriceTopOfBookRecords: null,
    captureVerdict: null,
  };

  const healthMismatches = compareHealthCounts(
    healthReported,
    recomputed,
    input.config.thresholds.maxHealthCountMismatch,
  );

  const transitionCoverage = computeTransitionCoverage(records);
  const economicallyValidShare = roundShare(
    recomputed.economicallyValidTopOfBookRecords,
    recomputed.topOfBookRecordCount,
  );
  const parityUsableShare = roundShare(
    recomputed.parityUsableTopOfBookRecords,
    recomputed.topOfBookRecordCount,
  );
  const bidPairPresentShare = roundShare(
    recomputed.bidPairPresentTopOfBookRecords,
    recomputed.topOfBookRecordCount,
  );
  const sequenceValidShare = roundShare(
    recomputed.sequenceValidTopOfBookRecords,
    recomputed.topOfBookRecordCount,
  );

  const enoughForParityResearch =
    recomputed.parityUsableTopOfBookRecords >= input.config.thresholds.minParityUsableRecords
    && (economicallyValidShare ?? 0) >= input.config.thresholds.minEconomicallyValidShare;
  const enoughForBidOnlyParityResearch =
    recomputed.bidPairPresentTopOfBookRecords
      >= input.config.thresholds.minParityUsableRecords;

  const warnings = buildRegressionWarnings({
    thresholds: input.config.thresholds,
    formatClassification,
    healthReported,
    recomputed,
    healthMismatches,
    economicStateMismatches,
    economicallyValidShare,
    bidPairPresentShare,
    topOfBookMissing: false,
    rolloverEmptyCount,
    rolloverTotalCount,
  });

  return {
    runId: health?.runId ?? runId,
    runDir,
    skipped: false,
    skipReason: null,
    formatClassification,
    healthReported,
    recomputed,
    healthMismatches,
    economicStateMismatches,
    transitionCoverage,
    warnings,
    economicallyValidShare,
    parityUsableShare,
    sequenceValidShare,
    enoughForParityResearch,
    enoughForBidOnlyParityResearch,
    bidPairPresentShare,
  };
}

/** Scans all forward quote capture runs and validates each run directory. */
export function validateCaptureQuality(input: {
  config: CaptureQualityValidationConfig;
  io: CaptureQualityValidationIo;
}): CaptureRunQualityValidation[] {
  const runDirs = listForwardQuoteCaptureRunDirs(input.config.forwardQuotesDir, input.io);
  return runDirs.map((runDir) =>
    validateCaptureRunQuality({
      runDir,
      config: input.config,
      io: input.io,
    }),
  );
}
