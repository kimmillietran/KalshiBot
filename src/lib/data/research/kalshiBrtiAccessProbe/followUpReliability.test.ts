import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  AUTHORIZED_FOLLOW_UP_HOUR_START_UTC,
  bindHistoricalRequestToAuthorizedHour,
  loadOfficialMetadataForSelectedTarget,
  SELECTED_FOLLOW_UP_TICKER,
  validateOfficialTargetMetadata,
} from "./bindOfficialTargetMetadata";
import {
  createFilesystemCampaignBudgetIo,
  loadOrCreateCampaignLedger,
  parseCampaignLedger,
  reserveHttpAttempt,
  V1_CAMPAIGN_ID,
} from "./campaignBudget";
import { compareOfficialSettlementToObservedWindow } from "./compareOfficialSettlement";
import { cliFollowUpPreview, serializeFollowUpSummary } from "./followUpSummary";
import { inspectHistoryPayload } from "./inspectHistoryPayload";
import { parseKalshiBrtiAccessProbeArgv } from "./parseArgv";
import { retainLocalHttpResponse, sanitizeResponseHeaders } from "./retainLocalResponse";
import { runFollowUpBrtiCampaign } from "./runFollowUpCampaign";
import type { OfficialTargetMetadata } from "./bindOfficialTargetMetadata";
import type { CampaignBudgetIo } from "./campaignBudget";
import { KalshiBrtiAccessProbeError } from "./types";

const PEM = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey
  .export({ type: "pkcs1", format: "pem" })
  .toString();

const BOUND_METADATA: OfficialTargetMetadata = {
  ticker: SELECTED_FOLLOW_UP_TICKER,
  closeTimeUtc: "2026-08-30T18:15:00Z",
  expirationValue: "78833.97",
  provenance: {
    sourceId: "injected-fixture",
    closeTimeField: "official.closeTime",
    expirationValueField: "official.expirationValue",
    retrievedVia: "test",
  },
};

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

function writeSpentFixtures(root: string): void {
  const audit = join(root, "data/research-results/external-kalshi-data-audit");
  mkdirSync(join(audit, "m17-prep-settlement-friction-coverage"), { recursive: true });
  mkdirSync(join(audit, "m17-prep-settlement-friction-label-coverage"), { recursive: true });
  writeFileSync(join(audit, "m17-prep-settlement-friction-coverage/settlement-friction-coverage-manifest.json"), JSON.stringify({
    calendar: { eligibleUtcDays: ["2026-08-14", "2026-08-30", "2026-09-21"] },
  }));
  writeFileSync(join(audit, "m16-er-blind-incidence.json"), JSON.stringify({
    days: [
      { utcDate: "2026-08-14", confirmations: [{ ticker: "KXBTC15M-26AUG141430-30", utcDayKey: "2026-08-14" }] },
      { utcDate: "2026-08-30", confirmations: [{ ticker: SELECTED_FOLLOW_UP_TICKER, utcDayKey: "2026-08-30" }] },
      { utcDate: "2026-09-21", confirmations: [{ ticker: "KXBTC15M-26SEP211415-15", utcDayKey: "2026-09-21" }] },
    ],
  }));
  writeFileSync(join(audit, "m17-prep-settlement-friction-label-coverage/incomplete-records.json"), JSON.stringify({
    records: [],
  }));
}

function memoryBudgetIo(initial?: Record<string, string>): CampaignBudgetIo & { files: Map<string, string> } {
  const files = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    files,
    readFile: (path) => files.get(path) ?? null,
    writeFile: (path, contents) => {
      files.set(path, contents);
    },
    mkdir: () => undefined,
    withExclusiveLock: (_path, fn) => fn(),
    nowIso: () => "2026-09-24T04:00:00.000Z",
  };
}

function emptyHistoryBody(): unknown {
  return { data: { payload: { id: "BRTI", values: [] } } };
}

