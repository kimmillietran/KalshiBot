import { describe, expect, it } from "vitest";

import { classifyBidOnlyParitySnapshot } from "./classifyBidOnlyParitySnapshot";
import { classifyParitySnapshot } from "./classifyParitySnapshot";
import { buildStaticParityScanReport } from "./buildStaticParityScanReport";
import {
  parseStaticParityScanFrictionFromArgv,
  parseStaticParityScanPathsFromArgv,
} from "./parseStaticParityScanArgv";
import { scanForwardCaptureParity } from "./scanForwardCaptureParity";
import { serializeStaticParityScanHtml } from "./serializeStaticParityScanHtml";
import { serializeStaticParityScanReport } from "./serializeStaticParityScanReport";
import {
  DEFAULT_STATIC_PARITY_FRICTION_CONFIG,
  DEFAULT_STATIC_PARITY_SCAN_INPUT_PATHS,
  type StaticParityFrictionConfig,
  type StaticParityScanIo,
} from "./staticParityScanTypes";

const BID_ONLY_FRICTION: StaticParityFrictionConfig = {
  ...DEFAULT_STATIC_PARITY_FRICTION_CONFIG,
  pricingModel: "bid-only",
};

const COMPLEMENT_FRICTION: StaticParityFrictionConfig = {
  ...DEFAULT_STATIC_PARITY_FRICTION_CONFIG,
  pricingModel: "complement-derived",
  requireBothSidesPresent: true,
};

const INPUT_DIR = "data/live-capture/forward-quotes";

function buildMemoryIo(files: Record<string, string>): StaticParityScanIo {
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
  receivedAtLocal: string;
  yesBid?: number | null;
  yesAsk?: number | null;
  noBid?: number | null;
  noAsk?: number | null;
  yesBidSize?: number | null;
  yesAskSize?: number | null;
  noBidSize?: number | null;
  noAskSize?: number | null;
  bookState?: string;
  isParityUsable?: boolean;
  economicBookState?: string;
}) {
  return JSON.stringify({
    runId: input.runId,
    marketTicker: "KXBTC15M-TEST",
    eventTicker: "KXBTC15M-EVENT",
    receivedAtLocal: input.receivedAtLocal,
    bookState: input.bookState ?? "valid",
    yesBestBidCents: input.yesBid ?? 45,
    yesBestAskCents: input.yesAsk ?? 47,
    yesBestBidSize: input.yesBidSize ?? 10,
    yesBestAskSize: input.yesAskSize ?? 10,
    noBestBidCents: input.noBid ?? 53,
    noBestAskCents: input.noAsk ?? 55,
    noBestBidSize: input.noBidSize ?? 10,
    noBestAskSize: input.noAskSize ?? 10,
    ...(input.isParityUsable !== undefined ? { isParityUsable: input.isParityUsable } : {}),
    ...(input.economicBookState !== undefined
      ? { economicBookState: input.economicBookState }
      : {}),
  });
}

function createRunFiles(input: {
  runId: string;
  topOfBookLines: string[];
}) {
  const runDir = `${INPUT_DIR}/${input.runId}`;
  return {
    [`${runDir}/capture-health.json`]: JSON.stringify({
      runId: input.runId,
      verdict: "capture-mvp-success",
      capture: { topOfBookRecordCount: input.topOfBookLines.length },
    }),
    [`${runDir}/top-of-book.jsonl`]: input.topOfBookLines.join("\n"),
  };
}

