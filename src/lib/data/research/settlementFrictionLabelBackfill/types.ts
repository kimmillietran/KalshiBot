/**
 * Manifest-based settlement-label backfill for the friction coverage study.
 * Reuses SETTLEMENT_ONLY historical import + checkpoint helpers.
 * Does not invent a fake capture-run directory.
 */

import { createHash } from "node:crypto";

import { stableStringify } from "@/lib/trading/config/hashConfig";

export const LABEL_BACKFILL_STUDY_ID =
  "kalshi-kxbtc15m-settlement-friction-label-backfill-v0" as const;

export const LABEL_BACKFILL_ANALYSIS_VERSION =
  "settlement-friction-label-backfill-v0" as const;

export const FRICTION_STUDY_ID =
  "kalshi-kxbtc15m-settlement-friction-coverage-v0" as const;

export const EXPECTED_SAMPLES_CONTENT_SHA256 =
  "3f2dad5062e566ad7feacff1fbe1c0b963bbaa4d45aaa20d2a619f31098c8728" as const;

export const EXPECTED_RETAINED_SAMPLES = 47_307 as const;
export const EXPECTED_DISTINCT_TICKERS = 3_228 as const;

export const DEFAULT_FRICTION_SAMPLES_PATH =
  "data/external-samples/cryptostruct/m16-er/work/settlement-friction-coverage/samples.jsonl" as const;

export const DEFAULT_LABEL_BACKFILL_IMPORTS_DIR =
  "data/imports/settlement-friction-label-backfill" as const;

export const DEFAULT_LABEL_BACKFILL_WORK_DIR =
  "data/external-samples/cryptostruct/m16-er/work/settlement-friction-label-backfill" as const;

export const DEFAULT_LABEL_COVERAGE_REFRESH_OUT_DIR =
  "data/research-results/external-kalshi-data-audit/m17-prep-settlement-friction-label-coverage" as const;

export class SettlementFrictionLabelBackfillError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettlementFrictionLabelBackfillError";
  }
}

export type TickerManifestEntry = {
  marketTicker: string;
  utcDayKeys: string[];
  sampleCount: number;
  firstEntryTimestampMs: number;
  lastEntryTimestampMs: number;
};

export type TickerManifest = {
  studyId: typeof LABEL_BACKFILL_STUDY_ID;
  frictionStudyId: typeof FRICTION_STUDY_ID;
  samplesPath: string;
  samplesContentSha256: string;
  retainedSamples: number;
  distinctTickers: number;
  eligibleUtcDays: string[];
  tickers: TickerManifestEntry[];
  tickerManifestIdentity: string;
};

export type LabelFieldSource =
  | "local-import"
  | "fetched-settlement-only-import"
  | "absent";

export type EnrichedSettlementLabel = {
  marketTicker: string;
  result: string | null;
  expirationValue: string | null;
  floorStrike: number | null;
  closeTime: string | null;
  settlementTs: string | null;
  openTime: string | null;
  strikeType: string | null;
  source: LabelFieldSource;
  importResultPath: string | null;
  fieldProvenance: {
    result: LabelFieldSource;
    expirationValue: LabelFieldSource;
    floorStrike: LabelFieldSource;
    closeTime: LabelFieldSource;
    settlementTs: LabelFieldSource;
  };
  completeness: "complete" | "partial" | "missing";
  missingFields: string[];
};

export function hashStable(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function syntheticManifestCaptureRunDir(manifestIdentity: string): string {
  return `ticker-manifest:${manifestIdentity}`;
}

/** Study completeness: all fields required by friction label coverage. */
export function classifyLabelCompleteness(input: {
  result: string | null;
  expirationValue: string | null;
  floorStrike: number | null;
  closeTime: string | null;
  settlementTs: string | null;
}): { completeness: "complete" | "partial" | "missing"; missingFields: string[] } {
  const missingFields: string[] = [];
  if (input.result !== "yes" && input.result !== "no") {
    missingFields.push("result");
  }
  if (!(typeof input.expirationValue === "string" && input.expirationValue.trim())) {
    missingFields.push("expirationValue");
  }
  if (!(input.floorStrike != null && Number.isFinite(input.floorStrike) && input.floorStrike > 0)) {
    missingFields.push("floorStrike");
  }
  if (!(typeof input.closeTime === "string" && Number.isFinite(Date.parse(input.closeTime)))) {
    missingFields.push("closeTime");
  }
  if (
    !(typeof input.settlementTs === "string" && Number.isFinite(Date.parse(input.settlementTs)))
  ) {
    missingFields.push("settlementTs");
  }

  if (missingFields.length === 5) {
    return { completeness: "missing", missingFields };
  }
  if (missingFields.length === 0) {
    return { completeness: "complete", missingFields };
  }
  return { completeness: "partial", missingFields };
}
