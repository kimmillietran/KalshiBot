import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { classifyHttpStatus } from "./classifyHttpError";
import {
  assertHistoryUrlIsBounded,
  buildCfbHistoryMinuteUrl,
  plannedHistoryMinutesForClose,
} from "./cfbEndpoints";
import {
  extractHistoryObservations,
  inspectCadence,
  reconstructOfficialAverageIfSupported,
} from "./inspectHistoryPayload";
import { parseKalshiBrtiAccessProbeArgv } from "./parseArgv";
import { parseOfficialNumericString } from "./parseOfficialNumericString";
import { runKalshiBrtiAccessProbe } from "./runKalshiBrtiAccessProbe";
import { summarizeLiveMessage } from "./runLiveCfbProbe";
import { signedKalshiGet } from "./signedKalshiGet";
import {
  selectEarlyMiddleLateDays,
  selectSpentTargets,
} from "./selectSpentTargets";
import { KalshiBrtiAccessProbeError } from "./types";

const PEM = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey
  .export({ type: "pkcs1", format: "pem" })
  .toString();

describe("kalshiBrtiAccessProbe", () => {
  it("selects early/middle/late SPENT days before any BRTI values", () => {
    const days = [
      "2026-08-14", "2026-08-15", "2026-08-16", "2026-08-17", "2026-08-18",
      "2026-08-19", "2026-08-20", "2026-08-21", "2026-08-22", "2026-08-23",
      "2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28",
      "2026-08-29", "2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02",
      "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06", "2026-09-07",
      "2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13", "2026-09-15",
      "2026-09-16", "2026-09-17", "2026-09-19", "2026-09-21",
    ];
    expect(selectEarlyMiddleLateDays(days)).toEqual({
      early: "2026-08-14",
      middle: "2026-08-30",
      late: "2026-09-21",
    });
    const targets = selectSpentTargets({
      eligibleUtcDays: days,
      tickersByUtcDay: new Map([
        ["2026-08-14", ["KXBTC15M-26AUG140315-15", "KXBTC15M-26AUG141430-30"]],
        ["2026-08-30", ["KXBTC15M-26AUG301415-15"]],
        ["2026-09-21", ["KXBTC15M-26SEP211415-15"]],
      ]),
    });
    expect(targets.map((target) => target.marketTicker)).toEqual([
      "KXBTC15M-26AUG141430-30",
      "KXBTC15M-26AUG301415-15",
      "KXBTC15M-26SEP211415-15",
    ]);
  });

  it("parses official numeric strings and rejects ambiguous formats", () => {
    expect(parseOfficialNumericString("79604.96")).toEqual({
      kind: "ok",
      original: "79604.96",
      value: 79604.96,
      usedThousandsSeparators: false,
    });
    expect(parseOfficialNumericString("79,604.96")).toMatchObject({
      kind: "ok",
      value: 79604.96,
      usedThousandsSeparators: true,
    });
    expect(parseOfficialNumericString("79.604,96").kind).toBe("rejected");
    expect(parseOfficialNumericString("").kind).toBe("empty");
  });

  it("refuses HOUR/DAY history and keeps plans at two minutes", () => {
    const minutes = plannedHistoryMinutesForClose("2026-08-14T18:30:00.000Z");
    expect(minutes).toEqual([
      "2026-08-14T18:29:00.000Z",
      "2026-08-14T18:30:00.000Z",
    ]);
    const built = buildCfbHistoryMinuteUrl({ minuteStartUtc: minutes[0]! });
    expect(built.timespan).toBe("MINUTE");
    expect(() => assertHistoryUrlIsBounded(built.url.replace("MINUTE", "HOUR"))).toThrow(
      /unbounded|timespan/,
    );
  });

  it("classifies HTTP failures without treating 404 as entitlement", () => {
    expect(classifyHttpStatus(401, {})).toBe("authentication-failure");
    expect(classifyHttpStatus(403, {})).toBe("entitlement-denial");
    expect(classifyHttpStatus(404, {})).toBe("not-found");
    expect(classifyHttpStatus(400, {})).toBe("invalid-parameters");
    expect(classifyHttpStatus(429, {})).toBe("rate-limited");
    expect(classifyHttpStatus(503, {})).toBe("upstream-or-transient");
    expect(classifyHttpStatus(200, { data: { payload: { values: [1] } } })).toBe("success");
  });

  it("distinguishes raw 5Hz ticks from a supported 60x1s settlement mapping", () => {
    const close = Date.parse("2026-08-14T18:30:00.000Z");
    const fiveHz = Array.from({ length: 300 }, (_, index) => ({
      timeRaw: close - 60_000 + (index + 1) * 200,
      timeMs: close - 60_000 + (index + 1) * 200,
      valueRaw: "100.00",
      value: 100,
    }));
    const fiveHzMapping = reconstructOfficialAverageIfSupported({
      observations: fiveHz,
      closeTimeMs: close,
      officialExpirationRaw: "100.00",
    });
    expect(fiveHzMapping.mapping.supported).toBe(false);
    expect(fiveHzMapping.reconstructedAverage).toBeNull();

    const oneHz = Array.from({ length: 60 }, (_, index) => ({
      timeRaw: close - 59_000 + index * 1000,
      timeMs: close - 59_000 + index * 1000,
      valueRaw: "100.25",
      value: 100.25,
    }));
    const oneHzMapping = reconstructOfficialAverageIfSupported({
      observations: oneHz,
      closeTimeMs: close,
      officialExpirationRaw: "100.25",
    });
    expect(oneHzMapping.mapping.supported).toBe(true);
    expect(oneHzMapping.agreement).toBe("agree");

    const cadence = inspectCadence(fiveHz);
    expect(cadence.looksFiveHz).toBe(true);
    expect(extractHistoryObservations({
      data: { payload: { values: [{ time: "2026-08-14T18:29:01.000Z", value: "1.5" }] } },
    })).toHaveLength(1);
    expect(extractHistoryObservations({ data: { payload: { values: [] } } })).toEqual([]);
    expect(extractHistoryObservations({
      data: { payload: { values: [{ time: null, value: "1.5" }] } },
    })).toEqual([{ timeRaw: null, timeMs: null, valueRaw: "1.5", value: 1.5 }]);
    expect(reconstructOfficialAverageIfSupported({
      observations: [],
      closeTimeMs: close,
      officialExpirationRaw: "100.00",
    })).toMatchObject({
      mapping: { supported: false, reason: "no-observations-in-official-window" },
      reconstructedAverage: null,
      agreement: "not-compared",
    });
  });

  it("enforces request budget and retries without leaking secrets", async () => {
    const calls: string[] = [];
    const fetchImpl = async () => {
      calls.push("fetch");
      return new Response(JSON.stringify({ error: "temporarily unavailable" }), { status: 503 });
    };
    const budget = { remaining: 3 };
    const result = await signedKalshiGet({
      url: "https://example.test/trade-api/v2/cfbenchmarks/values?id=BRTI",
      signPath: "/trade-api/v2/cfbenchmarks/values",
      credentials: {
        status: "available",
        apiKeyId: "key-id",
        apiBaseUrl: null,
        wsUrl: null,
        privateKeyMaterial: {
          status: "loaded",
          source: "raw-env",
          privateKeyPem: PEM,
          privateKeyLoaded: true,
          privateKeyFingerprint: "abc",
          warnings: [],
          error: null,
        },
        privateKeySource: "raw-env",
        privateKeyLoaded: true,
        privateKeyFingerprint: "abc",
        keyIdPresent: true,
        warnings: [],
        error: null,
      },
      budget,
      maxRetries: 1,
      deps: { fetchImpl: fetchImpl as unknown as typeof fetch },
    });
    expect(calls).toHaveLength(2);
    expect(budget.remaining).toBe(1);
    expect(result.category).toBe("upstream-or-transient");
    expect(JSON.stringify(result)).not.toMatch(/BEGIN|KALSHI-ACCESS|key-id/);
  });

  it("rejects unimplemented --skip-fetch and isolates output", async () => {
    expect(() => parseKalshiBrtiAccessProbeArgv(["--skip-fetch"])).toThrow(KalshiBrtiAccessProbeError);
    expect(parseKalshiBrtiAccessProbeArgv(["--fixture", "--out-dir", "/tmp/a"]).fixture).toBe(true);
    expect(parseKalshiBrtiAccessProbeArgv(["--skip-latest"]).skipLatest).toBe(true);

    const root = mkdtempSync(join(tmpdir(), "brti-probe-"));
    const audit = join(root, "data/research-results/external-kalshi-data-audit");
    mkdirSync(join(audit, "m17-prep-settlement-friction-coverage"), { recursive: true });
    mkdirSync(join(audit, "m17-prep-settlement-friction-label-coverage"), { recursive: true });
    writeFileSync(join(audit, "m17-prep-settlement-friction-coverage/settlement-friction-coverage-manifest.json"), JSON.stringify({
      calendar: { eligibleUtcDays: ["2026-08-14", "2026-08-30", "2026-09-21"] },
    }));
    writeFileSync(join(audit, "m16-er-blind-incidence.json"), JSON.stringify({
      days: [
        { utcDate: "2026-08-14", confirmations: [{ ticker: "KXBTC15M-26AUG141430-30", utcDayKey: "2026-08-14" }] },
        { utcDate: "2026-08-30", confirmations: [{ ticker: "KXBTC15M-26AUG301415-15", utcDayKey: "2026-08-30" }] },
        { utcDate: "2026-09-21", confirmations: [{ ticker: "KXBTC15M-26SEP211415-15", utcDayKey: "2026-09-21" }] },
      ],
    }));
    writeFileSync(join(audit, "m17-prep-settlement-friction-label-coverage/incomplete-records.json"), JSON.stringify({
      records: [{ marketTicker: "KXBTC15M-26AUG140315-15", missingOrInvalidFields: ["floorStrike"] }],
    }));
    const writes = new Map<string, string>();
    const summary = await runKalshiBrtiAccessProbe({
      repoRoot: root,
      argv: parseKalshiBrtiAccessProbeArgv(["--fixture", "--out-dir", join(root, "out"), "--raw-dir", join(root, "raw")]),
      io: {
        writeFile: (path, contents) => {
          writes.set(path, contents);
        },
        mkdir: () => undefined,
      },
      deps: {
        resolveCredentials: () => ({
          status: "missing",
          apiKeyId: null,
          apiBaseUrl: null,
          wsUrl: null,
          privateKeyMaterial: {
            status: "missing",
            source: "missing",
            privateKeyPem: null,
            privateKeyLoaded: false,
            privateKeyFingerprint: null,
            warnings: [],
            error: null,
          },
          privateKeySource: "missing",
          privateKeyLoaded: false,
          privateKeyFingerprint: null,
          keyIdPresent: false,
          warnings: [],
          error: null,
        }),
      },
    });
    expect(summary.httpRequestCount).toBe(0);
    expect([...writes.keys()].every((path) => path.startsWith(join(root, "out")) || path.startsWith(join(root, "raw")))).toBe(true);
    expect(JSON.stringify(summary)).not.toMatch(/BEGIN PRIVATE KEY|KALSHI-ACCESS/);
  });

  it("keeps live local vs provider timestamps distinct", () => {
    const summary = summarizeLiveMessage(JSON.stringify({
      type: "cfbenchmarks_value",
      msg: {
        index_id: "BRTI",
        received_at: 1000,
        last_60s_windowed_average_15min: { value: "1.0", window_size: 1 },
        avg_60s_data: { value: "1.0", window_size: 1 },
        data: "{}",
      },
    }), 2000);
    expect(summary.localReceivedAtMs).toBe(2000);
    expect(summary.providerReceivedAtMs).toBe(1000);
    expect(summary.hasLast60sWindowedAverage15min).toBe(true);
  });
});

describe("plannedHistoryMinutesForClose exact minutes", () => {
  it("uses close minute plus preceding minute only", () => {
    expect(plannedHistoryMinutesForClose("2026-08-30T18:15:00.000Z")).toEqual([
      "2026-08-30T18:14:00.000Z",
      "2026-08-30T18:15:00.000Z",
    ]);
  });
});
