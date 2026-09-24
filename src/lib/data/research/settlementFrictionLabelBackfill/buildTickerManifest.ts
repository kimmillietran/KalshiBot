import { createHash } from "node:crypto";

import {
  EXPECTED_DISTINCT_TICKERS,
  EXPECTED_RETAINED_SAMPLES,
  EXPECTED_SAMPLES_CONTENT_SHA256,
  FRICTION_STUDY_ID,
  LABEL_BACKFILL_STUDY_ID,
  SettlementFrictionLabelBackfillError,
  hashStable,
  type TickerManifest,
  type TickerManifestEntry,
} from "./types";

export type SampleLine = {
  marketTicker: string;
  utcDayKey: string;
  entryTimestampMs: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertUtcDayKey(day: string, context: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new SettlementFrictionLabelBackfillError(
      `invalid UTC day key in ${context}: ${day}`,
    );
  }
}

export function parseFrictionSampleLine(line: string, lineNumber: number): SampleLine {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw new SettlementFrictionLabelBackfillError(
      `Malformed samples.jsonl at line ${lineNumber}`,
    );
  }
  if (!isRecord(parsed)) {
    throw new SettlementFrictionLabelBackfillError(
      `Invalid samples.jsonl object at line ${lineNumber}`,
    );
  }
  const marketTicker = parsed.marketTicker;
  const utcDayKey = parsed.utcDayKey;
  const entryTimestampMs = parsed.entryTimestampMs;
  if (typeof marketTicker !== "string" || !marketTicker.trim()) {
    throw new SettlementFrictionLabelBackfillError(
      `samples.jsonl line ${lineNumber}: missing marketTicker`,
    );
  }
  if (typeof utcDayKey !== "string") {
    throw new SettlementFrictionLabelBackfillError(
      `samples.jsonl line ${lineNumber}: missing utcDayKey`,
    );
  }
  assertUtcDayKey(utcDayKey, `samples.jsonl line ${lineNumber}`);
  if (typeof entryTimestampMs !== "number" || !Number.isFinite(entryTimestampMs)) {
    throw new SettlementFrictionLabelBackfillError(
      `samples.jsonl line ${lineNumber}: invalid entryTimestampMs`,
    );
  }
  return {
    marketTicker: marketTicker.trim(),
    utcDayKey,
    entryTimestampMs,
  };
}

export function hashFileContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function buildTickerManifest(input: {
  samplesPath: string;
  samplesContent: string;
  eligibleUtcDays: readonly string[];
  expectedSamplesContentSha256?: string;
  expectedRetainedSamples?: number;
  expectedDistinctTickers?: number;
}): TickerManifest {
  const contentSha = hashFileContent(input.samplesContent);
  const expectedSha = input.expectedSamplesContentSha256 ?? EXPECTED_SAMPLES_CONTENT_SHA256;
  if (contentSha !== expectedSha) {
    throw new SettlementFrictionLabelBackfillError(
      `samples.jsonl content SHA mismatch: got ${contentSha}, expected ${expectedSha}`,
    );
  }

  const eligible = new Set(input.eligibleUtcDays);
  const lines = input.samplesContent.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  const byTicker = new Map<
    string,
    {
      days: Set<string>;
      sampleCount: number;
      first: number;
      last: number;
    }
  >();

  for (let i = 0; i < lines.length; i += 1) {
    const sample = parseFrictionSampleLine(lines[i]!, i + 1);
    if (!eligible.has(sample.utcDayKey)) {
      throw new SettlementFrictionLabelBackfillError(
        `Sample on non-eligible day ${sample.utcDayKey} for ticker ${sample.marketTicker}`,
      );
    }
    const existing = byTicker.get(sample.marketTicker);
    if (!existing) {
      byTicker.set(sample.marketTicker, {
        days: new Set([sample.utcDayKey]),
        sampleCount: 1,
        first: sample.entryTimestampMs,
        last: sample.entryTimestampMs,
      });
    } else {
      existing.days.add(sample.utcDayKey);
      existing.sampleCount += 1;
      existing.first = Math.min(existing.first, sample.entryTimestampMs);
      existing.last = Math.max(existing.last, sample.entryTimestampMs);
    }
  }

  const tickers: TickerManifestEntry[] = [...byTicker.entries()]
    .map(([marketTicker, agg]) => ({
      marketTicker,
      utcDayKeys: [...agg.days].sort(),
      sampleCount: agg.sampleCount,
      firstEntryTimestampMs: agg.first,
      lastEntryTimestampMs: agg.last,
    }))
    .sort((a, b) => a.marketTicker.localeCompare(b.marketTicker));

  const tickerSet = new Set(tickers.map((t) => t.marketTicker));
  if (tickerSet.size !== tickers.length) {
    throw new SettlementFrictionLabelBackfillError("Duplicate tickers in manifest aggregation");
  }

  const retainedSamples = lines.length;
  const expectedSamples = input.expectedRetainedSamples ?? EXPECTED_RETAINED_SAMPLES;
  const expectedTickers = input.expectedDistinctTickers ?? EXPECTED_DISTINCT_TICKERS;
  if (retainedSamples !== expectedSamples) {
    throw new SettlementFrictionLabelBackfillError(
      `Retained sample count mismatch: got ${retainedSamples}, expected ${expectedSamples}`,
    );
  }
  if (tickers.length !== expectedTickers) {
    throw new SettlementFrictionLabelBackfillError(
      `Distinct ticker count mismatch: got ${tickers.length}, expected ${expectedTickers}`,
    );
  }

  const eligibleUtcDays = [...input.eligibleUtcDays].sort();
  const identityPayload = {
    studyId: LABEL_BACKFILL_STUDY_ID,
    frictionStudyId: FRICTION_STUDY_ID,
    samplesContentSha256: contentSha,
    retainedSamples,
    distinctTickers: tickers.length,
    eligibleUtcDays,
    marketTickers: tickers.map((t) => t.marketTicker),
  };

  return {
    studyId: LABEL_BACKFILL_STUDY_ID,
    frictionStudyId: FRICTION_STUDY_ID,
    samplesPath: input.samplesPath,
    samplesContentSha256: contentSha,
    retainedSamples,
    distinctTickers: tickers.length,
    eligibleUtcDays,
    tickers,
    tickerManifestIdentity: hashStable(identityPayload),
  };
}

export function validateTickerManifestNoDuplicates(tickers: readonly string[]): void {
  const seen = new Set<string>();
  for (const ticker of tickers) {
    if (seen.has(ticker)) {
      throw new SettlementFrictionLabelBackfillError(`Duplicate ticker in manifest: ${ticker}`);
    }
    seen.add(ticker);
  }
}
