import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { DEFAULT_KALSHI_HISTORICAL_API_BASE, buildHistoricalMarketPath } from "@/lib/data/importers/kalshi/historicalEndpoints";
import { buildKalshiRestMarketPath } from "@/lib/data/importers/kalshi/kalshiRestEndpoints";
import { parseKalshiMarketWire } from "@/lib/data/importers/kalshi/kalshiSettlementRetrieval";
import {
  resolveKalshiCaptureCredentials,
  type KalshiCaptureCredentials,
} from "@/lib/data/live/kalshiWsCaptureSpike/resolveKalshiCaptureCredentials";

import { assertHistoryUrlIsBounded, buildCfbHistoryMinuteUrl, buildCfbLatestValuesUrl, plannedHistoryMinutesForClose } from "./cfbEndpoints";
import { extractHistoryObservations, inspectCadence, reconstructOfficialAverageIfSupported } from "./inspectHistoryPayload";
import { parseOfficialNumericString } from "./parseOfficialNumericString";
import { runLiveCfbProbe, type LiveCfbProbeDeps, type LiveCfbProbeResult } from "./runLiveCfbProbe";
import type { OfficialTargetMetadata } from "./bindOfficialTargetMetadata";
import { selectSpentTargetsFromRepo } from "./selectSpentTargets";
import { signedKalshiGet, unsignedKalshiGet, type HttpBudget, type SignedGetDeps } from "./signedKalshiGet";
import {
  BRTI_ACCESS_PROBE_STUDY_ID,
  type ParsedProbeArgv,
  type ProbeClassification,
  type SignedGetResult,
  type SpentTarget,
} from "./types";

export type ProbeIo = {
  writeFile: (path: string, contents: string) => void;
  mkdir: (path: string) => void;
  readFile?: (path: string) => string | null;
  exists?: (path: string) => boolean;
};

export type ProbeRunDeps = {
  resolveCredentials?: () => KalshiCaptureCredentials;
  signedGet?: typeof signedKalshiGet;
  unsignedGet?: typeof unsignedKalshiGet;
  liveProbe?: typeof runLiveCfbProbe;
  liveDeps?: LiveCfbProbeDeps;
  httpDeps?: SignedGetDeps;
  nowIso?: () => string;
  officialMetadata?: OfficialTargetMetadata | null;
  readFile?: (path: string) => string | null;
};

