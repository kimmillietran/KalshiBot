import { describe, expect, it } from "vitest";

import { buildForwardCaptureReadinessReport } from "./buildForwardCaptureReadinessReport";
import { evaluateForwardCaptureReadiness } from "./evaluateForwardCaptureReadiness";
import { loadForwardCaptureRuns } from "./loadForwardCaptureRuns";
import { serializeForwardCaptureReadinessHtml } from "./serializeForwardCaptureReadinessHtml";
import { serializeForwardCaptureReadinessReport } from "./serializeForwardCaptureReadinessReport";
import {
  DEFAULT_FORWARD_CAPTURE_READINESS_INPUT_PATHS,
  DEFAULT_KALSHI_WS_SPIKE_CAPTURE_DIR,
} from "./forwardCaptureReadinessTypes";
import type { ForwardCaptureReadinessIo } from "./forwardCaptureReadinessTypes";

const GENERATED_AT = "2026-07-09T12:00:00.000Z";
const OUTPUT_PATH = "data/research-results/forward-capture-readiness.json";
const HTML_PATH = "data/reports/forward-capture-readiness.html";
const SPIKE_ROOT = DEFAULT_KALSHI_WS_SPIKE_CAPTURE_DIR;

function buildMemoryIo(files: Record<string, string>): ForwardCaptureReadinessIo {
  const normalizedFiles = Object.fromEntries(
    Object.entries(files).map(([path, content]) => [path.replace(/\\/g, "/"), content]),
  );
  const directories = new Set<string>();

  for (const path of Object.keys(normalizedFiles)) {
    const parts = path.split("/");
    for (let index = 1; index < parts.length; index += 1) {
      directories.add(parts.slice(0, index).join("/"));
    }
  }

  return {
    readFile: (path) => normalizedFiles[path.replace(/\\/g, "/")] ?? "",
    fileExists: (path) => {
      const normalized = path.replace(/\\/g, "/");
      return normalized in normalizedFiles || directories.has(normalized);
    },
    readdir: (path) => {
      const prefix = `${path.replace(/\\/g, "/").replace(/\/$/, "")}/`;
      const children = new Set<string>();
      for (const filePath of Object.keys(normalizedFiles)) {
        if (!filePath.startsWith(prefix)) {
          continue;
        }

        const remainder = filePath.slice(prefix.length);
        const child = remainder.split("/")[0];
        if (child) {
          children.add(child);
        }
      }

      return [...children];
    },
    isDirectory: (path) => directories.has(path.replace(/\\/g, "/")),
  };
}

function createTopOfBookLine(input: {
  runId: string;
  marketTicker?: string;
  receivedAtLocal: string;
  bookState?: string;
  yesSpreadCents?: number | null;
  withDepth?: boolean;
}) {
  return JSON.stringify({
    runId: input.runId,
    marketTicker: input.marketTicker ?? "KXBTC15M-26JUL091915-15",
    eventTicker: "KXBTC15M-26JUL091915",
    seriesTicker: "KXBTC15M",
    receivedAtLocal: input.receivedAtLocal,
    bookState: input.bookState ?? "valid",
    yesBestBidCents: 45,
    yesBestAskCents: input.yesSpreadCents === null ? null : 47,
    yesBestBidSize: input.withDepth ? 10 : null,
    yesBestAskSize: input.withDepth ? 12 : null,
    noBestBidCents: 53,
    noBestAskCents: 55,
    noBestBidSize: input.withDepth ? 8 : null,
    noBestAskSize: input.withDepth ? 9 : null,
    yesSpreadCents: input.yesSpreadCents ?? 2,
    noSpreadCents: 2,
    rawMessageType: "orderbook_snapshot",
  });
}

