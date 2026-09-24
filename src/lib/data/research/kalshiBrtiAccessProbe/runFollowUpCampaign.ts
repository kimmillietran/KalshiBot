import { join } from "node:path";

import { DEFAULT_KALSHI_HISTORICAL_API_BASE } from "@/lib/data/importers/kalshi/historicalEndpoints";
import {
  resolveKalshiCaptureCredentials,
  type KalshiCaptureCredentials,
} from "@/lib/data/live/kalshiWsCaptureSpike/resolveKalshiCaptureCredentials";

import {
  loadOfficialMetadataForSelectedTarget,
  SELECTED_FOLLOW_UP_TICKER,
  type OfficialTargetBindResult,
} from "./bindOfficialTargetMetadata";
import {
  V0_CAMPAIGN_ID,
  campaignLedgerPath,
  campaignLockPath,
  createFilesystemCampaignBudgetIo,
  createSealedV0Ledger,
  loadOrCreateCampaignLedger,
  parseCampaignLedger,
  type CampaignBudgetIo,
  type CampaignLedger,
} from "./campaignBudget";
import { compareOfficialSettlementToObservedWindow } from "./compareOfficialSettlement";
import {
  HISTORICAL_PARAMETER_SEMANTICS,
  buildCfbHistoryHourUrl,
  selectFollowUpHistoricalTarget,
} from "./historicalSemantics";
import {
  extractHistoryObservations,
  inspectCadence,
  inspectHistoryPayload,
  reconstructOfficialAverageIfSupported,
  type HistoryPayloadInspection,
} from "./inspectHistoryPayload";
import {
  classifyFollowUpCampaign,
  followUpStudyId,
  serializeFollowUpSummary,
  ORIGINAL_SNAPSHOT_NOTE,
  type FollowUpSummary,
} from "./followUpSummary";
import { formatKxbtc15mEventTicker, planLiveCloseWindow } from "./planLiveCloseWindow";
import {
  buildSanitizedSchemaDiagnostic,
  loadRetainedHttpResponse,
  retainLocalHttpResponse,
  RETAINED_HISTORY_RESPONSE_NAME,
} from "./retainLocalResponse";
import { createFilesystemProbeIo, type ProbeIo, type ProbeRunDeps } from "./runKalshiBrtiAccessProbe";
import { runLiveCfbProbe, type LiveCfbProbeResult } from "./runLiveCfbProbe";
import { selectSpentTargetsFromRepo } from "./selectSpentTargets";
import { signedKalshiGet, unsignedKalshiGet, type SignedGetDeps } from "./signedKalshiGet";
import {
  KalshiBrtiAccessProbeError,
  type ParsedProbeArgv,
  type SignedGetResult,
} from "./types";

const ORIGINAL_V1_SUMMARY_NAME = "brti-access-probe-v1-summary.json";
const SUPPLEMENT_SUMMARY_NAME = "brti-access-probe-v1-reliability-supplement.json";
const SCHEMA_DIAGNOSTIC_NAME = "history-payload-schema-diagnostic.json";

function artifactExists(io: ProbeIo, path: string): boolean {
  if (io.exists) {
    return io.exists(path);
  }
  return io.readFile?.(path) != null;
}

function readExistingLedger(io: CampaignBudgetIo, ledgerPath: string): CampaignLedger | null {
  const raw = io.readFile(ledgerPath);
  if (raw == null) {
    return null;
  }
  return parseCampaignLedger(raw);
}

function resolveObservedCloseIso(input: {
  live: LiveCfbProbeResult;
  nowMs: number;
}): string {
  if (input.live.venueSettlementAverage?.windowEndTsExclusive != null) {
    return new Date(input.live.venueSettlementAverage.windowEndTsExclusive).toISOString();
  }
  if (input.live.summaries.length > 0) {
    return planLiveCloseWindow(input.live.summaries[0]!.localReceivedAtMs).closeIso;
  }
  return planLiveCloseWindow(input.nowMs).closeIso;
}

