import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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
import {
  unsignedKalshiGet,
  type HttpBudget,
  type SignedGetDeps,
} from "@/lib/data/research/kalshiBrtiAccessProbe/signedKalshiGet";
import {
  resolveKalshiCaptureCredentials,
  type KalshiCaptureCredentials,
} from "@/lib/data/live/kalshiWsCaptureSpike/resolveKalshiCaptureCredentials";

import { analyzeSynchronizedSession } from "./analyzeSynchronizedSession";
import { bindLiveMarketToPlannedClose, officialSettlementMatchesBoundMarket, type LiveMarketIdentity } from "./bindLiveMarket";
import { planSynchronizedWindow } from "./captureLimits";
import { inspectHistoricalHour, type HistoricalHourInspection } from "./inspectHistoricalHour";
import {
  runSynchronizedCapture,
  type SynchronizedCaptureDeps,
  type SynchronizedCaptureResult,
} from "./runSynchronizedCapture";
import {
  MAPPING_MAX_HTTP,
  MAPPING_MAX_RETRY_DELAY_MS,
  SETTLEMENT_SAMPLE_MAPPING_STUDY_ID,
  type ParsedMappingArgv,
} from "./types";

const SECRET_PATTERN = /BEGIN PRIVATE KEY|KALSHI-ACCESS|authorization|api[_-]?key/i;

export type MappingIo = {
  writeFile: (path: string, contents: string) => void;
  mkdir: (path: string) => void;
  readFile?: (path: string) => string | null;
  exists?: (path: string) => boolean;
  appendRaw?: (path: string, line: string) => void;
};

export type MappingRunDeps = {
  resolveCredentials?: () => KalshiCaptureCredentials;
  unsignedGet?: typeof unsignedKalshiGet;
  httpDeps?: SignedGetDeps;
  capture?: typeof runSynchronizedCapture;
  captureDeps?: SynchronizedCaptureDeps;
  nowMs?: () => number;
  sleep?: (ms: number) => Promise<void>;
  campaignIo?: CampaignBudgetIo;
};

function assertSecretSafe(value: unknown, label: string): void {
  const serialized = JSON.stringify(value);
  if (SECRET_PATTERN.test(serialized)) {
    throw new Error(`refusing-to-persist-secrets:${label}`);
  }
}

export function createFilesystemMappingIo(): MappingIo {
  return {
    writeFile: (path, contents) => {
      writeFileSync(path, contents, "utf8");
    },
    mkdir: (path) => {
      mkdirSync(path, { recursive: true });
    },
    readFile: (path) => (existsSync(path) ? readFileSync(path, "utf8") : null),
    exists: (path) => existsSync(path),
    appendRaw: (path, line) => {
      mkdirSync(join(path, ".."), { recursive: true });
      writeFileSync(path, `${line}\n`, { flag: "a" });
    },
  };
}

async function budgetedGet(input: {
  url: string;
  signPath: string;
  purpose: "live-market-discovery" | "rest-markets" | "official-settlement-metadata";
  argv: ParsedMappingArgv;
  repoRoot: string;
  budget: HttpBudget;
  deps?: MappingRunDeps;
}): Promise<Awaited<ReturnType<typeof unsignedKalshiGet>> | null> {
  const campaignDir = join(input.repoRoot, input.argv.campaignDir);
  const io = input.deps?.campaignIo ?? createFilesystemCampaignBudgetIo();
  const getter = input.deps?.unsignedGet ?? unsignedKalshiGet;
  return getter({
    url: input.url,
    signPath: input.signPath,
    budget: input.budget,
    maxRetries: 1,
    deps: {
      fetchImpl: input.deps?.httpDeps?.fetchImpl ?? fetch,
      nowMs: input.deps?.nowMs,
      campaign: {
        ledgerPath: campaignLedgerPath(campaignDir),
        lockPath: campaignLockPath(campaignDir),
        campaignId: input.argv.campaignId,
        limit: input.argv.maxHttpRequests,
        purpose: input.purpose,
        io,
      },
    },
  });
}