describe("classifyBidOnlyParitySnapshot", () => {
  it("classifies bid-only no-signal when bid sum <= 100", () => {
    const result = classifyBidOnlyParitySnapshot(
      {
        yesBidCents: 45,
        noBidCents: 53,
        yesBestBidSize: 10,
        noBestBidSize: 10,
        bookState: "valid",
      },
      BID_ONLY_FRICTION,
    );

    expect(result.classification).toBe("bid-only-no-signal");
    expect(result.bidSumCents).toBe(98);
  });

  it("classifies bid-only gross candidate when yesBid + noBid > 100", () => {
    const result = classifyBidOnlyParitySnapshot(
      {
        yesBidCents: 55,
        noBidCents: 55,
        yesBestBidSize: 10,
        noBestBidSize: 10,
        bookState: "valid",
      },
      { ...BID_ONLY_FRICTION, feeBufferCents: 20 },
    );

    expect(result.classification).toBe("bid-only-gross-candidate");
    expect(result.bidOnlyEdgeCents).toBe(10);
    expect(result.requiresExecutableConfirmation).toBe(true);
  });

  it("classifies bid-only buffer-adjusted candidate", () => {
    const result = classifyBidOnlyParitySnapshot(
      {
        yesBidCents: 55,
        noBidCents: 55,
        yesBestBidSize: 10,
        noBestBidSize: 10,
        bookState: "valid",
      },
      { ...BID_ONLY_FRICTION, feeBufferCents: 2, minBidOnlyEdgeCents: 2 },
    );

    expect(result.classification).toBe("bid-only-buffer-adjusted-candidate");
    expect(result.estimatedNetEdgeCents).toBeGreaterThanOrEqual(2);
  });

  it("classifies candidate below fee buffer as watch", () => {
    const result = classifyBidOnlyParitySnapshot(
      {
        yesBidCents: 50,
        noBidCents: 51,
        yesBestBidSize: 10,
        noBestBidSize: 10,
        bookState: "valid",
      },
      BID_ONLY_FRICTION,
    );

    expect(result.classification).toBe("bid-only-watch");
    expect(result.isGrossCandidate).toBe(false);
    expect(result.isBufferAdjustedCandidate).toBe(false);
  });

  it("classifies missing YES bid as insufficient depth", () => {
    const result = classifyBidOnlyParitySnapshot(
      {
        yesBidCents: null,
        noBidCents: 53,
        yesBestBidSize: null,
        noBestBidSize: 10,
        bookState: "valid",
      },
      BID_ONLY_FRICTION,
    );

    expect(result.classification).toBe("bid-only-insufficient-depth");
  });

  it("classifies missing NO bid as insufficient depth", () => {
    const result = classifyBidOnlyParitySnapshot(
      {
        yesBidCents: 45,
        noBidCents: null,
        yesBestBidSize: 10,
        noBestBidSize: null,
        bookState: "valid",
      },
      BID_ONLY_FRICTION,
    );

    expect(result.classification).toBe("bid-only-insufficient-depth");
  });

  it("classifies invalid price as bid-only-invalid-price", () => {
    const result = classifyBidOnlyParitySnapshot(
      {
        yesBidCents: 150,
        noBidCents: 53,
        yesBestBidSize: 10,
        noBestBidSize: 10,
        bookState: "valid",
      },
      BID_ONLY_FRICTION,
    );

    expect(result.classification).toBe("bid-only-invalid-price");
  });
});

describe("classifyParitySnapshot (complement-derived legacy)", () => {
  it("classifies normal no-signal parity state", () => {
    const result = classifyParitySnapshot(
      {
        yesBidCents: 45,
        yesAskCents: 47,
        noBidCents: 53,
        noAskCents: 55,
        yesBestBidSize: 10,
        yesBestAskSize: 10,
        noBestBidSize: 10,
        noBestAskSize: 10,
        bookState: "valid",
      },
      COMPLEMENT_FRICTION,
    );

    expect(result.classification).toBe("no-signal");
  });

  it("classifies YES ask + NO ask < 100 as gross candidate in complement mode", () => {
    const result = classifyParitySnapshot(
      {
        yesBidCents: 40,
        yesAskCents: 45,
        noBidCents: 40,
        noAskCents: 45,
        yesBestBidSize: 10,
        yesBestAskSize: 10,
        noBestBidSize: 10,
        noBestAskSize: 10,
        bookState: "valid",
      },
      { ...COMPLEMENT_FRICTION, feeBufferCents: 20 },
    );

    expect(result.classification).toBe("gross-parity-candidate");
    expect(result.grossEdgeCents).toBe(10);
  });
});

