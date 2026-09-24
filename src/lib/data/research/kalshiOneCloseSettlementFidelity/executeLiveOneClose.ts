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
import { selectWindowObservations } from "@/lib/data/research/kalshiSettlementSampleMapping/windowBoundaries";

import { comparePublishedAverage } from "./compareMembershipAverages";
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
  membershipComparisons: ReturnType<typeof comparePublishedAverage>[];
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
  deps?: LiveOneCloseDeps;
}): Promise<LiveOneCloseResult> {
  if (!input.retention.ready || !input.retention.primaryRoot) {
    throw new OneCloseFidelityError("execute-requires-retention-ready");
  }
  const nowMs = input.deps?.nowMs ?? Date.now;
  const wait = input.deps?.sleep ?? sleep;
  const campaignIo = input.deps?.campaignIo ?? createFilesystemCampaignBudgetIo();
  const appendRaw = input.deps?.appendRaw ?? defaultAppendRaw;

  loadOrCreateCampaignLedger({
    ledgerPath: campaignLedgerPath(input.campaignDir),
    campaignId: input.plan.campaignId,
    limit: ONE_CLOSE_MAX_HTTP,
    io: campaignIo,
  });
  const ledgerForBudget = loadOrCreateCampaignLedger({
    ledgerPath: campaignLedgerPath(input.campaignDir),
    campaignId: input.plan.campaignId,
    limit: ONE_CLOSE_MAX_HTTP,
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
      limit: ONE_CLOSE_MAX_HTTP,
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
          captureStatus = captureResult.limits.stopReason?.startsWith("connection")
            ? "connect-failed"
            : captureResult.limits.stopReason === "deadline"
              || captureResult.limits.stopReason === "planned-stop"
              || captureResult.closedCleanly
              ? "ok"
              : captureResult.limits.stopReason
                ? "limit-stop"
                : "ok";
          reason = captureResult.limits.stopReason ?? "capture-complete";
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
        limit: ONE_CLOSE_MAX_HTTP,
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
          limit: ONE_CLOSE_MAX_HTTP,
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

  // Reproduce from verified 1Hz BRTI samples only (5Hz kept distinct / unused here).
  const oneHzSamples = (captureResult?.rawBrti ?? []).map((item) => ({
    timeRaw: item.sourceTsMs,
    timeMs: item.sourceTsMs,
    valueRaw: item.valueRaw,
    value: item.valueRaw != null ? Number(item.valueRaw) : null,
  })).filter((item) => (
    item.timeMs != null
    && item.value != null
    && Number.isFinite(item.value)
    && item.valueRaw != null
    && item.valueRaw !== ""
  ));

  const trailingSamples = selectWindowObservations(
    oneHzSamples,
    input.plan.closeMs,
    "payload-start-inclusive-end-exclusive",
  );
  const quarterHourSamples = selectWindowObservations(
    oneHzSamples,
    input.plan.closeMs,
    "documented-live-accumulation",
  );

  const membershipComparisons: ReturnType<typeof comparePublishedAverage>[] = [];
  const settlementPublished = analysis?.completedSettlementAverage?.valueRaw ?? null;
  membershipComparisons.push(comparePublishedAverage({
    fieldName: "last_60s_windowed_average_15min",
    publishedRaw: settlementPublished,
    sampleValueRaws: quarterHourSamples.map((s) => s.valueRaw as string),
    officialRaw: officialExpirationRaw,
  }));
  const trailingPublished = analysis?.exploratoryTrailingAtClose?.valueRaw
    ?? analysis?.venueAlignments?.find((row) => (
      row.update.fieldName === "avg_60s_data"
      && row.update.count === 60
      && row.update.windowStartTsMs === input.plan.closeMs - 60_000
      && row.update.windowEndTsExclusive === input.plan.closeMs
    ))?.update.valueRaw
    ?? null;
  membershipComparisons.push(comparePublishedAverage({
    fieldName: "avg_60s_data",
    publishedRaw: trailingPublished,
    sampleValueRaws: trailingSamples.map((s) => s.valueRaw as string),
    officialRaw: officialExpirationRaw,
  }));

  const streamHints: Record<string, number> = {};
  for (const event of captureResult?.events ?? []) {
    streamHints[event.stream] = (streamHints[event.stream] ?? 0) + 1;
  }

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
    limit: ONE_CLOSE_MAX_HTTP,
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
      note: "1Hz carries averages; 5Hz is lean ticks without averages (docs). Counts are observed stream hints from classifyStream.",
    },
    replay: {
      rawReopened,
      rawHashMatched,
      officialReopened,
      officialHashMatched,
    },
    membershipComparisons,
    analysis,
    officialComparison,
  };
}