export async function runSettlementSampleMapping(input: {
  repoRoot: string;
  argv: ParsedMappingArgv;
  io: MappingIo;
  deps?: MappingRunDeps;
}): Promise<Record<string, unknown>> {
  const nowMs = input.deps?.nowMs ?? Date.now;
  const wait = input.deps?.sleep ?? ((ms: number) => new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  }));
  const outDir = join(input.repoRoot, input.argv.outDir);
  const rawDir = join(input.repoRoot, input.argv.rawDir);
  input.io.mkdir(outDir);
  input.io.mkdir(join(rawDir, "responses"));

  const campaignIo = input.deps?.campaignIo ?? createFilesystemCampaignBudgetIo();
  const campaignDir = join(input.repoRoot, input.argv.campaignDir);
  input.io.mkdir(campaignDir);
  const ledger = loadOrCreateCampaignLedger({
    ledgerPath: campaignLedgerPath(campaignDir),
    campaignId: input.argv.campaignId,
    limit: input.argv.maxHttpRequests,
    io: campaignIo,
  });
  const budget: HttpBudget = { remaining: Math.max(0, ledger.limit - ledger.consumed) };

  const offline: HistoricalHourInspection | null = input.argv.skipOffline
    ? null
    : inspectHistoricalHour({
      repoRoot: input.repoRoot,
      readFile: input.io.readFile,
    });

  let liveMarket: LiveMarketIdentity | null = null;
  let discoveryStatus: string = "not-attempted";
  let capture: SynchronizedCaptureResult | null = null;
  let officialBody: unknown = null;
  let officialAttempts = 0;
  const plan = planSynchronizedWindow(nowMs());

  if (!input.argv.skipHttp) {
    try {
      const discovery = await budgetedGet({
        url: `${KALSHI_API_BASE}/markets?series_ticker=KXBTC15M&status=open&limit=20`,
        signPath: "/trade-api/v2/markets",
        purpose: "live-market-discovery",
        argv: input.argv,
        repoRoot: input.repoRoot,
        budget,
        deps: input.deps,
      });
      if (discovery) {
        const bind = bindLiveMarketToPlannedClose({
          body: discovery.body,
          plannedCloseIso: plan.closeIso,
          expectedEventTicker: formatKxbtc15mEventTicker(plan.closeMs),
        });
        discoveryStatus = bind.status;
        if (bind.status === "bound") {
          liveMarket = bind.market;
        }
      }
    } catch (error) {
      discoveryStatus = error instanceof Error ? error.message : "discovery-failed";
    }
  } else {
    discoveryStatus = "skipped";
  }

  if (!input.argv.skipLive && liveMarket != null) {
    const credentials = (input.deps?.resolveCredentials ?? resolveKalshiCaptureCredentials)();
    const rawPath = join(rawDir, "synchronized-capture.jsonl");
    const runner = input.deps?.capture ?? runSynchronizedCapture;
    capture = await runner({
      credentials,
      market: liveMarket,
      plan,
      deps: {
        ...input.deps?.captureDeps,
        nowMs,
        sleep: wait,
        appendRaw: (line) => input.io.appendRaw?.(rawPath, line),
      },
    });
  } else if (!input.argv.skipLive && liveMarket == null) {
    discoveryStatus = discoveryStatus === "skipped"
      ? "skipped"
      : "unbound-no-capture";
  }

  if (!input.argv.skipHttp && liveMarket != null && capture != null) {
    const marketPath = buildKalshiRestMarketPath(liveMarket.ticker);
    while (officialAttempts < input.argv.maxPostCloseSettlement && budget.remaining > 0) {
      officialAttempts += 1;
      try {
        const result = await budgetedGet({
          url: `${KALSHI_API_BASE}${marketPath}`,
          signPath: `/trade-api/v2${marketPath}`,
          purpose: "official-settlement-metadata",
          argv: input.argv,
          repoRoot: input.repoRoot,
          budget,
          deps: input.deps,
        });
        officialBody = result?.body ?? null;
        const match = officialSettlementMatchesBoundMarket({
          body: officialBody,
          bound: liveMarket,
        });
        if (match.matches && match.expirationValue && match.expirationValue.trim() !== "") {
          break;
        }
      } catch {
        // bounded retry below
      }
      if (officialAttempts < input.argv.maxPostCloseSettlement && budget.remaining > 0) {
        await wait(Math.min(MAPPING_MAX_RETRY_DELAY_MS, 250));
      }
    }
  }

  const analysis = capture != null
    ? analyzeSynchronizedSession({
      capture,
      market: liveMarket,
      officialBody: officialBody ?? undefined,
    })
    : null;

  const officialComparison = officialBody != null && liveMarket != null
    ? compareOfficialSettlementToObservedWindow({
      body: officialBody,
      venueAverageRaw: analysis?.completedSettlementAverage?.valueRaw ?? null,
      observedCloseIso: liveMarket.closeTimeUtc,
      expectedEventTicker: liveMarket.eventTicker,
    })
    : analysis?.officialComparison ?? {
      status: "not-attempted" as const,
      reason: capture == null ? "live-capture-not-run" : "official-settlement-not-retrieved",
    };

  const finalLedger = loadOrCreateCampaignLedger({
    ledgerPath: campaignLedgerPath(campaignDir),
    campaignId: input.argv.campaignId,
    limit: input.argv.maxHttpRequests,
    io: campaignIo,
    requireExisting: true,
  });

  const summary = {
    studyId: SETTLEMENT_SAMPLE_MAPPING_STUDY_ID,
    campaignId: input.argv.campaignId,
    generatedAtUtc: new Date(nowMs()).toISOString(),
    role: "data-fidelity-and-capture-readiness",
    notAnAlphaExperiment: true,
    offline,
    live: {
      planned: plan,
      discoveryStatus,
      market: liveMarket,
      capture: capture == null
        ? null
        : {
          attempted: capture.attempted,
          connected: capture.connected,
          connectionAttempts: capture.connectionAttempts,
          subscriptionAttempts: capture.subscriptionAttempts,
          channels: capture.channels,
          actualStartMs: capture.actualStartMs,
          actualStopMs: capture.actualStopMs,
          connectedBeforeWindow: capture.connectedBeforeWindow,
          messagesReceived: capture.limits.messagesReceived,
          rawBytes: capture.limits.rawBytes,
          stopReason: capture.limits.stopReason,
          handshakeErrorCategory: capture.handshakeErrorCategory,
          bookDiagnostics: capture.bookDiagnostics,
          flushed: capture.flushed,
          closedCleanly: capture.closedCleanly,
        },
      analysis,
      officialComparison,
      officialSettlementAttempts: officialAttempts,
    },
    httpBudget: {
      campaignId: finalLedger.campaignId,
      consumed: finalLedger.consumed,
      limit: finalLedger.limit,
      sealed: finalLedger.sealed,
      remaining: finalLedger.limit - finalLedger.consumed,
    },
    priorCampaignsPreserved: {
      v0: { campaignId: "kalshi-kxbtc15m-brti-access-probe-v0", sealedAt: "13/10" },
      v1: { campaignId: "kalshi-kxbtc15m-brti-access-probe-v1", recordedUsageIntact: true },
    },
    limits: {
      maxHttp: MAPPING_MAX_HTTP,
      maxPostCloseSettlement: input.argv.maxPostCloseSettlement,
    },
  };
  assertSecretSafe(summary, "summary");
  input.io.writeFile(join(outDir, "settlement-sample-mapping-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  input.io.writeFile(join(outDir, "artifact-catalog.json"), `${JSON.stringify({
    studyId: SETTLEMENT_SAMPLE_MAPPING_STUDY_ID,
    files: [
      "settlement-sample-mapping-summary.json",
      "artifact-catalog.json",
      "http-budget-ledger.json",
    ],
    rawGitignored: true,
    rawDir: input.argv.rawDir,
  }, null, 2)}\n`);
  return summary;
}
