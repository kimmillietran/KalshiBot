import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { KALSHI_API_BASE } from "@/features/market-data/constants";
import { buildKalshiRestMarketPath } from "@/lib/data/importers/kalshi/kalshiRestEndpoints";
import {
  compareOfficialSettlementToObservedWindow,
  formatKxbtc15mEventTicker,
} from "@/lib/data/research/kalshiBrtiAccessProbe";
import {
  campaignLedgerPath,
  campaignLockPath,
  createFilesystemCampaignBudgetIo,
  loadOrCreateCampaignLedger,
  type CampaignBudgetIo,
} from "@/lib/data/research/kalshiBrtiAccessProbe/campaignBudget";
import type { ProbeIo } from "@/lib/data/research/kalshiBrtiAccessProbe/runKalshiBrtiAccessProbe";
import {
  retainLocalHttpResponse,
  sanitizeResponseHeaders,
} from "@/lib/data/research/kalshiBrtiAccessProbe/retainLocalResponse";
import {
  unsignedKalshiGet,
  type HttpBudget,
  type SignedGetDeps,
} from "@/lib/data/research/kalshiBrtiAccessProbe/signedKalshiGet";
import type { SignedGetResult } from "@/lib/data/research/kalshiBrtiAccessProbe/types";
import {
  resolveKalshiCaptureCredentials,
  type KalshiCaptureCredentials,
} from "@/lib/data/live/kalshiWsCaptureSpike/resolveKalshiCaptureCredentials";
import {
  analyzeSynchronizedSession,
} from "@/lib/data/research/kalshiSettlementSampleMapping/analyzeSynchronizedSession";
import {
  bindLiveMarketToPlannedClose,
  officialSettlementMatchesBoundMarket,
  type LiveMarketIdentity,
} from "@/lib/data/research/kalshiSettlementSampleMapping/bindLiveMarket";
import {
  runSynchronizedCapture,
  type SynchronizedCaptureDeps,
  type SynchronizedCaptureResult,
} from "@/lib/data/research/kalshiSettlementSampleMapping/runSynchronizedCapture";

import {
  comparePublishedAverageForStream,
  QUARTER_HOUR_WINDOW_LABEL,
  TRAILING_WINDOW_LABEL,
  type StreamMembershipComparison,
} from "./compareMembershipAverages";
import { buildSettlementEstimateBundle, type SettlementEstimateBundle } from "./settlementEstimate";
import { toSynchronizedWindowPlan } from "./freezeOneClose";
import { sha256Buffer, type RetentionReadiness } from "./retentionReadiness";
import {
  ONE_CLOSE_MAX_HTTP,
  ONE_CLOSE_MAX_RETRY_DELAY_MS,
  ONE_CLOSE_OFFICIAL_DEADLINE_AFTER_CLOSE_MS,
  ONE_CLOSE_POST_CLOSE_POLL_OFFSETS_MS,
  QUARTER_HOUR_MEMBERSHIP,
  TRAILING_MEMBERSHIP,
  OneCloseFidelityError,
  type CaptureStatus,
  type OfficialStatus,
  type OneClosePlan,
  type RetentionStatus,
} from "./types";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Classify WS capture outcome after connected+flushed. Exported for tests. */
export function classifyConnectedCaptureStatus(input: {
  stopReason: string | null | undefined;
  closedCleanly: boolean;
}): { capture: CaptureStatus; reason: string } {
  const stopReason = input.stopReason ?? null;
  if (stopReason?.startsWith("connection")) {
    return { capture: "connect-failed", reason: stopReason };
  }
  if (
    stopReason === "deadline"
    || stopReason === "planned-stop"
    || input.closedCleanly
  ) {
    return {
      capture: "ok",
      reason: stopReason ?? "capture-complete",
    };
  }
  if (stopReason != null) {
    return { capture: "limit-stop", reason: stopReason };
  }
  return { capture: "limit-stop", reason: "capture-unclean-shutdown" };
}

export type LiveOneCloseDeps = {
  unsignedGet?: typeof unsignedKalshiGet;
  resolveCredentials?: () => KalshiCaptureCredentials;
  capture?: typeof runSynchronizedCapture;
  captureDeps?: SynchronizedCaptureDeps;
  campaignIo?: CampaignBudgetIo;
  fetchImpl?: typeof fetch;
  nowMs?: () => number;
  sleep?: (ms: number) => Promise<void>;
  appendRaw?: (path: string, line: string) => void;
};