function sha256Json(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function officialFieldsFromMarketBody(body: unknown): {
  ticker: string | null;
  closeTime: string | null;
  expirationValue: string | null;
  floorStrike: number | null;
  result: string | null;
  settlementTs: string | null;
} {
  const wire = parseKalshiMarketWire(body);
  return {
    ticker: wire?.ticker ?? null,
    closeTime: wire?.close_time ?? null,
    expirationValue: wire?.expiration_value ?? null,
    floorStrike: typeof wire?.floor_strike === "number" ? wire.floor_strike : null,
    result: wire?.result ?? null,
    settlementTs: wire?.settlement_ts ?? null,
  };
}

export async function runKalshiBrtiAccessProbe(input: {
  repoRoot: string;
  argv: ParsedProbeArgv;
  io: ProbeIo;
  deps?: ProbeRunDeps;
}): Promise<Record<string, unknown>> {
  const targets = selectSpentTargetsFromRepo(input.repoRoot);
  const credentials = (input.deps?.resolveCredentials ?? resolveKalshiCaptureCredentials)();
  const skipHttp = input.argv.skipHttp || input.argv.fixture;
  const skipLive = input.argv.skipLive || input.argv.fixture;
  const budget: HttpBudget = { remaining: input.argv.maxHttpRequests };
  const signedGet = input.deps?.signedGet ?? signedKalshiGet;
  const unsignedGet = input.deps?.unsignedGet ?? unsignedKalshiGet;
  const httpDeps = input.deps?.httpDeps ?? { fetchImpl: fetch };
  const generatedAt = (input.deps?.nowIso ?? (() => new Date().toISOString()))();

  const httpLog: SignedGetResult[] = [];
  let latestValues: SignedGetResult | null = null;
  const targetReports: Record<string, unknown>[] = [];

  if (!skipHttp && !input.argv.skipLatest && credentials.status === "available") {
    const latest = buildCfbLatestValuesUrl();
    latestValues = await signedGet({
      url: latest.url,
      signPath: latest.signPath,
      credentials,
      budget,
      maxRetries: input.argv.maxRetriesPerRequest,
      deps: httpDeps,
    });
    httpLog.push(latestValues);
  }

  for (const target of targets) {
    const report = await probeOneTarget({
      target,
      argv: { ...input.argv, skipHttp, skipLive },
      credentials,
      budget,
      signedGet,
      unsignedGet,
      httpDeps,
    });
    httpLog.push(...report.http);
    targetReports.push(report.summary);
    if (
      report.http.some((item) =>
        item.category === "authentication-failure" || item.category === "entitlement-denial"
      )
    ) {
      break;
    }
  }

  let live: LiveCfbProbeResult | null = null;
  if (!skipLive && credentials.status === "available") {
    live = await (input.deps?.liveProbe ?? runLiveCfbProbe)({
      credentials,
      durationSeconds: input.argv.liveDurationSeconds,
      messageCap: input.argv.liveMessageCap,
      deps: input.deps?.liveDeps,
    });
  }

  const classification = classifyProbe({
    credentialsStatus: credentials.status,
    latestValues,
    targetReports,
    live,
  });

  const summary = {
    studyId: BRTI_ACCESS_PROBE_STUDY_ID,
    generatedAtUtc: generatedAt,
    classification,
    credentials: {
      status: credentials.status,
      keyIdPresent: credentials.keyIdPresent,
      privateKeyLoaded: credentials.privateKeyLoaded,
      privateKeySource: credentials.privateKeySource,
    },
    layers: {
      endpointDocumented: true,
      codeImplemented: true,
      credentialsAvailable: credentials.status === "available",
      accessExercised: httpLog.some((item) => item.category === "success")
        || Boolean(live?.connected),
      historicalCoverageDemonstrated: targetReports.some((item) => item.historyObservationCount),
      causalSuitabilityEstablished: false,
    },
    httpRequestCount: input.argv.maxHttpRequests - budget.remaining,
    httpBudgetRemaining: budget.remaining,
    latestValues: latestValues
      ? { status: latestValues.status, category: latestValues.category, bodyTextHash: latestValues.bodyTextHash }
      : null,
    targets: targetReports,
    live: live
      ? {
          attempted: live.attempted,
          connected: live.connected,
          channels: live.channels,
          durationMs: live.durationMs,
          messagesReceived: live.messagesReceived,
          handshakeErrorCategory: live.handshakeErrorCategory,
          sawSettlementWindowAverage: live.sawSettlementWindowAverage,
          limitedBecauseNoSettlementWindow: live.limitedBecauseNoSettlementWindow,
          firstLocalReceivedAtMs: live.summaries[0]?.localReceivedAtMs ?? null,
          firstProviderReceivedAtMs: live.summaries[0]?.providerReceivedAtMs ?? null,
        }
      : { attempted: false },
    causalLimitations: [
      "Historical observation time is not provider publication/receipt time.",
      "This live probe's local receipt timestamps cannot establish historical latency.",
      "Historical values without contemporaneous receipt timestamps may support retrospective mechanical reconstruction while remaining insufficient for a causally faithful execution backtest.",
      "This live probe is an operational data-access sample, not an untouched future validation cohort.",
    ],
    knownFollowUpsPreserved: [
      "--skip-fetch is parsed elsewhere but not implemented",
      "default output paths can overwrite committed summaries",
      "two expiration-value strings contain thousands separators",
      "one target market lacks an official strike",
      "checkpoint-write reliability has a reviewer caveat",
    ],
    nextPrerequisite:
      "Confirm the smallest Kalshi-accepted CFB history timespan that stays inside a two-minute bound. Do not request HOUR. Until a documented bounded history parameter succeeds, do not treat settlement-state path reconstruction as unblocked.",
  };

  input.io.mkdir(input.argv.outDir);
  input.io.mkdir(input.argv.rawDir);
  input.io.writeFile(
    join(input.argv.outDir, "brti-access-probe-summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  input.io.writeFile(
    join(input.argv.rawDir, "http-log.hash-only.json"),
    `${JSON.stringify({ http: httpLog.map((item) => ({
      url: item.url,
      status: item.status,
      category: item.category,
      bodyTextHash: item.bodyTextHash,
      attempt: item.attempt,
    })), liveMessageCount: live?.messagesReceived ?? 0 }, null, 2)}\n`,
  );
  return summary;
}

async function probeOneTarget(input: {
  target: SpentTarget;
  argv: ParsedProbeArgv;
  credentials: KalshiCaptureCredentials;
  budget: HttpBudget;
  signedGet: typeof signedKalshiGet;
  unsignedGet: typeof unsignedKalshiGet;
  httpDeps: SignedGetDeps;
}): Promise<{ summary: Record<string, unknown>; http: SignedGetResult[] }> {
  const http: SignedGetResult[] = [];
  const restPath = buildKalshiRestMarketPath(input.target.marketTicker);
  const historicalPath = buildHistoricalMarketPath(input.target.marketTicker);
  let metadata = input.argv.skipHttp
    ? null
    : await input.unsignedGet({
      url: `${DEFAULT_KALSHI_HISTORICAL_API_BASE}${restPath}`,
      signPath: `/trade-api/v2${restPath}`,
      budget: input.budget,
      maxRetries: input.argv.maxRetriesPerRequest,
      deps: input.httpDeps,
    });
  if (metadata) {
    http.push(metadata);
  }
  if (metadata?.category === "not-found" && !input.argv.skipHttp) {
    metadata = await input.unsignedGet({
      url: `${DEFAULT_KALSHI_HISTORICAL_API_BASE}${historicalPath}`,
      signPath: `/trade-api/v2${historicalPath.split("?")[0]}`,
      budget: input.budget,
      maxRetries: input.argv.maxRetriesPerRequest,
      deps: input.httpDeps,
    });
    http.push(metadata);
  }
  const official = officialFieldsFromMarketBody(metadata?.body);
  const historyMinutes = official.closeTime
    ? plannedHistoryMinutesForClose(official.closeTime)
    : [];
  const historyResults: SignedGetResult[] = [];
  if (!input.argv.skipHttp && input.credentials.status === "available") {
    for (const minute of historyMinutes) {
      const built = buildCfbHistoryMinuteUrl({ minuteStartUtc: minute });
      assertHistoryUrlIsBounded(built.url);
      const result = await input.signedGet({
        url: built.url,
        signPath: built.signPath,
        credentials: input.credentials,
        budget: input.budget,
        maxRetries: input.argv.maxRetriesPerRequest,
        deps: input.httpDeps,
      });
      historyResults.push(result);
      http.push(result);
      if (result.category === "authentication-failure" || result.category === "entitlement-denial") {
        break;
      }
    }
  }

  const observations = historyResults.flatMap((result) => extractHistoryObservations(result.body));
  const cadence = inspectCadence(observations);
  const closeMs = official.closeTime ? Date.parse(official.closeTime) : Number.NaN;
  const reconstruction = Number.isFinite(closeMs)
    ? reconstructOfficialAverageIfSupported({
      observations,
      closeTimeMs: closeMs,
      officialExpirationRaw: official.expirationValue,
    })
    : null;

  return {
    http,
    summary: {
      ...input.target,
      official: {
        ...official,
        expirationValueParse: parseOfficialNumericString(official.expirationValue),
      },
      metadataStatus: metadata?.status ?? null,
      metadataCategory: metadata?.category ?? null,
      historyStatuses: historyResults.map((result) => ({
        status: result.status,
        category: result.category,
        bodyTextHash: result.bodyTextHash,
      })),
      historyObservationCount: observations.length,
      cadence,
      reconstruction,
      officialFieldsHash: sha256Json(official),
    },
  };
}

function classifyProbe(input: {
  credentialsStatus: string;
  latestValues: SignedGetResult | null;
  targetReports: Record<string, unknown>[];
  live: LiveCfbProbeResult | null;
}): ProbeClassification {
  if (input.credentialsStatus !== "available") {
    return "blocked-by-entitlement-credentials-retention-or-semantics";
  }
  const categories = [
    input.latestValues?.category,
    ...input.targetReports.flatMap((report) => {
      const history = report.historyStatuses;
      if (!Array.isArray(history)) {
        return [];
      }
      return history.map((item) => {
        return isRecord(item) && typeof item.category === "string" ? item.category : null;
      });
    }),
  ].filter((value): value is string => value != null);
  if (categories.includes("authentication-failure") || categories.includes("entitlement-denial")) {
    return "blocked-by-entitlement-credentials-retention-or-semantics";
  }
  const anyHistory = input.targetReports.some((report) => Number(report.historyObservationCount) > 0);
  const liveOk = Boolean(input.live?.connected);
  if ((anyHistory || liveOk) && input.targetReports.some((report) => {
    const reconstruction = report.reconstruction;
    return isRecord(reconstruction) && isRecord(reconstruction.mapping)
      && reconstruction.mapping.supported === true;
  })) {
    return "access-available-suitable-for-specified-next-step";
  }
  if (anyHistory || liveOk || input.latestValues?.category === "success") {
    return "access-available-with-identified-limitations";
  }
  return "inconclusive-within-bounded-probe";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function createFilesystemProbeIo(): ProbeIo {
  return {
    writeFile: (path, contents) => {
      writeFileSync(path, contents, "utf8");
    },
    mkdir: (path) => {
      mkdirSync(path, { recursive: true });
    },
    readFile: (path) => {
      if (!existsSync(path)) {
        return null;
      }
      return readFileSync(path, "utf8");
    },
    exists: (path) => existsSync(path),
  };
}
