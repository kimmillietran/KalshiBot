import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  completeHttpAttempt,
  createFilesystemCampaignBudgetIo,
  createSealedV0Ledger,
  loadOrCreateCampaignLedger,
  parseCampaignLedger,
  reserveHttpAttempt,
  V0_CAMPAIGN_ID,
  V1_CAMPAIGN_ID,
  type CampaignBudgetIo,
} from "./campaignBudget";
import {
  assertHistoryUrlIsHourBounded,
  buildCfbHistoryHourUrl,
  plannedHistoryHourForClose,
  selectFollowUpHistoricalTarget,
} from "./historicalSemantics";
import { reconstructOfficialAverageIfSupported } from "./inspectHistoryPayload";
import { formatKxbtc15mEventTicker, planLiveCloseWindow } from "./planLiveCloseWindow";
import { summarizeLiveMessage, runLiveCfbProbe } from "./runLiveCfbProbe";
import { signedKalshiGet } from "./signedKalshiGet";
import { KalshiBrtiAccessProbeError } from "./types";

const PEM = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey
  .export({ type: "pkcs1", format: "pem" })
  .toString();

function memoryIo(initial?: Record<string, string>): CampaignBudgetIo & { files: Map<string, string> } {
  const files = new Map<string, string>(Object.entries(initial ?? {}));
  let held = false;
  return {
    files,
    readFile: (path) => files.get(path) ?? null,
    writeFile: (path, contents) => {
      files.set(path, contents);
    },
    mkdir: () => undefined,
    withExclusiveLock: (_path, fn) => {
      if (held) {
        throw new KalshiBrtiAccessProbeError("campaign-budget-lock-timeout");
      }
      held = true;
      try {
        return fn();
      } finally {
        held = false;
      }
    },
    nowIso: () => "2026-09-24T03:00:00.000Z",
  };
}

const credentials = {
  status: "available" as const,
  apiKeyId: "key-id",
  apiBaseUrl: null,
  wsUrl: null,
  privateKeyMaterial: {
    status: "loaded" as const,
    source: "raw-env" as const,
    privateKeyPem: PEM,
    privateKeyLoaded: true,
    privateKeyFingerprint: "abc",
    warnings: [],
    error: null,
  },
  privateKeySource: "raw-env" as const,
  privateKeyLoaded: true,
  privateKeyFingerprint: "abc",
  keyIdPresent: true,
  warnings: [],
  error: null,
};