export type LiveOneCloseResult = {
  capture: CaptureStatus;
  official: OfficialStatus;
  retention: RetentionStatus;
  captured: boolean;
  reason: string;
  market: LiveMarketIdentity | null;
  discoveryStatus: string;
  captureResult: SynchronizedCaptureResult | null;
  officialExpirationRaw: string | null;
  officialAttempts: number;
  httpConsumed: number;
  httpLimit: number;
  rawCapturePath: string | null;
  rawCaptureSha256: string | null;
  rawCaptureBytes: number | null;
  officialBodyPath: string | null;
  officialBodySha256: string | null;
  channelSemantics: {
    subscribed: string[];
    observedStreamHints: Record<string, number>;
    note: string;
  };
  replay: {
    rawReopened: boolean;
    rawHashMatched: boolean | null;
    officialReopened: boolean;
    officialHashMatched: boolean | null;
  };
  membershipComparisons: StreamMembershipComparison[];
  settlementEstimate: SettlementEstimateBundle;
  streamObservationCounts: {
    cfb1Hz: number;
    cfb5Hz: number;
    cfb1HzWithSourceTs: number;
    cfb5HzWithSourceTs: number;
  };
  analysis: ReturnType<typeof analyzeSynchronizedSession> | null;
  officialComparison: ReturnType<typeof compareOfficialSettlementToObservedWindow> | {
    status: string;
    reason: string;
  };
};

async function budgetedGet(input: {
  url: string;
  signPath: string;
  purpose: "live-market-discovery" | "official-settlement-metadata";
  campaignDir: string;
  campaignId: string;
  limit: number;
  budget: HttpBudget;
  campaignIo: CampaignBudgetIo;
  deps?: LiveOneCloseDeps;
}): Promise<SignedGetResult> {
  const getter = input.deps?.unsignedGet ?? unsignedKalshiGet;
  return getter({
    url: input.url,
    signPath: input.signPath,
    budget: input.budget,
    maxRetries: 1,
    deps: {
      fetchImpl: input.deps?.fetchImpl ?? fetch,
      nowMs: input.deps?.nowMs,
      campaign: {
        ledgerPath: campaignLedgerPath(input.campaignDir),
        lockPath: campaignLockPath(input.campaignDir),
        campaignId: input.campaignId,
        limit: input.limit,
        purpose: input.purpose,
        io: input.campaignIo,
      },
    } satisfies SignedGetDeps,
  });
}