function createRunFiles(input: {
  runId: string;
  durationSeconds: number;
  generatedAt: string;
  topOfBookLines?: string[];
  btcSpotLines?: string[];
  verdict?: string;
  sequenceGapCount?: number;
}) {
  const runDir = `${SPIKE_ROOT}/${input.runId}`;
  const files: Record<string, string> = {
    [`${runDir}/capture-health.json`]: JSON.stringify({
      runId: input.runId,
      generatedAt: input.generatedAt,
      verdict: input.verdict ?? "capture-spike-success",
      config: {
        series: "KXBTC15M",
        durationSeconds: input.durationSeconds,
        maxMarkets: 1,
        dryRun: false,
      },
      marketDiscovery: {
        selectedMarketTickers: ["KXBTC15M-26JUL091915-15"],
      },
      capture: { messagesReceived: 3 },
      orderbook: {
        validTopOfBookRecords: input.topOfBookLines?.length ?? 1,
        sequenceGapCount: input.sequenceGapCount ?? 0,
        reconnectCount: 0,
        marketsWithValidBook: 1,
      },
      btcSpot: {
        status: input.btcSpotLines ? "enabled" : "disabled",
        recordsCaptured: input.btcSpotLines?.length ?? 0,
      },
    }),
  };

  if (input.topOfBookLines) {
    files[`${runDir}/top-of-book.jsonl`] = input.topOfBookLines.join("\n");
  }

  if (input.btcSpotLines) {
    files[`${runDir}/btc-spot.jsonl`] = input.btcSpotLines.join("\n");
  }

  files[`${runDir}/raw-messages.jsonl`] = '{"channel":"orderbook"}\n';

  return files;
}