describe("campaign budget persistence", () => {
  it("survives resume and refuses a second-pass reset", () => {
    const io = memoryIo();
    const ledgerPath = "/tmp/ledger.json";
    loadOrCreateCampaignLedger({
      ledgerPath,
      campaignId: V1_CAMPAIGN_ID,
      limit: 10,
      io,
    });
    reserveHttpAttempt({
      ledgerPath,
      lockPath: "/tmp/lock",
      campaignId: V1_CAMPAIGN_ID,
      limit: 10,
      purpose: "historical-brti",
      io,
    });
    const resumed = loadOrCreateCampaignLedger({
      ledgerPath,
      campaignId: V1_CAMPAIGN_ID,
      limit: 10,
      io,
      requireExisting: true,
    });
    expect(resumed.consumed).toBe(1);
    expect(() => loadOrCreateCampaignLedger({
      ledgerPath,
      campaignId: V1_CAMPAIGN_ID,
      limit: 99,
      io,
    })).toThrow(/campaign-budget-mismatch/);
  });

  it("counts retries and failed requests", async () => {
    const io = memoryIo();
    const ledgerPath = "/ledger.json";
    loadOrCreateCampaignLedger({
      ledgerPath,
      campaignId: V1_CAMPAIGN_ID,
      limit: 10,
      io,
    });
    const calls: string[] = [];
    await signedKalshiGet({
      url: "https://example.test/trade-api/v2/cfbenchmarks/history/values?id=BRTI",
      signPath: "/trade-api/v2/cfbenchmarks/history/values",
      credentials,
      budget: { remaining: 10 },
      maxRetries: 1,
      deps: {
        fetchImpl: (async () => {
          calls.push("fetch");
          return new Response(JSON.stringify({ error: "temporarily unavailable" }), { status: 503 });
        }) as unknown as typeof fetch,
        campaign: {
          ledgerPath,
          lockPath: "/lock",
          campaignId: V1_CAMPAIGN_ID,
          limit: 10,
          purpose: "historical-brti",
          io,
        },
      },
    });
    expect(calls).toHaveLength(2);
    expect(parseCampaignLedger(io.files.get(ledgerPath)!).consumed).toBe(2);
  });

  it("cannot concurrently reserve past the cap", async () => {
    const io = memoryIo();
    const ledgerPath = "/ledger.json";
    loadOrCreateCampaignLedger({
      ledgerPath,
      campaignId: V1_CAMPAIGN_ID,
      limit: 1,
      io,
    });
    const settled = await Promise.allSettled([
      Promise.resolve().then(() => reserveHttpAttempt({
        ledgerPath,
        lockPath: "/lock",
        campaignId: V1_CAMPAIGN_ID,
        limit: 1,
        purpose: "historical-brti",
        io,
      })),
      Promise.resolve().then(() => reserveHttpAttempt({
        ledgerPath,
        lockPath: "/lock",
        campaignId: V1_CAMPAIGN_ID,
        limit: 1,
        purpose: "official-settlement-metadata",
        io,
      })),
    ]);
    expect(settled.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(settled.filter((item) => item.status === "rejected")).toHaveLength(1);
    expect(parseCampaignLedger(io.files.get(ledgerPath)!).consumed).toBe(1);
  });

  it("does not dispatch when budget persist fails", async () => {
    const io = memoryIo();
    const ledgerPath = "/ledger.json";
    loadOrCreateCampaignLedger({
      ledgerPath,
      campaignId: V1_CAMPAIGN_ID,
      limit: 10,
      io,
    });
    io.writeFile = () => {
      throw new Error("disk-full");
    };
    const calls: string[] = [];
    await expect(signedKalshiGet({
      url: "https://example.test/trade-api/v2/cfbenchmarks/values?id=BRTI",
      signPath: "/trade-api/v2/cfbenchmarks/values",
      credentials,
      budget: { remaining: 10 },
      maxRetries: 0,
      deps: {
        fetchImpl: (async () => {
          calls.push("fetch");
          return new Response("{}", { status: 200 });
        }) as unknown as typeof fetch,
        campaign: {
          ledgerPath,
          lockPath: "/lock",
          campaignId: V1_CAMPAIGN_ID,
          limit: 10,
          purpose: "latest-cfb-values",
          io,
        },
      },
    })).rejects.toThrow(/disk-full/);
    expect(calls).toHaveLength(0);
  });

  it("fails closed on missing, corrupt, or mismatched state", () => {
    const io = memoryIo();
    expect(() => reserveHttpAttempt({
      ledgerPath: "/missing.json",
      lockPath: "/lock",
      campaignId: V1_CAMPAIGN_ID,
      limit: 10,
      purpose: "historical-brti",
      io,
    })).toThrow(/campaign-budget-missing/);
    io.files.set("/bad.json", "{not-json");
    expect(() => parseCampaignLedger(io.files.get("/bad.json")!)).toThrow(/campaign-budget-corrupt/);
    const sealed = createSealedV0Ledger("2026-09-24T02:34:00.000Z");
    expect(sealed.consumed).toBe(13);
    expect(sealed.limit).toBe(10);
    io.files.set("/v0.json", JSON.stringify(sealed));
    expect(() => reserveHttpAttempt({
      ledgerPath: "/v0.json",
      lockPath: "/lock",
      campaignId: V0_CAMPAIGN_ID,
      limit: 10,
      purpose: "historical-brti",
      io,
    })).toThrow(/campaign-budget-exhausted/);
  });

  it("filesystem lock serializes reservations", () => {
    const root = mkdtempSync(join(tmpdir(), "brti-budget-"));
    const io = createFilesystemCampaignBudgetIo();
    const ledgerPath = join(root, "http-budget-ledger.json");
    const lockPath = join(root, "http-budget-ledger.lock");
    loadOrCreateCampaignLedger({
      ledgerPath,
      campaignId: V1_CAMPAIGN_ID,
      limit: 2,
      io,
    });
    reserveHttpAttempt({
      ledgerPath,
      lockPath,
      campaignId: V1_CAMPAIGN_ID,
      limit: 2,
      purpose: "historical-brti",
      io,
    });
    reserveHttpAttempt({
      ledgerPath,
      lockPath,
      campaignId: V1_CAMPAIGN_ID,
      limit: 2,
      purpose: "official-settlement-metadata",
      io,
    });
    expect(() => reserveHttpAttempt({
      ledgerPath,
      lockPath,
      campaignId: V1_CAMPAIGN_ID,
      limit: 2,
      purpose: "rest-markets",
      io,
    })).toThrow(/campaign-budget-exhausted/);
    completeHttpAttempt({
      ledgerPath,
      lockPath,
      reservationId: "1:historical-brti",
      httpStatus: 200,
      category: "success",
      io,
    });
    const raw = io.readFile(ledgerPath);
    expect(raw).not.toMatch(/BEGIN|KALSHI-ACCESS|key-id/);
  });
});

describe("follow-up historical and live bounds", () => {
  it("selects the middle SPENT target and one HOUR window only", () => {
    const target = selectFollowUpHistoricalTarget([
      { role: "early", utcDay: "2026-08-14", marketTicker: "A" },
      { role: "middle", utcDay: "2026-08-30", marketTicker: "KXBTC15M-26AUG301415-15" },
      { role: "late", utcDay: "2026-09-21", marketTicker: "C" },
    ]);
    expect(target.marketTicker).toBe("KXBTC15M-26AUG301415-15");
    const hour = plannedHistoryHourForClose("2026-08-30T18:15:00.000Z");
    expect(hour.hourStartUtc).toBe("2026-08-30T18:00:00.000Z");
    expect(hour.settlementWindowInsideHour).toBe(true);
    const built = buildCfbHistoryHourUrl({ hourStartUtc: hour.hourStartUtc });
    expect(built.timespan).toBe("HOUR");
    expect(built.coverageMs).toBe(3_600_000);
    expect(() => assertHistoryUrlIsHourBounded(built.url.replace("HOUR", "DAY"))).toThrow(/forbidden|timespan/);
    expect(() => assertHistoryUrlIsHourBounded(built.url.replace("HOUR", "MINUTE"))).toThrow(/MINUTE/);
  });

  it("does not treat 60 one-second buckets as official sample mapping", () => {
    const close = Date.parse("2026-08-30T18:15:00.000Z");
    const oneHz = Array.from({ length: 60 }, (_, index) => ({
      timeRaw: close - 59_000 + index * 1000,
      timeMs: close - 59_000 + index * 1000,
      valueRaw: "100.25",
      value: 100.25,
    }));
    const mapping = reconstructOfficialAverageIfSupported({
      observations: oneHz,
      closeTimeMs: close,
      officialExpirationRaw: "100.25",
    });
    expect(mapping.mapping.supported).toBe(false);
    expect(mapping.mapping.reason).toBe("bucket-count-is-not-official-sample-mapping");
  });

  it("enforces live deadline and message cap", async () => {
    let now = 1_000;
    const messages = [
      JSON.stringify({ type: "subscribed" }),
      JSON.stringify({
        type: "cfbenchmarks_value",
        msg: {
          index_id: "BRTI",
          received_at: 1500,
          data: "{\"value\":\"1.0\"}",
          avg_60s_data: { value: "1.0", window_size: 1, window_start_ts_ms: 1, window_end_ts_exclusive: 2 },
        },
      }),
      JSON.stringify({
        type: "cfbenchmarks_value",
        msg: {
          index_id: "BRTI",
          received_at: 1600,
          last_60s_windowed_average_15min: {
            value: "2.00",
            window_size: 60,
            window_start_ts_ms: 1,
            window_end_ts_exclusive: 2,
          },
          data: "{\"value\":\"2.0\"}",
          avg_60s_data: { value: "2.0", window_size: 1, window_start_ts_ms: 1, window_end_ts_exclusive: 2 },
        },
      }),
      JSON.stringify({ type: "cfbenchmarks_value", msg: { index_id: "BRTI", data: "{}" } }),
      JSON.stringify({ type: "cfbenchmarks_value", msg: { index_id: "BRTI", data: "{}" } }),
    ];
    let handler: ((payload: string) => void) | null = null;
    const result = await runLiveCfbProbe({
      credentials,
      durationSeconds: 90,
      messageCap: 3,
      startAtMs: 2_000,
      stopAtMs: 12_000,
      maxConnections: 2,
      deps: {
        nowMs: () => now,
        sleep: async () => {
          now += 50;
          if (handler && messages.length > 0) {
            handler(messages.shift()!);
          }
        },
        transport: {
          connect: async () => {
            now = Math.max(now, 2_000);
          },
          send: () => undefined,
          close: () => undefined,
          onMessage: (next) => {
            handler = next;
          },
        },
      },
    });
    expect(result.messagesReceived).toBeLessThanOrEqual(3);
    expect(result.stoppedAtCap).toBe(true);
    expect(result.venueSettlementAverage?.windowSize).toBe(60);
    expect(result.channels).toEqual(["cfbenchmarks_value"]);
  });

  it("reports missing settlement metadata without inventing values", () => {
    const window = planLiveCloseWindow(Date.parse("2026-09-24T02:50:00.000Z"));
    expect(window.closeIso).toBe("2026-09-24T03:00:00.000Z");
    expect(window.durationMs).toBe(90_000);
    expect(formatKxbtc15mEventTicker(Date.parse("2026-08-14T18:30:00.000Z"))).toBe(
      "KXBTC15M-26AUG141430",
    );
    const summary = summarizeLiveMessage("{\"type\":\"subscribed\"}", 10);
    expect(summary.last60sWindowedAverage15min).toBeNull();
    expect(summary.rawValue).toBeNull();
  });
});