describe("official metadata binding", () => {
  it("binds the selected ticker to official close and the authorized hour", () => {
    const bound = validateOfficialTargetMetadata({ metadata: BOUND_METADATA });
    expect(bound.status).toBe("bound");
    if (bound.status !== "bound") {
      return;
    }
    expect(bound.request.hourStartUtc).toBe(AUTHORIZED_FOLLOW_UP_HOUR_START_UTC);
    expect(bound.request.hourEndExclusiveUtc).toBe("2026-08-30T19:00:00.000Z");
    expect(bound.request.settlementWindowInsideHour).toBe(true);
    expect(bound.request.matchesAuthorizedHour).toBe(true);
    expect(bound.request.expirationValue).toBe("78833.97");
  });

  it("rejects mismatched ticker or close metadata instead of changing the hour", () => {
    expect(validateOfficialTargetMetadata({
      metadata: { ...BOUND_METADATA, ticker: "KXBTC15M-26AUG141430-30" },
    }).status).toBe("rejected");
    const wrongClose = validateOfficialTargetMetadata({
      metadata: { ...BOUND_METADATA, closeTimeUtc: "2026-09-21T18:15:00Z" },
    });
    expect(wrongClose.status).toBe("rejected");
    if (wrongClose.status === "rejected") {
      expect(wrongClose.reason).toMatch(/does not match authorized/);
      expect(wrongClose.request?.hourStartUtc).toBe("2026-09-21T18:00:00.000Z");
    }
    expect(() => bindHistoricalRequestToAuthorizedHour({
      ...BOUND_METADATA,
      closeTimeUtc: "not-a-time",
    })).toThrow(KalshiBrtiAccessProbeError);
  });

  it("loads permitted v0 official metadata and does not invent expiration", () => {
    const root = mkdtempSync(join(tmpdir(), "brti-bind-"));
    const summaryDir = join(root, "data/research-results/external-kalshi-data-audit/m17-prep-brti-access-probe");
    mkdirSync(summaryDir, { recursive: true });
    writeFileSync(join(summaryDir, "brti-access-probe-summary.json"), JSON.stringify({
      targets: [{
        official: {
          ticker: SELECTED_FOLLOW_UP_TICKER,
          closeTime: "2026-08-30T18:15:00Z",
        },
      }],
    }));
    const loaded = loadOfficialMetadataForSelectedTarget({
      repoRoot: root,
      readFile: (path) => {
        if (path.endsWith("brti-access-probe-summary.json")) {
          return JSON.stringify({
            targets: [{
              official: {
                ticker: SELECTED_FOLLOW_UP_TICKER,
                closeTime: "2026-08-30T18:15:00Z",
              },
            }],
          });
        }
        return null;
      },
    });
    expect(loaded.status).toBe("bound");
    if (loaded.status === "bound") {
      expect(loaded.request.expirationAvailableForComparison).toBe(false);
      expect(loaded.metadata.expirationValue).toBeNull();
      expect(loaded.metadata.provenance.sourceId).toBe("v0-official-rest-metadata");
    }
  });
});

describe("live official comparison identity", () => {
  it("matches the observed window instead of the first non-empty expiration", () => {
    const body = {
      markets: [
        {
          ticker: "KXBTC15M-26SEP232245-15",
          event_ticker: "KXBTC15M-26SEP232245",
          status: "finalized",
          result: "yes",
          open_time: "2026-09-24T02:45:00Z",
          close_time: "2026-09-24T02:45:00Z",
          expiration_value: "11111.11",
        },
        {
          ticker: "KXBTC15M-26SEP232300-15",
          event_ticker: "KXBTC15M-26SEP232300",
          status: "finalized",
          result: "yes",
          open_time: "2026-09-24T02:45:00Z",
          close_time: "2026-09-24T03:00:00Z",
          expiration_value: "84349.74",
        },
      ],
    };
    const compared = compareOfficialSettlementToObservedWindow({
      body,
      venueAverageRaw: "84349.74383333",
      observedCloseIso: "2026-09-24T03:00:00.000Z",
      expectedEventTicker: "KXBTC15M-26SEP232300",
    });
    expect(compared.status).toBe("agree");
    expect(compared.officialExpirationRaw).toBe("84349.74");
    expect(compared.matchedTicker).toBe("KXBTC15M-26SEP232300-15");
    expect(compareOfficialSettlementToObservedWindow({
      body,
      venueAverageRaw: "84349.74",
      observedCloseIso: "2026-09-24T03:00:00.000Z",
      expectedEventTicker: "KXBTC15M-26AUG301415",
    }).status).toBe("not-compared");
  });
});