describe("scanForwardCaptureParity", () => {
  it("scans only the selected run when captureRunDir is provided", () => {
    const runAFiles = createRunFiles({
      runId: "run-a",
      topOfBookLines: [
        createTopOfBookLine({
          runId: "run-a",
          receivedAtLocal: "2026-07-09T08:00:00.000Z",
        }),
      ],
    });
    const runBFiles = createRunFiles({
      runId: "run-b",
      topOfBookLines: [
        createTopOfBookLine({
          runId: "run-b",
          receivedAtLocal: "2026-07-09T08:01:00.000Z",
          yesBid: 55,
          noBid: 55,
        }),
      ],
    });

    const result = scanForwardCaptureParity({
      io: buildMemoryIo({ ...runAFiles, ...runBFiles }),
      forwardQuotesDir: INPUT_DIR,
      captureRunDir: `${INPUT_DIR}/run-a`,
      friction: { ...BID_ONLY_FRICTION, feeBufferCents: 20 },
    });

    expect(result.metrics.runCountScanned).toBe(1);
    expect(result.runs).toHaveLength(1);
    expect(result.runs[0]?.runId).toBe("run-a");
  });

  it("defaults to bid-only and finds gross candidates from bid sum > 100", () => {
    const files = createRunFiles({
      runId: "bid-only-run",
      topOfBookLines: [
        createTopOfBookLine({
          runId: "bid-only-run",
          receivedAtLocal: "2026-07-09T08:00:00.000Z",
          yesBid: 55,
          noBid: 55,
          isParityUsable: false,
          economicBookState: "crossed-yes-book",
        }),
      ],
    });

    const result = scanForwardCaptureParity({
      io: buildMemoryIo(files),
      forwardQuotesDir: INPUT_DIR,
      friction: { ...BID_ONLY_FRICTION, feeBufferCents: 20 },
    });

    expect(result.metrics.pricingModel).toBe("bid-only");
    expect(result.metrics.bidOnlyGrossCandidateCount).toBe(1);
    expect(result.candidateSamples[0]?.bidSumCents).toBe(110);
    expect(result.candidateSamples[0]?.requiresExecutableConfirmation).toBe(true);
  });

  it("aggregates multiple runs correctly in bid-only mode", () => {
    const files = {
      ...createRunFiles({
        runId: "run-a",
        topOfBookLines: [
          createTopOfBookLine({
            runId: "run-a",
            receivedAtLocal: "2026-07-09T08:00:00.000Z",
          }),
        ],
      }),
      ...createRunFiles({
        runId: "run-b",
        topOfBookLines: [
          createTopOfBookLine({
            runId: "run-b",
            receivedAtLocal: "2026-07-09T08:01:00.000Z",
            yesBid: 55,
            noBid: 55,
          }),
        ],
      }),
    };

    const result = scanForwardCaptureParity({
      io: buildMemoryIo(files),
      forwardQuotesDir: INPUT_DIR,
      friction: { ...BID_ONLY_FRICTION, feeBufferCents: 20 },
    });

    expect(result.metrics.runCountScanned).toBe(2);
    expect(result.metrics.bidOnlyGrossCandidateCount).toBe(1);
  });

  it("legacy complement mode still works when explicitly selected", () => {
    const files = createRunFiles({
      runId: "complement-run",
      topOfBookLines: [
        createTopOfBookLine({
          runId: "complement-run",
          receivedAtLocal: "2026-07-09T08:00:00.000Z",
          yesAsk: 45,
          noAsk: 45,
          yesBid: 40,
          noBid: 40,
        }),
      ],
    });

    const result = scanForwardCaptureParity({
      io: buildMemoryIo(files),
      forwardQuotesDir: INPUT_DIR,
      friction: { ...COMPLEMENT_FRICTION, feeBufferCents: 20 },
    });

    expect(result.metrics.pricingModel).toBe("complement-derived");
    expect(result.metrics.grossParityCandidateCount).toBe(1);
  });

  it("skips malformed JSONL lines with warning counts", () => {
    const files = createRunFiles({
      runId: "malformed-run",
      topOfBookLines: [
        createTopOfBookLine({
          runId: "malformed-run",
          receivedAtLocal: "2026-07-09T08:00:00.000Z",
        }),
        "{not-json",
      ],
    });

    const result = scanForwardCaptureParity({
      io: buildMemoryIo(files),
      forwardQuotesDir: INPUT_DIR,
      friction: BID_ONLY_FRICTION,
    });

    expect(result.metrics.malformedLineCount).toBe(1);
    expect(result.metrics.topOfBookRecordsScanned).toBe(1);
  });

  it("aggregates candidate duration across bid-only watch streaks", () => {
    const files = createRunFiles({
      runId: "duration-run",
      topOfBookLines: [
        createTopOfBookLine({
          runId: "duration-run",
          receivedAtLocal: "2026-07-09T08:00:00.000Z",
          yesBid: 51,
          noBid: 51,
        }),
        createTopOfBookLine({
          runId: "duration-run",
          receivedAtLocal: "2026-07-09T08:00:02.000Z",
          yesBid: 51,
          noBid: 51,
        }),
        createTopOfBookLine({
          runId: "duration-run",
          receivedAtLocal: "2026-07-09T08:00:10.000Z",
          yesBid: 45,
          noBid: 53,
        }),
      ],
    });

    const result = scanForwardCaptureParity({
      io: buildMemoryIo(files),
      forwardQuotesDir: INPUT_DIR,
      friction: BID_ONLY_FRICTION,
    });

    expect(result.metrics.totalCandidateDurationMs).toBeGreaterThan(0);
  });
});