function defaultAppendRaw(path: string, line: string): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${line}\n`, "utf8");
}

function hashFileIfExists(path: string | null): { sha256: string | null; bytes: number | null } {
  if (path == null || !existsSync(path)) {
    return { sha256: null, bytes: null };
  }
  const buf = readFileSync(path);
  return { sha256: sha256Buffer(buf), bytes: buf.byteLength };
}

/**
 * Execute discovery → CFB-only WS capture → post-close official metadata for one
 * frozen close. Caller must already have verified retention readiness.
 */
export async function executeLiveOneClose(input: {
  plan: OneClosePlan;
  campaignDir: string;
  persistentRawDir: string;
  retention: RetentionReadiness;
  /** Per-close HTTP ceiling (default ONE_CLOSE_MAX_HTTP=12). */
  httpLimit?: number;
  deps?: LiveOneCloseDeps;
}): Promise<LiveOneCloseResult> {
  if (!input.retention.ready || !input.retention.primaryRoot) {
    throw new OneCloseFidelityError("execute-requires-retention-ready");
  }
  const httpLimit = input.httpLimit ?? ONE_CLOSE_MAX_HTTP;
  if (!Number.isInteger(httpLimit) || httpLimit <= 0) {
    throw new OneCloseFidelityError(`invalid-http-limit: ${httpLimit}`);
  }
  const nowMs = input.deps?.nowMs ?? Date.now;
  const wait = input.deps?.sleep ?? sleep;
  const campaignIo = input.deps?.campaignIo ?? createFilesystemCampaignBudgetIo();
  const appendRaw = input.deps?.appendRaw ?? defaultAppendRaw;

  loadOrCreateCampaignLedger({
    ledgerPath: campaignLedgerPath(input.campaignDir),
    campaignId: input.plan.campaignId,
    limit: httpLimit,
    io: campaignIo,
  });
  const ledgerForBudget = loadOrCreateCampaignLedger({
    ledgerPath: campaignLedgerPath(input.campaignDir),
    campaignId: input.plan.campaignId,
    limit: httpLimit,
    io: campaignIo,
    requireExisting: true,
  });
  const budget: HttpBudget = {
    remaining: Math.max(0, ledgerForBudget.limit - ledgerForBudget.consumed),
  };

  mkdirSync(input.persistentRawDir, { recursive: true });
  mkdirSync(join(input.persistentRawDir, "responses"), { recursive: true });

  let market: LiveMarketIdentity | null = null;
  let discoveryStatus = "not-attempted";
  let captureStatus: CaptureStatus = "pending";
  let officialStatus: OfficialStatus = "pending";
  let retentionStatus: RetentionStatus = "pending";
  let reason = "live-executing";
  let captureResult: SynchronizedCaptureResult | null = null;
  let officialExpirationRaw: string | null = null;
  let officialAttempts = 0;
  let officialBody: unknown = null;
  let officialBodyPath: string | null = null;
  let officialBodySha256: string | null = null;
  const rawCapturePath = join(input.persistentRawDir, "synchronized-capture.jsonl");

  // --- Discovery (before connect) ---
  try {
    const discovery = await budgetedGet({
      url: `${KALSHI_API_BASE}/markets?series_ticker=KXBTC15M&status=open&limit=20`,
      signPath: "/trade-api/v2/markets",
      purpose: "live-market-discovery",
      campaignDir: input.campaignDir,
      campaignId: input.plan.campaignId,
      limit: httpLimit,
      budget,
      campaignIo,
      deps: input.deps,
    });
    const bind = bindLiveMarketToPlannedClose({
      body: discovery.body,
      plannedCloseIso: input.plan.closeUtc,
      expectedEventTicker: formatKxbtc15mEventTicker(input.plan.closeMs),
    });
    discoveryStatus = bind.status;
    if (bind.status === "bound") {
      market = bind.market;
      writeFileSync(
        join(input.persistentRawDir, "bound-market.json"),
        `${JSON.stringify({ boundAtUtc: new Date(nowMs()).toISOString(), market }, null, 2)}\n`,
      );
    } else {
      captureStatus = "bind-failed";
      officialStatus = "not-attempted";
      reason = bind.reason;
    }
  } catch (error) {
    discoveryStatus = error instanceof Error ? error.message : "discovery-failed";
    captureStatus = "bind-failed";
    officialStatus = "not-attempted";
    reason = discoveryStatus;
  }

  if (market != null) {
    const credentials = (input.deps?.resolveCredentials ?? resolveKalshiCaptureCredentials)({
      readFile: (path) => readFileSync(path, "utf8"),
    });
    if (credentials.status !== "available") {
      captureStatus = "connect-failed";
      reason = `credentials-not-available:${credentials.status}`;
    } else {
      // Wait until connect earliest if early
      while (nowMs() < input.plan.connectEarliestMs) {
        await wait(Math.min(250, input.plan.connectEarliestMs - nowMs()));
      }
      if (nowMs() >= input.plan.closeMs) {
        captureStatus = "missed-slot";
        reason = "missed-slot-after-discovery";
      } else {
        const windowPlan = toSynchronizedWindowPlan({ plan: input.plan, nowMs: nowMs() });
        const runner = input.deps?.capture ?? runSynchronizedCapture;
        captureResult = await runner({
          credentials,
          market,
          plan: windowPlan,
          includeOrderbook: false,
          deps: {
            ...input.deps?.captureDeps,
            nowMs,
            sleep: wait,
            appendRaw: (line) => appendRaw(rawCapturePath, line),
          },
        });
        if (captureResult.connected && captureResult.flushed) {
          const classified = classifyConnectedCaptureStatus({
            stopReason: captureResult.limits.stopReason,
            closedCleanly: captureResult.closedCleanly,
          });
          captureStatus = classified.capture;
          reason = classified.reason;
        } else {
          captureStatus = "connect-failed";
          reason = captureResult.handshakeErrorCategory ?? "ws-not-connected";
        }
      }
    }
  }

  // --- Official metadata polls ---
  if (market != null && captureStatus === "ok") {
    const marketPath = buildKalshiRestMarketPath(market.ticker);
    const deadlineMs = input.plan.closeMs + ONE_CLOSE_OFFICIAL_DEADLINE_AFTER_CLOSE_MS;
    for (const offset of ONE_CLOSE_POST_CLOSE_POLL_OFFSETS_MS) {
      const targetMs = input.plan.closeMs + offset;
      while (nowMs() < targetMs && nowMs() < deadlineMs) {
        await wait(Math.min(250, Math.min(targetMs, deadlineMs) - nowMs()));
      }
      if (nowMs() > deadlineMs) {
        break;
      }
      const ledger = loadOrCreateCampaignLedger({
        ledgerPath: campaignLedgerPath(input.campaignDir),
        campaignId: input.plan.campaignId,
        limit: httpLimit,
        io: campaignIo,
        requireExisting: true,
      });
      if (ledger.consumed >= ledger.limit || budget.remaining <= 0) {
        break;
      }
      officialAttempts += 1;
      try {
        const result = await budgetedGet({
          url: `${KALSHI_API_BASE}${marketPath}`,
          signPath: `/trade-api/v2${marketPath}`,
          purpose: "official-settlement-metadata",
          campaignDir: input.campaignDir,
          campaignId: input.plan.campaignId,
          limit: httpLimit,
          budget,
          campaignIo,
          deps: input.deps,
        });
        officialBody = result.body;
        const retainIo: ProbeIo = {
          writeFile: (path, contents) => {
            mkdirSync(dirname(path), { recursive: true });
            writeFileSync(path, contents);
          },
          mkdir: (path) => mkdirSync(path, { recursive: true }),
        };
        const retained = retainLocalHttpResponse({
          io: retainIo,
          rawDir: input.persistentRawDir,
          name: `official-settlement-${officialAttempts}`,
          result,
          capturedAtUtc: new Date(nowMs()).toISOString(),
          responseHeaders: sanitizeResponseHeaders(undefined),
        });
        officialBodyPath = join(
          input.persistentRawDir,
          "responses",
          `official-settlement-${officialAttempts}.json`,
        );
        officialBodySha256 = retained.bodyTextHash;
        const match = officialSettlementMatchesBoundMarket({
          body: officialBody,
          bound: market,
        });
        if (match.matches && match.expirationValue && match.expirationValue.trim() !== "") {
          officialExpirationRaw = match.expirationValue;
          officialStatus = "retrieved";
          break;
        }
      } catch {
        await wait(ONE_CLOSE_MAX_RETRY_DELAY_MS);
      }
    }
    if (officialStatus !== "retrieved") {
      officialStatus = "unavailable";
    }
  } else if (officialStatus === "pending") {
    officialStatus = "not-attempted";
  }

  const rawHash = hashFileIfExists(existsSync(rawCapturePath) ? rawCapturePath : null);
  const officialHashCheck = hashFileIfExists(officialBodyPath);

  // Re-open and verify hashes (disk replay precondition)
  let rawReopened = false;
  let rawHashMatched: boolean | null = null;
  let officialReopened = false;
  let officialHashMatched: boolean | null = null;
  if (rawHash.sha256) {
    const again = hashFileIfExists(rawCapturePath);
    rawReopened = again.sha256 != null;
    rawHashMatched = again.sha256 === rawHash.sha256;
  }
  if (officialBodyPath && officialBodySha256) {
    try {
      const again = readFileSync(officialBodyPath, "utf8");
      const parsed = JSON.parse(again) as { bodyTextHash?: string };
      officialReopened = true;
      officialHashMatched = parsed.bodyTextHash === officialBodySha256
        && officialHashCheck.sha256 != null;
    } catch {
      officialReopened = false;
      officialHashMatched = false;
    }
  }

  if (captureStatus === "ok" && rawHashMatched === true) {
    retentionStatus = officialBodyPath && officialHashMatched === false
      ? "failed"
      : "verified";
  } else if (captureStatus === "ok") {
    retentionStatus = "failed";
  } else {
    retentionStatus = "not-attempted";
  }

  const analysis = captureResult != null
    ? analyzeSynchronizedSession({
      capture: captureResult,
      market,
      officialBody: officialBody ?? undefined,
    })
    : null;

  // Stream-separated membership: 1Hz only for published-field reproduction.
  // Never feed combined rawBrti into a comparison labeled as 1Hz.
  const oneHzCollection = captureResult?.rawBrti1Hz
    ?? (captureResult?.rawBrti ?? []).filter((row) => row.channelHint === "cfb-1hz");
  const fiveHzCollection = captureResult?.rawBrti5Hz
    ?? (captureResult?.rawBrti ?? []).filter((row) => row.channelHint === "cfb-5hz");

  const settlementPublished = analysis?.completedSettlementAverage?.valueRaw ?? null;
  const trailingPublished = analysis?.exploratoryTrailingAtClose?.valueRaw
    ?? analysis?.venueAlignments?.find((row) => (
      row.update.fieldName === "avg_60s_data"
      && row.update.count === 60
      && row.update.windowStartTsMs === input.plan.closeMs - 60_000
      && row.update.windowEndTsExclusive === input.plan.closeMs
    ))?.update.valueRaw
    ?? null;

  const membershipComparisons = [
    comparePublishedAverageForStream({
      fieldName: "last_60s_windowed_average_15min",
      publishedRaw: settlementPublished,
      officialRaw: officialExpirationRaw,
      sourceStream: "cfb-1hz",
      membership: QUARTER_HOUR_WINDOW_LABEL,
      closeMs: input.plan.closeMs,
      streamObservations: oneHzCollection,
    }),
    comparePublishedAverageForStream({
      fieldName: "avg_60s_data",
      publishedRaw: trailingPublished,
      officialRaw: officialExpirationRaw,
      sourceStream: "cfb-1hz",
      membership: TRAILING_WINDOW_LABEL,
      closeMs: input.plan.closeMs,
      streamObservations: oneHzCollection,
    }),
  ];

  const avgComparison = membershipComparisons.find((row) => row.fieldName === "avg_60s_data");
  const settlementEstimate = buildSettlementEstimateBundle({
    expirationValueRaw: officialExpirationRaw,
    avg60sDataRaw: trailingPublished,
    avg60sDataCount: analysis?.exploratoryTrailingAtClose?.count
      ?? (avgComparison?.status === "compared" ? avgComparison.sampleCount : null),
    last60sWindowedAverage15minRaw: settlementPublished,
    last60sWindowedCount: analysis?.completedSettlementAverage?.count ?? null,
    postClose: officialStatus === "retrieved" || officialStatus === "unavailable",
    avg60sMatchesVerified1HzMean: avgComparison?.status === "compared"
      && avgComparison.exactDecimalEqual === true,
  });

  const streamHints: Record<string, number> = {};
  for (const event of captureResult?.events ?? []) {
    streamHints[event.stream] = (streamHints[event.stream] ?? 0) + 1;
  }
  const streamObservationCounts = {
    cfb1Hz: oneHzCollection.length,
    cfb5Hz: fiveHzCollection.length,
    cfb1HzWithSourceTs: oneHzCollection.filter((row) => row.sourceTsMs != null).length,
    cfb5HzWithSourceTs: fiveHzCollection.filter((row) => row.sourceTsMs != null).length,
  };

  const officialComparison = officialBody != null && market != null
    ? compareOfficialSettlementToObservedWindow({
      body: officialBody,
      venueAverageRaw: analysis?.completedSettlementAverage?.valueRaw ?? null,
      observedCloseIso: market.closeTimeUtc,
      expectedEventTicker: market.eventTicker,
    })
    : { status: "not-attempted", reason: "official-or-market-missing" };

  const finalLedger = loadOrCreateCampaignLedger({
    ledgerPath: campaignLedgerPath(input.campaignDir),
    campaignId: input.plan.campaignId,
    limit: httpLimit,
    io: campaignIo,
    requireExisting: true,
  });

  // Manifest
  const manifest = {
    campaignId: input.plan.campaignId,
    closeUtc: input.plan.closeUtc,
    ticker: market?.ticker ?? null,
    index: input.plan.indexSymbol,
    retentionMode: input.plan.retentionMode,
    independentBackup: input.plan.independentBackup,
    primaryRoot: input.retention.primaryRoot,
    rawCapturePath,
    rawCaptureSha256: rawHash.sha256,
    officialBodyPath,
    officialBodySha256,
    httpConsumed: finalLedger.consumed,
    httpLimit: finalLedger.limit,
    channels: captureResult?.channels ?? [],
    comparisonsFrozen: {
      trailingMembership: TRAILING_MEMBERSHIP,
      quarterHourMembership: QUARTER_HOUR_MEMBERSHIP,
    },
    generatedAtUtc: new Date(nowMs()).toISOString(),
  };
  writeFileSync(
    join(input.persistentRawDir, "capture-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  return {
    capture: captureStatus,
    official: officialStatus,
    retention: retentionStatus,
    captured: captureStatus === "ok",
    reason,
    market,
    discoveryStatus,
    captureResult,
    officialExpirationRaw,
    officialAttempts,
    httpConsumed: finalLedger.consumed,
    httpLimit: finalLedger.limit,
    rawCapturePath: existsSync(rawCapturePath) ? rawCapturePath : null,
    rawCaptureSha256: rawHash.sha256,
    rawCaptureBytes: rawHash.bytes,
    officialBodyPath,
    officialBodySha256,
    channelSemantics: {
      subscribed: captureResult?.channels ?? [],
      observedStreamHints: streamHints,
      note: "1Hz carries averages + nested data.time source timestamps; 5Hz is lean ticks with top-level source_ts_ms. Membership comparisons use cfb-1hz only and never mix streams.",
    },
    streamObservationCounts,
    replay: {
      rawReopened,
      rawHashMatched,
      officialReopened,
      officialHashMatched,
    },
    membershipComparisons,
    settlementEstimate,
    analysis,
    officialComparison,
  };
}
