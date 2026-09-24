import { join } from "node:path";

import { DEFAULT_KALSHI_HISTORICAL_API_BASE } from "@/lib/data/importers/kalshi/historicalEndpoints";
import { parseKalshiMarketWire } from "@/lib/data/importers/kalshi/kalshiSettlementRetrieval";
import {
  resolveKalshiCaptureCredentials,
  type KalshiCaptureCredentials,
} from "@/lib/data/live/kalshiWsCaptureSpike/resolveKalshiCaptureCredentials";

import {
  V0_CAMPAIGN_ID,
  campaignLedgerPath,
  campaignLockPath,
  createFilesystemCampaignBudgetIo,
  createSealedV0Ledger,
  loadOrCreateCampaignLedger,
  type CampaignBudgetIo,
} from "./campaignBudget";
import {
  HISTORICAL_PARAMETER_SEMANTICS,
  buildCfbHistoryHourUrl,
  plannedHistoryHourForClose,
  selectFollowUpHistoricalTarget,
} from "./historicalSemantics";
import {
  extractHistoryObservations,
  inspectCadence,
  reconstructOfficialAverageIfSupported,
} from "./inspectHistoryPayload";
import { parseOfficialNumericString } from "./parseOfficialNumericString";
import { formatKxbtc15mEventTicker, planLiveCloseWindow } from "./planLiveCloseWindow";
import { createFilesystemProbeIo, type ProbeIo, type ProbeRunDeps } from "./runKalshiBrtiAccessProbe";
import { runLiveCfbProbe, type LiveCfbProbeResult } from "./runLiveCfbProbe";
import { selectSpentTargetsFromRepo } from "./selectSpentTargets";
import { signedKalshiGet, unsignedKalshiGet, type SignedGetDeps } from "./signedKalshiGet";
import {
  BRTI_ACCESS_PROBE_STUDY_ID,
  KalshiBrtiAccessProbeError,
  type ParsedProbeArgv,
  type SignedGetResult,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function runFollowUpBrtiCampaign(input: {
  repoRoot: string;
  argv: ParsedProbeArgv;
  io: ProbeIo;
  budgetIo?: CampaignBudgetIo;
  deps?: ProbeRunDeps;
}): Promise<Record<string, unknown>> {
  if (input.argv.campaignId === V0_CAMPAIGN_ID) {
    throw new KalshiBrtiAccessProbeError(
      "v0 campaign is sealed at 13/10 and must not issue further requests",
    );
  }
  const budgetIo = input.budgetIo ?? createFilesystemCampaignBudgetIo();
  const campaignDir = join(input.repoRoot, input.argv.campaignDir);
  const ledgerPath = campaignLedgerPath(campaignDir);
  const lockPath = campaignLockPath(campaignDir);
  input.io.mkdir(campaignDir);
  const ledger = loadOrCreateCampaignLedger({
    ledgerPath,
    campaignId: input.argv.campaignId,
    limit: input.argv.maxHttpRequests,
    io: budgetIo,
  });
  if (ledger.sealed || ledger.consumed >= ledger.limit && input.argv.skipHttp !== true && !input.argv.fixture) {
    // allow fixture/skipHttp to write a report without dispatching
  }

  const targets = selectSpentTargetsFromRepo(input.repoRoot);
  const historicalTarget = selectFollowUpHistoricalTarget(targets);
  const credentials = (input.deps?.resolveCredentials ?? resolveKalshiCaptureCredentials)();
  const skipHttp = input.argv.skipHttp || input.argv.fixture;
  const generatedAt = (input.deps?.nowIso ?? (() => new Date().toISOString()))();
  const campaignHookBase = {
    ledgerPath,
    lockPath,
    campaignId: input.argv.campaignId,
    limit: input.argv.maxHttpRequests,
    io: budgetIo,
  };
  const httpDeps: SignedGetDeps = {
    fetchImpl: input.deps?.httpDeps?.fetchImpl ?? fetch,
    nowMs: input.deps?.httpDeps?.nowMs,
    campaign: { ...campaignHookBase, purpose: "historical-brti" },
  };

  let historyResult: SignedGetResult | null = null;
  const officialClose = "2026-08-30T18:15:00Z";
  if (!skipHttp && !input.argv.skipHistory && credentials.status === "available") {
    const hour = plannedHistoryHourForClose(officialClose);
    if (!hour.settlementWindowInsideHour) {
      throw new KalshiBrtiAccessProbeError("planned HOUR window does not contain the settlement minute");
    }
    const built = buildCfbHistoryHourUrl({ hourStartUtc: hour.hourStartUtc });
    historyResult = await signedKalshiGet({
      url: built.url,
      signPath: built.signPath,
      credentials,
      budget: { remaining: input.argv.maxHttpRequests },
      maxRetries: 0,
      deps: { ...httpDeps, campaign: { ...campaignHookBase, purpose: "historical-brti" } },
    });
  }

  const observations = historyResult ? extractHistoryObservations(historyResult.body) : [];
  const closeMs = Date.parse(officialClose);
  const hourPlan = plannedHistoryHourForClose(officialClose);
  const hourStartMs = Date.parse(hourPlan.hourStartUtc);
  const hourEndMs = hourStartMs + 3_600_000;
  const inHour = observations.filter((item) => item.timeMs != null && item.timeMs >= hourStartMs && item.timeMs < hourEndMs);
  const reconstruction = reconstructOfficialAverageIfSupported({
    observations,
    closeTimeMs: closeMs,
    officialExpirationRaw: "78833.97",
  });

  let live: LiveCfbProbeResult | null = null;
  if (!input.argv.skipLive && !input.argv.fixture && credentials.status === "available") {
    const window = planLiveCloseWindow((input.deps?.httpDeps?.nowMs ?? Date.now)());
    live = await (input.deps?.liveProbe ?? runLiveCfbProbe)({
      credentials,
      durationSeconds: input.argv.liveDurationSeconds,
      messageCap: input.argv.liveMessageCap,
      channels: ["cfbenchmarks_value"],
      startAtMs: input.argv.waitForClose ? window.startMs : undefined,
      stopAtMs: window.stopMs,
      maxConnections: 2,
      deps: input.deps?.liveDeps,
    });
  } else if (input.argv.fixture) {
    live = {
      attempted: false,
      connected: false,
      connectionAttempts: 0,
      subscriptionAttempts: 0,
      channels: ["cfbenchmarks_value"],
      durationMs: 0,
      messagesReceived: 0,
      summaries: [],
      handshakeErrorCategory: null,
      sawSettlementWindowAverage: false,
      limitedBecauseNoSettlementWindow: false,
      stoppedAtCap: false,
      stoppedAtDeadline: false,
      venueSettlementAverage: null,
    };
  }

  const metadataAttempts: SignedGetResult[] = [];
  let officialComparison: Record<string, unknown> = {
    status: "not-attempted",
    reason: live == null || live.attempted === false ? "live-not-attempted" : "pending",
  };
  if (!skipHttp && live?.attempted && credentials.status === "available") {
    const closeForLive = live.summaries.length > 0
      ? planLiveCloseWindow(live.summaries[0]!.localReceivedAtMs).closeIso
      : planLiveCloseWindow((input.deps?.httpDeps?.nowMs ?? Date.now)()).closeIso;
    const eventTicker = formatKxbtc15mEventTicker(Date.parse(closeForLive));
    const listUrl = `${DEFAULT_KALSHI_HISTORICAL_API_BASE}/markets?event_ticker=${encodeURIComponent(eventTicker)}&limit=20`;
    const listed = await unsignedKalshiGet({
      url: listUrl,
      signPath: "/trade-api/v2/markets",
      budget: { remaining: input.argv.maxHttpRequests },
      maxRetries: 0,
      deps: { ...httpDeps, campaign: { ...campaignHookBase, purpose: "official-settlement-metadata" } },
    });
    metadataAttempts.push(listed);
    officialComparison = compareOfficialSettlement({
      body: listed.body,
      venueAverageRaw: live.venueSettlementAverage?.valueRaw ?? null,
    });
    if (officialComparison.status === "pending" && metadataAttempts.length < 3) {
      officialComparison = {
        status: "pending",
        reason: "official-expiration-value-not-yet-available",
        eventTicker,
        metadataAttempts: metadataAttempts.length,
      };
    }
  }

  const refreshed = parseCampaignLedgerSafe(budgetIo.readFile(ledgerPath));
  const summary = {
    studyId: `${BRTI_ACCESS_PROBE_STUDY_ID}-follow-up`,
    generatedAtUtc: generatedAt,
    campaignId: input.argv.campaignId,
    preservedV0: {
      campaignId: V0_CAMPAIGN_ID,
      consumed: 13,
      limit: 10,
      overrun: true,
      furtherRequestsForbidden: true,
    },
    historicalSemantics: HISTORICAL_PARAMETER_SEMANTICS,
    targetSelection: {
      rule: "existing early/middle/late SPENT trio; follow-up uses role=middle only",
      selectedBeforeObservingHistory: true,
      target: historicalTarget,
      officialClose,
    },
    layers: {
      endpointDocumented: true,
      codeImplemented: true,
      credentialsAvailable: credentials.status === "available",
      accessExercised: historyResult?.category === "success" || Boolean(live?.connected),
      historicalCoverageDemonstrated: inHour.length > 0,
      causalSuitabilityEstablished: false,
    },
    credentials: {
      status: credentials.status,
      keyIdPresent: credentials.keyIdPresent,
      privateKeyLoaded: credentials.privateKeyLoaded,
      privateKeySource: credentials.privateKeySource,
    },
    httpBudget: {
      campaignId: input.argv.campaignId,
      limit: input.argv.maxHttpRequests,
      consumed: refreshed?.consumed ?? ledger.consumed,
      entries: refreshed?.entries.map((entry) => ({
        id: entry.id,
        purpose: entry.purpose,
        status: entry.status,
        httpStatus: entry.httpStatus,
        category: entry.category,
      })) ?? [],
    },
    history: historyResult
      ? {
          status: historyResult.status,
          category: historyResult.category,
          bodyTextHash: historyResult.bodyTextHash,
          timespan: "HOUR",
          timestamp: hourPlan.hourStartUtc,
          observationCount: observations.length,
          observationsInRequestedHour: inHour.length,
          cadence: inspectCadence(observations),
          reconstruction,
          coverageNote: inHour.length === 0
            ? "no historical observations in the requested hour"
            : "coverage is only the observations actually returned for this one hour",
        }
      : { attempted: false },
    live: live
      ? {
          attempted: live.attempted,
          connected: live.connected,
          connectionAttempts: live.connectionAttempts,
          subscriptionAttempts: live.subscriptionAttempts,
          channels: live.channels,
          durationMs: live.durationMs,
          messagesReceived: live.messagesReceived,
          sawSettlementWindowAverage: live.sawSettlementWindowAverage,
          venueSettlementAverage: live.venueSettlementAverage,
          stoppedAtCap: live.stoppedAtCap,
          stoppedAtDeadline: live.stoppedAtDeadline,
          firstLocalReceivedAtMs: live.summaries[0]?.localReceivedAtMs ?? null,
          firstProviderReceivedAtMs: live.summaries[0]?.providerReceivedAtMs ?? null,
          cohortStatus: "operational-data-access-sample-not-pristine-validation-cohort",
        }
      : { attempted: false },
    officialComparison,
    causalLimitations: [
      "Historical observation time is not provider publication/receipt time.",
      "This live probe's local receipt timestamps cannot establish historical latency.",
      "60 distinct one-second buckets do not identify the official settlement samples.",
      "A trailing 60-second average is not the quarter-hour settlement average.",
      "This live window is an operational access sample, not an untouched future validation cohort.",
    ],
    nextPrerequisite:
      "If HOUR history returned ticks, treat them as retrospective mechanical coverage of one hour only. If the venue 15m window average compared to official expiration, that is a live fidelity sample, not a historical backtest input.",
  };

  input.io.mkdir(input.argv.outDir);
  input.io.mkdir(input.argv.rawDir);
  input.io.writeFile(
    join(input.argv.outDir, "brti-access-probe-v1-summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  input.io.writeFile(
    join(input.argv.rawDir, "http-log.hash-only.json"),
    `${JSON.stringify({
      history: historyResult
        ? { status: historyResult.status, category: historyResult.category, bodyTextHash: historyResult.bodyTextHash }
        : null,
      metadata: metadataAttempts.map((item) => ({
        status: item.status,
        category: item.category,
        bodyTextHash: item.bodyTextHash,
      })),
    }, null, 2)}\n`,
  );
  return summary;
}

function parseCampaignLedgerSafe(raw: string | null): ReturnType<typeof createSealedV0Ledger> | null {
  if (raw == null) {
    return null;
  }
  try {
    return JSON.parse(raw) as ReturnType<typeof createSealedV0Ledger>;
  } catch {
    return null;
  }
}

function compareOfficialSettlement(input: {
  body: unknown;
  venueAverageRaw: string | null;
}): Record<string, unknown> {
  const markets = extractMarkets(input.body);
  const expirationRaw = markets
    .map((market) => market.expiration_value)
    .find((value): value is string => typeof value === "string" && value.trim() !== "");
  if (expirationRaw == null) {
    return { status: "pending", reason: "official-expiration-value-not-yet-available" };
  }
  const officialParsed = parseOfficialNumericString(expirationRaw);
  const venueParsed = parseOfficialNumericString(input.venueAverageRaw);
  if (officialParsed.kind !== "ok" || venueParsed.kind !== "ok") {
    return {
      status: "not-compared",
      officialExpirationRaw: expirationRaw,
      venueAverageRaw: input.venueAverageRaw,
      reconstruction: "unverified",
    };
  }
  const roundedOfficial = officialParsed.value.toFixed(2);
  const roundedVenue = Number(venueParsed.value).toFixed(2);
  return {
    status: roundedOfficial === roundedVenue ? "agree" : "disagree",
    officialExpirationRaw: expirationRaw,
    venueAverageRaw: input.venueAverageRaw,
    reconstruction: "unverified",
    comparisonKind: "venue-provided-window-average-vs-official-expiration",
  };
}

function extractMarkets(body: unknown): Array<{ expiration_value?: string | null }> {
  if (!isRecord(body)) {
    return [];
  }
  const markets = body.markets;
  if (!Array.isArray(markets)) {
    const wire = parseKalshiMarketWire(body);
    return wire ? [{ expiration_value: wire.expiration_value }] : [];
  }
  return markets.flatMap((item) => {
    const wire = parseKalshiMarketWire({ market: item });
    return wire ? [{ expiration_value: wire.expiration_value }] : [];
  });
}

export function sealV0CampaignLedger(input: { campaignDir: string; io: ProbeIo; nowIso?: string }): void {
  const now = input.nowIso ?? new Date().toISOString();
  input.io.mkdir(input.campaignDir);
  input.io.writeFile(
    campaignLedgerPath(input.campaignDir),
    `${JSON.stringify(createSealedV0Ledger(now), null, 2)}\n`,
  );
}

export { createFilesystemProbeIo };
export type FollowUpCredentials = KalshiCaptureCredentials;