describe("forwardCaptureReadiness", () => {
  it("returns not-ready-no-data when no runs exist", () => {
    const io = buildMemoryIo({});
    const runs = loadForwardCaptureRuns(io, DEFAULT_FORWARD_CAPTURE_READINESS_INPUT_PATHS);
    const evaluation = evaluateForwardCaptureReadiness(runs);

    expect(evaluation.summary.overallVerdict).toBe("not-ready-no-data");
    expect(evaluation.summary.recommendedNextAction).toBe("keep-capturing");
    expect(evaluation.aggregates.runCount).toBe(0);
  });

  it("marks a single short smoke run as not-ready-too-short", () => {
    const files = createRunFiles({
      runId: "2026-07-09T07-19-46-597Z",
      durationSeconds: 60,
      generatedAt: "2026-07-09T07:19:46.596Z",
      topOfBookLines: [
        createTopOfBookLine({
          runId: "2026-07-09T07-19-46-597Z",
          receivedAtLocal: "2026-07-09T07:19:47.965Z",
        }),
      ],
      btcSpotLines: [
        JSON.stringify({
          runId: "2026-07-09T07-19-46-597Z",
          receivedAtLocal: "2026-07-09T07:19:48.000Z",
          priceUsd: 100000,
        }),
      ],
    });
    const evaluation = evaluateForwardCaptureReadiness(
      loadForwardCaptureRuns(buildMemoryIo(files), DEFAULT_FORWARD_CAPTURE_READINESS_INPUT_PATHS),
    );

    expect(evaluation.summary.overallVerdict).toBe("not-ready-too-short");
    expect(evaluation.summary.recommendedNextAction).toBe("keep-capturing");
    expect(evaluation.summary.familyReadiness[0]?.verdict).toBe("not-ready-too-short");
  });

  it("marks gappy runs as not-ready-gappy for quote staleness", () => {
    const files = createRunFiles({
      runId: "gappy-run",
      durationSeconds: 13 * 60 * 60,
      generatedAt: "2026-07-09T08:00:00.000Z",
      topOfBookLines: [
        createTopOfBookLine({
          runId: "gappy-run",
          receivedAtLocal: "2026-07-09T08:00:00.000Z",
        }),
        createTopOfBookLine({
          runId: "gappy-run",
          receivedAtLocal: "2026-07-09T08:05:00.000Z",
        }),
      ],
      btcSpotLines: [
        JSON.stringify({
          runId: "gappy-run",
          receivedAtLocal: "2026-07-09T08:00:01.000Z",
          priceUsd: 100000,
        }),
      ],
    });

    const evaluation = evaluateForwardCaptureReadiness(
      loadForwardCaptureRuns(buildMemoryIo(files), DEFAULT_FORWARD_CAPTURE_READINESS_INPUT_PATHS),
    );
    const quoteStaleness = evaluation.summary.familyReadiness.find(
      (entry) => entry.familyId === "quoteStalenessReadiness",
    );

    expect(quoteStaleness?.verdict).toBe("not-ready-gappy");
  });

  it("marks missing BTC spot as lead-lag not-ready-no-btc-spot", () => {
    const files = createRunFiles({
      runId: "no-btc-run",
      durationSeconds: 25 * 60 * 60,
      generatedAt: "2026-07-09T08:00:00.000Z",
      topOfBookLines: [
        createTopOfBookLine({
          runId: "no-btc-run",
          receivedAtLocal: "2026-07-09T08:00:00.000Z",
          withDepth: true,
        }),
        createTopOfBookLine({
          runId: "no-btc-run",
          receivedAtLocal: "2026-07-09T08:00:02.000Z",
          withDepth: true,
        }),
      ],
    });

    const evaluation = evaluateForwardCaptureReadiness(
      loadForwardCaptureRuns(buildMemoryIo(files), DEFAULT_FORWARD_CAPTURE_READINESS_INPUT_PATHS),
    );
    const leadLag = evaluation.summary.familyReadiness.find(
      (entry) => entry.familyId === "leadLagReadiness",
    );

    expect(leadLag?.verdict).toBe("not-ready-no-btc-spot");
  });

  it("marks valid 24h synthetic capture as lead-lag ready", () => {
    const files = {
      ...createRunFiles({
        runId: "day-1",
        durationSeconds: 8 * 60 * 60,
        generatedAt: "2026-07-07T08:00:00.000Z",
        topOfBookLines: [
          createTopOfBookLine({
            runId: "day-1",
            receivedAtLocal: "2026-07-07T08:00:00.000Z",
            withDepth: true,
          }),
          createTopOfBookLine({
            runId: "day-1",
            receivedAtLocal: "2026-07-07T08:00:02.000Z",
            withDepth: true,
          }),
        ],
        btcSpotLines: [
          JSON.stringify({
            runId: "day-1",
            receivedAtLocal: "2026-07-07T08:00:01.000Z",
            priceUsd: 100000,
          }),
          JSON.stringify({
            runId: "day-1",
            receivedAtLocal: "2026-07-07T08:00:03.000Z",
            priceUsd: 100001,
          }),
        ],
      }),
      ...createRunFiles({
        runId: "day-2",
        durationSeconds: 8 * 60 * 60,
        generatedAt: "2026-07-08T08:00:00.000Z",
        topOfBookLines: [
          createTopOfBookLine({
            runId: "day-2",
            receivedAtLocal: "2026-07-08T08:00:00.000Z",
            withDepth: true,
          }),
        ],
        btcSpotLines: [
          JSON.stringify({
            runId: "day-2",
            receivedAtLocal: "2026-07-08T08:00:01.000Z",
            priceUsd: 100000,
          }),
        ],
      }),
      ...createRunFiles({
        runId: "day-3",
        durationSeconds: 8 * 60 * 60,
        generatedAt: "2026-07-09T08:00:00.000Z",
        topOfBookLines: [
          createTopOfBookLine({
            runId: "day-3",
            receivedAtLocal: "2026-07-09T08:00:00.000Z",
            withDepth: true,
          }),
        ],
        btcSpotLines: [
          JSON.stringify({
            runId: "day-3",
            receivedAtLocal: "2026-07-09T08:00:01.000Z",
            priceUsd: 100000,
          }),
        ],
      }),
    };

    const evaluation = evaluateForwardCaptureReadiness(
      loadForwardCaptureRuns(buildMemoryIo(files), DEFAULT_FORWARD_CAPTURE_READINESS_INPUT_PATHS),
    );
    const leadLag = evaluation.summary.familyReadiness.find(
      (entry) => entry.familyId === "leadLagReadiness",
    );

    expect(leadLag?.verdict).toBe("ready");
    expect(evaluation.summary.overallVerdict).toBe("ready-for-first-lead-lag-diagnostic");
  });

  it("marks valid real-book synthetic capture as parity ready", () => {
    const files = createRunFiles({
      runId: "parity-run",
      durationSeconds: 60,
      generatedAt: "2026-07-09T08:00:00.000Z",
      topOfBookLines: [
        createTopOfBookLine({
          runId: "parity-run",
          receivedAtLocal: "2026-07-09T08:00:00.000Z",
          withDepth: true,
        }),
      ],
    });

    const evaluation = evaluateForwardCaptureReadiness(
      loadForwardCaptureRuns(buildMemoryIo(files), DEFAULT_FORWARD_CAPTURE_READINESS_INPUT_PATHS),
    );
    const parity = evaluation.summary.familyReadiness.find(
      (entry) => entry.familyId === "sameMarketParityReadiness",
    );

    expect(parity?.verdict).toBe("ready");
  });

  it("recognizes bid-only parity readiness separately from complement parity", () => {
    const files = createRunFiles({
      runId: "bid-only-ready-run",
      durationSeconds: 60,
      generatedAt: "2026-07-09T08:00:00.000Z",
      topOfBookLines: [
        createTopOfBookLine({
          runId: "bid-only-ready-run",
          receivedAtLocal: "2026-07-09T08:00:00.000Z",
          withDepth: true,
        }),
      ],
    });

    const evaluation = evaluateForwardCaptureReadiness(
      loadForwardCaptureRuns(buildMemoryIo(files), DEFAULT_FORWARD_CAPTURE_READINESS_INPUT_PATHS),
    );
    const bidOnly = evaluation.summary.familyReadiness.find(
      (entry) => entry.familyId === "bidOnlyParityReadiness",
    );

    expect(bidOnly?.verdict).toBe("ready");
    expect(bidOnly?.rationale).toContain("Bid-only");
  });

  it("aggregates by day and runId", () => {
    const files = {
      ...createRunFiles({
        runId: "day-1",
        durationSeconds: 3600,
        generatedAt: "2026-07-07T08:00:00.000Z",
        topOfBookLines: [
          createTopOfBookLine({
            runId: "day-1",
            receivedAtLocal: "2026-07-07T08:00:00.000Z",
          }),
        ],
      }),
      ...createRunFiles({
        runId: "day-2",
        durationSeconds: 3600,
        generatedAt: "2026-07-08T08:00:00.000Z",
        topOfBookLines: [
          createTopOfBookLine({
            runId: "day-2",
            receivedAtLocal: "2026-07-08T08:00:00.000Z",
          }),
        ],
      }),
    };

    const evaluation = evaluateForwardCaptureReadiness(
      loadForwardCaptureRuns(buildMemoryIo(files), DEFAULT_FORWARD_CAPTURE_READINESS_INPUT_PATHS),
    );

    expect(evaluation.byRunId).toHaveLength(2);
    expect(evaluation.byDate.length).toBeGreaterThanOrEqual(2);
  });

  it("serializes deterministic JSON and HTML with per-family readiness", () => {
    const report = buildForwardCaptureReadinessReport({
      generatedAt: GENERATED_AT,
      outputPath: OUTPUT_PATH,
      htmlOutputPath: HTML_PATH,
      inputPaths: DEFAULT_FORWARD_CAPTURE_READINESS_INPUT_PATHS,
      io: buildMemoryIo(
        createRunFiles({
          runId: "smoke-run",
          durationSeconds: 60,
          generatedAt: "2026-07-09T07:19:46.596Z",
          topOfBookLines: [
            createTopOfBookLine({
              runId: "smoke-run",
              receivedAtLocal: "2026-07-09T07:19:47.965Z",
            }),
          ],
        }),
      ),
    });

    const json = serializeForwardCaptureReadinessReport(report);
    const html = serializeForwardCaptureReadinessHtml(report);

    expect(json).toBe(serializeForwardCaptureReadinessReport(report));
    expect(html).toBe(serializeForwardCaptureReadinessHtml(report));
    expect(json).toContain('"overallVerdict":"not-ready-too-short"');
    expect(html).toContain("leadLagReadiness");
    expect(html).toContain("keep-capturing");
  });

  it("handles large synthetic top-of-book runs without stack overflow", () => {
    const runId = "large-unthrottled-run";
    const runDir = `${SPIKE_ROOT}/${runId}`;
    const lines = Array.from({ length: 160_000 }, (_, index) =>
      createTopOfBookLine({
        runId,
        receivedAtLocal: new Date(Date.UTC(2026, 6, 9, 8, 0, index % 60)).toISOString(),
        withDepth: true,
      }),
    );

    const files: Record<string, string> = {
      [`${runDir}/capture-health.json`]: JSON.stringify({
        runId,
        generatedAt: "2026-07-09T08:00:00.000Z",
        startedAt: "2026-07-09T08:00:00.000Z",
        endedAt: "2026-07-09T18:00:00.000Z",
        verdict: "capture-mvp-success",
        config: {
          series: "KXBTC15M",
          durationMinutes: 600,
          maxMarkets: 1,
          dryRun: false,
        },
        marketDiscovery: {
          selectedMarketTickers: ["KXBTC15M-26JUL091915-15"],
        },
        capture: {
          rawMessageCount: 162_793,
          topOfBookRecordCount: 160_000,
        },
        orderbook: {
          validTopOfBookRecords: 160_000,
          sequenceGapCount: 0,
          reconnectCount: 0,
          marketsWithValidBook: 1,
        },
        btcSpot: {
          status: "enabled",
          recordsCaptured: 120,
        },
      }),
      [`${runDir}/top-of-book.jsonl`]: lines.join("\n"),
      [`${runDir}/btc-spot.jsonl`]: JSON.stringify({
        runId,
        receivedAtLocal: "2026-07-09T08:00:01.000Z",
        priceUsd: 100000,
      }),
    };

    const evaluation = evaluateForwardCaptureReadiness(
      loadForwardCaptureRuns(buildMemoryIo(files), DEFAULT_FORWARD_CAPTURE_READINESS_INPUT_PATHS),
    );

    expect(evaluation.aggregates.topOfBookRecordCount).toBe(160_000);
    expect(evaluation.aggregates.runCount).toBe(1);
    expect(evaluation.summary.overallVerdict).not.toBe("not-ready-no-data");
  });

  it("evaluates only the selected run in selected-run mode", () => {
    const eligibleRun = createRunFiles({
      runId: "eligible-run",
      durationSeconds: 600,
      generatedAt: "2026-07-09T08:00:00.000Z",
      verdict: "capture-mvp-success",
    });
    const mockRun = createRunFiles({
      runId: "mock-run",
      durationSeconds: 600,
      generatedAt: "2026-07-09T08:00:00.000Z",
      verdict: "capture-mvp-success",
      topOfBookLines: [
        createTopOfBookLine({
          runId: "mock-run",
          marketTicker: "KXBTC15M-MOCK-15",
          receivedAtLocal: "2026-07-09T08:00:00.000Z",
        }),
      ],
    });

    const brokenSibling = {
      [`${SPIKE_ROOT}/broken-run/capture-health.json`]: "not-json",
    };

    const report = buildForwardCaptureReadinessReport({
      generatedAt: GENERATED_AT,
      outputPath: OUTPUT_PATH,
      htmlOutputPath: HTML_PATH,
      inputPaths: {
        ...DEFAULT_FORWARD_CAPTURE_READINESS_INPUT_PATHS,
        captureRunDir: `${SPIKE_ROOT}/eligible-run`,
      },
      io: buildMemoryIo({ ...eligibleRun, ...mockRun, ...brokenSibling }),
    });

    expect(report.analysisScope).toBe("selected-run");
    expect(report.sourceRunIds).toEqual(["eligible-run"]);
    expect(report.aggregates.runCount).toBe(1);
    expect(report.sequenceGapSemantics?.length).toBeGreaterThan(0);
    expect(report.warnings.some((warning) => warning.includes("broken-run"))).toBe(false);
  });

  it("excludes mock runs in aggregate mode", () => {
    const eligibleRun = createRunFiles({
      runId: "eligible-run",
      durationSeconds: 600,
      generatedAt: "2026-07-09T08:00:00.000Z",
      verdict: "capture-mvp-success",
    });
    const mockRun = createRunFiles({
      runId: "mock-run",
      durationSeconds: 600,
      generatedAt: "2026-07-09T08:00:00.000Z",
      verdict: "capture-mvp-success",
      topOfBookLines: [
        createTopOfBookLine({
          runId: "mock-run",
          marketTicker: "KXBTC15M-MOCK-15",
          receivedAtLocal: "2026-07-09T08:00:00.000Z",
        }),
      ],
    });

    const report = buildForwardCaptureReadinessReport({
      generatedAt: GENERATED_AT,
      outputPath: OUTPUT_PATH,
      htmlOutputPath: HTML_PATH,
      inputPaths: DEFAULT_FORWARD_CAPTURE_READINESS_INPUT_PATHS,
      io: buildMemoryIo({ ...eligibleRun, ...mockRun }),
    });

    expect(report.analysisScope).toBe("aggregate");
    expect(report.excludedRuns?.some((entry) => entry.runId === "mock-run")).toBe(true);
    expect(report.aggregates.runCount).toBe(1);
  });
});