describe("history payload classification", () => {
  const hourStartMs = Date.parse("2026-08-30T18:00:00.000Z");
  const hourEndMs = Date.parse("2026-08-30T19:00:00.000Z");
  const closeMs = Date.parse("2026-08-30T18:15:00.000Z");

  it("distinguishes valid empty history from unsupported schema", () => {
    expect(inspectHistoryPayload({
      body: emptyHistoryBody(),
      hourStartMs,
      hourEndExclusiveMs: hourEndMs,
      closeTimeMs: closeMs,
    }).kind).toBe("valid-empty-history");
    expect(inspectHistoryPayload({
      body: { serverTime: "2026-09-24T00:00:00Z", unexpected: true },
      hourStartMs,
      hourEndExclusiveMs: hourEndMs,
      closeTimeMs: closeMs,
    }).kind).toBe("unsupported-schema");
    expect(inspectHistoryPayload({
      body: { error: { code: "denied", message: "STREAM_HISTORICAL_VALUES" } },
      hourStartMs,
      hourEndExclusiveMs: hourEndMs,
      closeTimeMs: closeMs,
    }).kind).toBe("response-error-in-200");
  });

  it("parses representative ticks, timestamp units, and out-of-hour rows", () => {
    const inHourSeconds = hourStartMs / 1000 + 60;
    const inHourMicros = (hourStartMs + 120_000) * 1000;
    const outOfHour = hourStartMs - 60_000;
    const inspection = inspectHistoryPayload({
      body: {
        data: {
          payload: {
            id: "BRTI",
            values: [
              { time: inHourSeconds, value: "78810.10" },
              { time: inHourMicros, value: "78811.11" },
              { time: outOfHour, value: "78700.00" },
              { time: "2026-08-30T18:14:30.000Z", value: "78820.20" },
            ],
          },
        },
      },
      hourStartMs,
      hourEndExclusiveMs: hourEndMs,
      closeTimeMs: closeMs,
    });
    expect(inspection.kind).toBe("observations-present");
    expect(inspection.parsedObservationCount).toBe(4);
    expect(inspection.inHourCount).toBe(3);
    expect(inspection.outOfHourCount).toBe(1);
    expect(inspection.settlementMinuteCount).toBe(1);
    expect(inspectHistoryPayload({
      body: { values: [{ time: outOfHour, value: "1" }] },
      hourStartMs,
      hourEndExclusiveMs: hourEndMs,
      closeTimeMs: closeMs,
    }).kind).toBe("out-of-hour-only");
    expect(inspectHistoryPayload({
      body: { values: [{ foo: 1 }, { bar: 2 }] },
      hourStartMs,
      hourEndExclusiveMs: hourEndMs,
      closeTimeMs: closeMs,
    }).kind).toBe("observations-unrecognized");
  });
});