export async function runFollowUpBrtiCampaign(input: {
  repoRoot: string;
  argv: ParsedProbeArgv;
  io: ProbeIo;
  budgetIo?: CampaignBudgetIo;
  deps?: ProbeRunDeps;
}): Promise<FollowUpSummary> {
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
  const skipHttp = input.argv.skipHttp || input.argv.fixture;
  const budgetBlocksDispatch = ledger.sealed || ledger.consumed >= ledger.limit;
  if (budgetBlocksDispatch && !skipHttp) {
    throw new KalshiBrtiAccessProbeError(
      `campaign-budget-exhausted: ${ledger.consumed}/${ledger.limit}`,
    );
  }

  const targets = selectSpentTargetsFromRepo(input.repoRoot);
  const historicalTarget = selectFollowUpHistoricalTarget(targets);
  if (historicalTarget.marketTicker !== SELECTED_FOLLOW_UP_TICKER) {
    throw new KalshiBrtiAccessProbeError(
      `follow-up middle target ${historicalTarget.marketTicker} is not the authorized ticker`,
    );
  }
  const officialBind = loadOfficialMetadataForSelectedTarget({
    repoRoot: input.repoRoot,
    selectedTicker: historicalTarget.marketTicker,
    readFile: input.deps?.readFile ?? input.io.readFile,
    injected: input.deps?.officialMetadata,
  });
  const credentials = (input.deps?.resolveCredentials ?? resolveKalshiCaptureCredentials)();
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
  const consumedBefore = ledger.consumed;

  let historyResult: SignedGetResult | null = null;
  let historySource: "network" | "retained-local" | "not-attempted" = "not-attempted";
  const canPlanHistory = officialBind.status === "bound" && officialBind.request != null;
  const retained = loadRetainedHttpResponse({
    rawDir: input.argv.rawDir,
    readFile: input.deps?.readFile ?? input.io.readFile,
    name: RETAINED_HISTORY_RESPONSE_NAME,
  });
  if (retained) {
    historyResult = {
      url: retained.url,
      signPath: retained.signPath,
      status: retained.status,
      category: retained.category as SignedGetResult["category"],
      body: retained.body,
      bodyTextHash: retained.bodyTextHash,
      attempt: 0,
    };
    historySource = "retained-local";
  } else if (
    !skipHttp
    && !input.argv.skipHistory
    && credentials.status === "available"
    && canPlanHistory
  ) {
    const built = buildCfbHistoryHourUrl({ hourStartUtc: officialBind.request.hourStartUtc });
    historyResult = await signedKalshiGet({
      url: built.url,
      signPath: built.signPath,
      credentials,
      budget: { remaining: input.argv.maxHttpRequests },
      maxRetries: 0,
      deps: { ...httpDeps, campaign: { ...campaignHookBase, purpose: "historical-brti" } },
    });
    historySource = "network";
    retainLocalHttpResponse({
      io: input.io,
      rawDir: input.argv.rawDir,
      name: RETAINED_HISTORY_RESPONSE_NAME,
      result: historyResult,
      capturedAtUtc: generatedAt,
    });
  }

  const hourStartUtc = officialBind.request?.hourStartUtc ?? null;
  const hourEndExclusiveUtc = officialBind.request?.hourEndExclusiveUtc ?? null;
  const officialClose = officialBind.request?.closeTimeUtc ?? null;
  const hourStartMs = hourStartUtc != null ? Date.parse(hourStartUtc) : Number.NaN;
  const hourEndMs = hourEndExclusiveUtc != null ? Date.parse(hourEndExclusiveUtc) : Number.NaN;
  const closeMs = officialClose != null ? Date.parse(officialClose) : Number.NaN;
  const observations = historyResult ? extractHistoryObservations(historyResult.body) : [];
  const inHour = observations.filter((item) => (
    item.timeMs != null
    && Number.isFinite(hourStartMs)
    && item.timeMs >= hourStartMs
    && item.timeMs < hourEndMs
  ));
  const payloadInspection: HistoryPayloadInspection | { kind: "not-attempted" } = historyResult && Number.isFinite(hourStartMs)
    ? inspectHistoryPayload({
      body: historyResult.body,
      hourStartMs,
      hourEndExclusiveMs: hourEndMs,
      closeTimeMs: Number.isFinite(closeMs) ? closeMs : null,
    })
    : { kind: "not-attempted" };
  const reconstruction = Number.isFinite(closeMs)
    ? reconstructOfficialAverageIfSupported({
      observations,
      closeTimeMs: closeMs,
      officialExpirationRaw: officialBind.request?.expirationAvailableForComparison
        ? officialBind.request.expirationValue
        : null,
    })
    : null;

  let live: LiveCfbProbeResult | null = null;
  if (!input.argv.skipLive && !input.argv.fixture && credentials.status === "available" && !skipHttp) {
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
  let resolvedComparison: FollowUpSummary["officialComparison"] = {
    status: "not-attempted",
    reason: live == null || live.attempted === false ? "live-not-attempted" : "pending",
  };
  if (!skipHttp && live?.attempted && credentials.status === "available") {
    const observedCloseIso = resolveObservedCloseIso({
      live,
      nowMs: (input.deps?.httpDeps?.nowMs ?? Date.now)(),
    });
    const eventTicker = formatKxbtc15mEventTicker(Date.parse(observedCloseIso));
    const listUrl = `${DEFAULT_KALSHI_HISTORICAL_API_BASE}/markets?event_ticker=${encodeURIComponent(eventTicker)}&limit=20`;
    const listed = await unsignedKalshiGet({
      url: listUrl,
      signPath: "/trade-api/v2/markets",
      budget: { remaining: input.argv.maxHttpRequests },
      maxRetries: 0,
      deps: { ...httpDeps, campaign: { ...campaignHookBase, purpose: "official-settlement-metadata" } },
    });
    metadataAttempts.push(listed);
    resolvedComparison = {
      ...compareOfficialSettlementToObservedWindow({
        body: listed.body,
        venueAverageRaw: live.venueSettlementAverage?.valueRaw ?? null,
        observedCloseIso,
        expectedEventTicker: eventTicker,
      }),
      metadataAttempts: metadataAttempts.length,
      eventTicker,
    };
    if (resolvedComparison.status === "pending") {
      resolvedComparison = {
        ...resolvedComparison,
        reason: resolvedComparison.reason ?? "official-expiration-value-not-yet-available",
        eventTicker,
        metadataAttempts: metadataAttempts.length,
      };
    }
  }

  const refreshed = readExistingLedger(budgetIo, ledgerPath) ?? ledger;
  const thisTaskHttpAttempts = Math.max(0, refreshed.consumed - consumedBefore);
  const payloadKind = payloadInspection.kind;
  const classification = classifyFollowUpCampaign({
    credentialsStatus: credentials.status,
    historyCategory: historyResult?.category ?? null,
    payloadKind,
    inHourCount: payloadInspection.kind === "not-attempted" ? inHour.length : payloadInspection.inHourCount,
    liveConnected: Boolean(live?.connected),
    budgetBlockedNetwork: budgetBlocksDispatch,
  });

  const summary: FollowUpSummary = {
    studyId: followUpStudyId(),
    artifactKind: "v1-reliability-supplement",
    generatedAtUtc: generatedAt,
    classification,
    httpRequestCount: refreshed.consumed,
    campaignId: input.argv.campaignId,
    preservedV0: {
      campaignId: V0_CAMPAIGN_ID,
      consumed: 13,
      limit: 10,
      overrun: true,
      furtherRequestsForbidden: true,
    },
    originalSnapshots: {
      v0Summary: "data/research-results/external-kalshi-data-audit/m17-prep-brti-access-probe/brti-access-probe-summary.json",
      v1Summary: "data/research-results/external-kalshi-data-audit/m17-prep-brti-access-probe-v1/brti-access-probe-v1-summary.json",
      note: ORIGINAL_SNAPSHOT_NOTE,
    },
    historicalSemantics: HISTORICAL_PARAMETER_SEMANTICS,
    targetSelection: {
      rule: "existing early/middle/late SPENT trio; follow-up uses role=middle only",
      selectedBeforeObservingHistory: true,
      target: historicalTarget,
      officialMetadataBind: officialBind.status,
      officialClose: officialClose,
      authorizedHourStartUtc: officialBind.request?.hourStartUtc ?? null,
      discrepancy: officialBind.status === "rejected" ? officialBind.reason : officialBind.request?.discrepancy ?? null,
    },
    officialMetadataBind: officialBind,
    layers: {
      endpointDocumented: true,
      codeImplemented: true,
      credentialsAvailable: credentials.status === "available",
      accessExercised: historyResult?.category === "success"
        || historyResult?.category === "empty-success"
        || Boolean(live?.connected),
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
      limit: refreshed.limit,
      consumed: refreshed.consumed,
      entries: refreshed.entries.map((entry) => ({
        id: entry.id,
        purpose: entry.purpose,
        status: entry.status,
        httpStatus: entry.httpStatus,
        category: entry.category,
      })),
    },
    thisTaskHttpAttempts,
    history: historyResult
      ? {
          attempted: true,
          source: historySource,
          status: historyResult.status,
          category: historyResult.category,
          bodyTextHash: historyResult.bodyTextHash,
          timespan: "HOUR",
          timestamp: hourStartUtc,
          observationCount: observations.length,
          observationsInRequestedHour: inHour.length,
          cadence: inspectCadence(observations),
          reconstruction,
          coverageNote: payloadInspection.kind === "not-attempted"
            ? "history payload was not inspected"
            : payloadInspection.note,
          payloadKind,
        }
      : {
          attempted: false,
          source: historySource,
          reason: budgetBlocksDispatch
            ? "campaign-budget-exhausted-offline-report"
            : !canPlanHistory
              ? officialBind.status === "rejected"
                ? officialBind.reason
                : officialBind.reason
              : skipHttp
                ? "skip-http"
                : "not-attempted",
        },
    historyPayload: payloadInspection,
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
    officialComparison: resolvedComparison,
    causalLimitations: [
      "Historical observation time is not provider publication/receipt time.",
      "This live probe's local receipt timestamps cannot establish historical latency.",
      "60 distinct one-second buckets do not identify the official settlement samples.",
      "A trailing 60-second average is not the quarter-hour settlement average.",
      "This live window is an operational access sample, not an untouched future validation cohort.",
    ],
    nextPrerequisite: nextPrerequisiteFor(payloadKind, inHour.length),
    reproducibility: {
      originalObservationsPreserved: true,
      timestampsNeedNotBeByteIdentical: true,
      codeIdentity: "kalshiBrtiAccessProbe/follow-up-reliability",
    },
  };

  input.io.mkdir(input.argv.outDir);
  input.io.mkdir(input.argv.rawDir);
  const originalSummaryPath = join(input.argv.outDir, ORIGINAL_V1_SUMMARY_NAME);
  if (!artifactExists(input.io, originalSummaryPath)) {
    input.io.writeFile(originalSummaryPath, serializeFollowUpSummary(summary));
  }
  input.io.writeFile(join(input.argv.outDir, SUPPLEMENT_SUMMARY_NAME), serializeFollowUpSummary(summary));
  if (historyResult && payloadInspection.kind !== "not-attempted") {
    input.io.writeFile(
      join(input.argv.outDir, SCHEMA_DIAGNOSTIC_NAME),
      `${JSON.stringify(buildSanitizedSchemaDiagnostic({
        body: historyResult.body,
        bodyTextHash: historyResult.bodyTextHash,
        status: historyResult.status,
        category: historyResult.category,
        inspection: payloadInspection,
        request: {
          timespan: "HOUR",
          timestamp: hourStartUtc ?? "",
          ticker: SELECTED_FOLLOW_UP_TICKER,
        },
        provenance: {
          historySource,
          officialMetadataBind: officialBind.status,
          generatedAtUtc: generatedAt,
        },
      }), null, 2)}\n`,
    );
  }
  input.io.writeFile(
    join(input.argv.rawDir, "http-log.hash-only.json"),
    `${JSON.stringify({
      history: historyResult
        ? { status: historyResult.status, category: historyResult.category, bodyTextHash: historyResult.bodyTextHash, source: historySource }
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

function nextPrerequisiteFor(kind: HistoryPayloadInspection["kind"] | "not-attempted", inHourCount: number): string {
  if (kind === "observations-present" && inHourCount > 0) {
    return "Treat HOUR ticks as retrospective mechanical coverage of one hour only. Live venue last_60s_windowed_average_15min remains one operational fidelity sample, not a historical backtest input.";
  }
  if (kind === "valid-empty-history") {
    return "Documented HOUR request returned a valid empty container. Do not broaden dates. Next step is prospective synchronized collection or a separately authorized access diagnosis.";
  }
  if (kind === "unsupported-schema" || kind === "ambiguous-schema" || kind === "observations-unrecognized") {
    return "Inspect the retained raw HOUR body and documented schema before another request. Zero extracted observations is not empty provider history.";
  }
  if (kind === "response-error-in-200") {
    return "HTTP 200 carried a response-level error. Diagnose that provider/access limitation before any broader historical download.";
  }
  return "Resolve the HOUR history payload classification (empty window vs unrecognized schema vs provider limitation) before any broader historical download. Live venue last_60s_windowed_average_15min can support prospective synchronized collection only.";
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
export type { OfficialTargetBindResult };