describe("parseStaticParityScanArgv", () => {
  it("defaults pricing model to bid-only", () => {
    const friction = parseStaticParityScanFrictionFromArgv([]);
    expect(friction.pricingModel).toBe("bid-only");
  });

  it("parses complement-derived pricing model flag", () => {
    const friction = parseStaticParityScanFrictionFromArgv([
      "--pricing-model",
      "complement-derived",
    ]);
    expect(friction.pricingModel).toBe("complement-derived");
    expect(friction.requireBothSidesPresent).toBe(true);
  });
});

describe("buildStaticParityScanReport", () => {
  it("serializes deterministic JSON and HTML with bid-only defaults", () => {
    const report = buildStaticParityScanReport({
      generatedAt: "2026-07-09T12:00:00.000Z",
      outputPath: "data/research-results/static-parity-scan.json",
      htmlOutputPath: "data/reports/static-parity-scan.html",
      inputPaths: DEFAULT_STATIC_PARITY_SCAN_INPUT_PATHS,
      friction: BID_ONLY_FRICTION,
      io: buildMemoryIo(
        createRunFiles({
          runId: "report-run",
          topOfBookLines: [
            createTopOfBookLine({
              runId: "report-run",
              receivedAtLocal: "2026-07-09T08:00:00.000Z",
            }),
          ],
        }),
      ),
    });

    const json = serializeStaticParityScanReport(report);
    const html = serializeStaticParityScanHtml(report);

    expect(json).toBe(serializeStaticParityScanReport(report));
    expect(html).toContain("Bid-Only Parity Scan");
    expect(html).toContain("bid-only");
    expect(json).toContain('"pricingModel":"bid-only"');
    expect(report.summary.requiresExecutableConfirmation).toBe(true);
    expect(report.metrics.executableConfirmedCandidateCount).toBe(0);
  });

  it("includes candidate sample bid-only fields", () => {
    const report = buildStaticParityScanReport({
      generatedAt: "2026-07-09T12:00:00.000Z",
      outputPath: "data/research-results/static-parity-scan.json",
      htmlOutputPath: "data/reports/static-parity-scan.html",
      inputPaths: DEFAULT_STATIC_PARITY_SCAN_INPUT_PATHS,
      friction: { ...BID_ONLY_FRICTION, feeBufferCents: 20 },
      io: buildMemoryIo(
        createRunFiles({
          runId: "sample-run",
          topOfBookLines: [
            createTopOfBookLine({
              runId: "sample-run",
              receivedAtLocal: "2026-07-09T08:00:00.000Z",
              yesBid: 55,
              noBid: 55,
            }),
          ],
        }),
      ),
    });

    expect(report.candidateSamples[0]?.bidSumCents).toBe(110);
    expect(report.candidateSamples[0]?.bidOnlyEdgeCents).toBe(10);
    expect(report.candidateSamples[0]?.minBidSizeContracts).toBe(10);
  });

  it("includes scope metadata for selected-run scans", () => {
    const report = buildStaticParityScanReport({
      generatedAt: "2026-07-09T12:00:00.000Z",
      outputPath: "data/research-results/static-parity-scan.json",
      htmlOutputPath: "data/reports/static-parity-scan.html",
      inputPaths: {
        forwardQuotesDir: INPUT_DIR,
        captureRunDir: `${INPUT_DIR}/selected-run`,
      },
      friction: BID_ONLY_FRICTION,
      io: buildMemoryIo(
        createRunFiles({
          runId: "selected-run",
          topOfBookLines: [
            createTopOfBookLine({
              runId: "selected-run",
              receivedAtLocal: "2026-07-09T08:00:00.000Z",
            }),
          ],
        }),
      ),
    });

    expect(report.analysisScope).toBe("selected-run");
    expect(report.selectedRunId).toBe("selected-run");
    expect(report.sourceRunIds).toEqual(["selected-run"]);
    expect(report.scope.recordsScanned).toBe(1);
  });
});

describe("parseStaticParityScanPathsFromArgv", () => {
  it("parses paths", () => {
    const paths = parseStaticParityScanPathsFromArgv([
      "--input-dir",
      "data/custom",
    ]);
    expect(paths.inputPaths.forwardQuotesDir).toBe("data/custom");
  });

  it("parses selected-run capture dir", () => {
    const paths = parseStaticParityScanPathsFromArgv([
      "--capture-run-dir",
      "data/live-capture/forward-quotes/run-a",
    ]);
    expect(paths.inputPaths.captureRunDir).toBe("data/live-capture/forward-quotes/run-a");
  });
});