describe("follow-up summary, CLI, budget, and retention", () => {
  it("serializes classification and persisted budget fields for the CLI", async () => {
    const root = mkdtempSync(join(tmpdir(), "brti-summary-"));
    writeSpentFixtures(root);
    const outDir = join(root, "out");
    const rawDir = join(root, "raw");
    const writes = new Map<string, string>();
    const summary = await runFollowUpBrtiCampaign({
      repoRoot: root,
      argv: parseKalshiBrtiAccessProbeArgv([
        "--follow-up",
        "--fixture",
        "--out-dir", outDir,
        "--raw-dir", rawDir,
        "--campaign-dir", outDir,
      ]),
      io: {
        writeFile: (path, contents) => {
          writes.set(path, contents);
        },
        mkdir: () => undefined,
      },
      deps: {
        resolveCredentials: () => ({ ...credentials, status: "missing", apiKeyId: null, privateKeyLoaded: false }),
        officialMetadata: BOUND_METADATA,
      },
    });
    expect(summary.classification).toBeTruthy();
    expect(summary.httpRequestCount).toBe(0);
    expect(summary.httpBudget.consumed).toBe(0);
    expect(cliFollowUpPreview(summary)).toEqual({
      classification: summary.classification,
      httpRequestCount: 0,
      credentials: summary.credentials,
    });
    const serialized = serializeFollowUpSummary(summary);
    expect(serialized).toContain("\"classification\"");
    expect(serialized).toContain("\"httpRequestCount\"");
    expect(writes.has(join(outDir, "brti-access-probe-v1-reliability-supplement.json"))).toBe(true);
  });

  it("reports offline when the persistent budget is exhausted", async () => {
    const root = mkdtempSync(join(tmpdir(), "brti-offline-"));
    writeSpentFixtures(root);
    const outDir = join(root, "out");
    const budgetIo = memoryBudgetIo();
    const argv = parseKalshiBrtiAccessProbeArgv([
      "--follow-up",
      "--skip-http",
      "--skip-live",
      "--out-dir", outDir,
      "--raw-dir", join(root, "raw"),
      "--campaign-dir", "out",
    ]);
    const ledgerPath = join(root, argv.campaignDir, "http-budget-ledger.json");
    loadOrCreateCampaignLedger({
      ledgerPath,
      campaignId: V1_CAMPAIGN_ID,
      limit: 10,
      io: budgetIo,
    });
    for (let index = 0; index < 10; index += 1) {
      reserveHttpAttempt({
        ledgerPath,
        lockPath: join(root, argv.campaignDir, "http-budget-ledger.lock"),
        campaignId: V1_CAMPAIGN_ID,
        limit: 10,
        purpose: "historical-brti",
        io: budgetIo,
      });
    }
    const calls: string[] = [];
    const summary = await runFollowUpBrtiCampaign({
      repoRoot: root,
      argv,
      io: { writeFile: () => undefined, mkdir: () => undefined },
      budgetIo,
      deps: {
        resolveCredentials: () => credentials,
        officialMetadata: BOUND_METADATA,
        httpDeps: {
          fetchImpl: (async () => {
            calls.push("fetch");
            return new Response("{}", { status: 200 });
          }) as unknown as typeof fetch,
        },
      },
    });
    expect(summary.httpRequestCount).toBe(10);
    expect(summary.history).toMatchObject({ attempted: false });
    expect(calls).toHaveLength(0);
    await expect(runFollowUpBrtiCampaign({
      repoRoot: root,
      argv: parseKalshiBrtiAccessProbeArgv([
        "--follow-up",
        "--skip-live",
        "--out-dir", outDir,
        "--raw-dir", join(root, "raw"),
        "--campaign-dir", "out",
      ]),
      io: { writeFile: () => undefined, mkdir: () => undefined },
      budgetIo,
      deps: {
        resolveCredentials: () => credentials,
        officialMetadata: BOUND_METADATA,
        httpDeps: {
          fetchImpl: (async () => {
            calls.push("fetch");
            return new Response("{}", { status: 200 });
          }) as unknown as typeof fetch,
        },
      },
    })).rejects.toThrow(/campaign-budget-exhausted: 10\/10/);
    expect(calls).toHaveLength(0);
  });

  it("keeps the cumulative campaign cap across resume and this follow-up", async () => {
    const root = mkdtempSync(join(tmpdir(), "brti-cap-"));
    writeSpentFixtures(root);
    const outDir = join(root, "out");
    const budgetIo = memoryBudgetIo();
    const ledgerPath = join(root, "out", "http-budget-ledger.json");
    loadOrCreateCampaignLedger({
      ledgerPath,
      campaignId: V1_CAMPAIGN_ID,
      limit: 10,
      io: budgetIo,
    });
    reserveHttpAttempt({
      ledgerPath,
      lockPath: join(root, "out", "lock"),
      campaignId: V1_CAMPAIGN_ID,
      limit: 10,
      purpose: "historical-brti",
      io: budgetIo,
    });
    reserveHttpAttempt({
      ledgerPath,
      lockPath: join(root, "out", "lock"),
      campaignId: V1_CAMPAIGN_ID,
      limit: 10,
      purpose: "official-settlement-metadata",
      io: budgetIo,
    });
    const summary = await runFollowUpBrtiCampaign({
      repoRoot: root,
      argv: parseKalshiBrtiAccessProbeArgv([
        "--follow-up",
        "--skip-live",
        "--out-dir", outDir,
        "--raw-dir", join(root, "raw"),
        "--campaign-dir", "out",
      ]),
      io: {
        writeFile: () => undefined,
        mkdir: () => undefined,
      },
      budgetIo,
      deps: {
        resolveCredentials: () => credentials,
        officialMetadata: BOUND_METADATA,
        httpDeps: {
          fetchImpl: (async () => new Response(JSON.stringify(emptyHistoryBody()), { status: 200 })) as unknown as typeof fetch,
        },
      },
    });
    expect(summary.httpRequestCount).toBe(3);
    expect(summary.thisTaskHttpAttempts).toBe(1);
    expect(summary.historyPayload).toMatchObject({ kind: "valid-empty-history" });
    expect(parseCampaignLedger(budgetIo.files.get(join(outDir, "http-budget-ledger.json"))!).consumed).toBe(3);
    expect(summary.httpRequestCount).toBeLessThanOrEqual(10);
  });

  it("retains the local response body without sensitive headers", () => {
    const writes = new Map<string, string>();
    retainLocalHttpResponse({
      io: {
        writeFile: (path, contents) => {
          writes.set(path, contents);
        },
        mkdir: () => undefined,
      },
      rawDir: "/tmp/raw",
      name: "historical-brti-hour",
      capturedAtUtc: "2026-09-24T04:00:00.000Z",
      result: {
        url: "https://example.test/trade-api/v2/cfbenchmarks/history/values?id=BRTI&timespan=HOUR",
        signPath: "/trade-api/v2/cfbenchmarks/history/values",
        status: 200,
        category: "success",
        body: emptyHistoryBody(),
        bodyTextHash: "abc",
        attempt: 1,
      },
      responseHeaders: {
        Authorization: "secret",
        Cookie: "session=1",
        "KALSHI-ACCESS-KEY": "key-id",
        "content-type": "application/json",
        "content-length": "12",
      },
    });
    const retained = writes.get("/tmp/raw/responses/historical-brti-hour.json");
    expect(retained).toContain("\"values\"");
    expect(retained).not.toMatch(/Authorization|Cookie|KALSHI-ACCESS|secret|key-id/);
    expect(sanitizeResponseHeaders({
      Authorization: "secret",
      "content-type": "application/json",
    })).toEqual({ "content-type": "application/json" });
  });

  it("does not dispatch a history request when official metadata is mismatched", async () => {
    const root = mkdtempSync(join(tmpdir(), "brti-mismatch-"));
    writeSpentFixtures(root);
    const calls: string[] = [];
    const summary = await runFollowUpBrtiCampaign({
      repoRoot: root,
      argv: parseKalshiBrtiAccessProbeArgv([
        "--follow-up",
        "--skip-live",
        "--out-dir", join(root, "out"),
        "--raw-dir", join(root, "raw"),
        "--campaign-dir", join(root, "out"),
      ]),
      io: { writeFile: () => undefined, mkdir: () => undefined },
      deps: {
        resolveCredentials: () => credentials,
        officialMetadata: { ...BOUND_METADATA, closeTimeUtc: "2026-09-21T18:15:00Z" },
        httpDeps: {
          fetchImpl: (async () => {
            calls.push("fetch");
            return new Response("{}", { status: 200 });
          }) as unknown as typeof fetch,
        },
      },
    });
    expect(calls).toHaveLength(0);
    expect(summary.officialMetadataBind.status).toBe("rejected");
    expect(summary.history).toMatchObject({ attempted: false });
  });
});

describe("filesystem campaign io lock still serializes follow-up reservations", () => {
  it("uses the persistent ledger as the dispatch authority", () => {
    const root = mkdtempSync(join(tmpdir(), "brti-fs-"));
    const io = createFilesystemCampaignBudgetIo();
    const ledgerPath = join(root, "http-budget-ledger.json");
    loadOrCreateCampaignLedger({
      ledgerPath,
      campaignId: V1_CAMPAIGN_ID,
      limit: 10,
      io,
    });
    expect(parseCampaignLedger(io.readFile(ledgerPath)!).consumed).toBe(0);
  });
});
