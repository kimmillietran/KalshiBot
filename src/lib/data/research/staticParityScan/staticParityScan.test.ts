import { describe, expect, it } from "vitest";

import { classifyParitySnapshot } from "./classifyParitySnapshot";
import { buildStaticParityScanReport } from "./buildStaticParityScanReport";
import { scanForwardCaptureParity } from "./scanForwardCaptureParity";
import { serializeStaticParityScanHtml } from "./serializeStaticParityScanHtml";
import { serializeStaticParityScanReport } from "./serializeStaticParityScanReport";
import {
  DEFAULT_STATIC_PARITY_FRICTION_CONFIG,
  DEFAULT_STATIC_PARITY_SCAN_INPUT_PATHS,
  type StaticParityScanIo,
} from "./staticParityScanTypes";

const FRICTION = DEFAULT_STATIC_PARITY_FRICTION_CONFIG;
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

describe("classifyParitySnapshot", () => {
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
      FRICTION,
    );

    expect(result.classification).toBe("no-signal");
  });

  it("classifies YES ask + NO ask < 100 as gross candidate", () => {
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
      { ...FRICTION, feeBufferCents: 20 },
    );

    expect(result.classification).toBe("gross-parity-candidate");
    expect(result.grossEdgeCents).toBe(10);
  });

  it("classifies YES bid + NO bid > 100 as gross candidate", () => {
    const result = classifyParitySnapshot(
      {
        yesBidCents: 55,
        yesAskCents: 57,
        noBidCents: 55,
        noAskCents: 57,
        yesBestBidSize: 10,
        yesBestAskSize: 10,
        noBestBidSize: 10,
        noBestAskSize: 10,
        bookState: "valid",
      },
      { ...FRICTION, feeBufferCents: 20 },
    );

    expect(result.classification).toBe("gross-parity-candidate");
    expect(result.grossEdgeCents).toBe(10);
  });

  it("classifies candidate below friction buffer as watch/not-tradable", () => {
    const result = classifyParitySnapshot(
      {
        yesBidCents: 48,
        yesAskCents: 49,
        noBidCents: 48,
        noAskCents: 50,
        yesBestBidSize: 10,
        yesBestAskSize: 10,
        noBestBidSize: 10,
        noBestAskSize: 10,
        bookState: "valid",
      },
      FRICTION,
    );

    expect(result.classification).toBe("parity-watch");
    expect(result.isGrossCandidate).toBe(false);
  });

  it("classifies candidate surviving buffer as buffer-adjusted-candidate", () => {
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
      { ...FRICTION, feeBufferCents: 2, minGrossEdgeCents: 2 },
    );

    expect(result.classification).toBe("buffer-adjusted-candidate");
    expect(result.estimatedNetEdgeCents).toBeGreaterThanOrEqual(2);
  });

  it("classifies missing YES or NO side as insufficient-book-depth", () => {
    const result = classifyParitySnapshot(
      {
        yesBidCents: 45,
        yesAskCents: 47,
        noBidCents: null,
        noAskCents: null,
        yesBestBidSize: 10,
        yesBestAskSize: 10,
        noBestBidSize: null,
        noBestAskSize: null,
        bookState: "valid",
      },
      FRICTION,
    );

    expect(result.classification).toBe("insufficient-book-depth");
  });

  it("flags invalid/crossed book state", () => {
    const result = classifyParitySnapshot(
      {
        yesBidCents: 50,
        yesAskCents: 49,
        noBidCents: 50,
        noAskCents: 51,
        yesBestBidSize: 10,
        yesBestAskSize: 10,
        noBestBidSize: 10,
        noBestAskSize: 10,
        bookState: "valid",
      },
      FRICTION,
    );

    expect(result.classification).toBe("invalid-book-state");
  });
});

describe("scanForwardCaptureParity", () => {
  it("aggregates multiple runs correctly", () => {
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
            yesAsk: 45,
            noAsk: 45,
            yesBid: 40,
            noBid: 40,
          }),
        ],
      }),
    };

    const result = scanForwardCaptureParity({
      io: buildMemoryIo(files),
      forwardQuotesDir: INPUT_DIR,
      friction: { ...FRICTION, feeBufferCents: 20 },
    });

    expect(result.metrics.runCountScanned).toBe(2);
    expect(result.metrics.topOfBookRecordsScanned).toBe(2);
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
      friction: FRICTION,
    });

    expect(result.metrics.malformedLineCount).toBe(1);
    expect(result.metrics.topOfBookRecordsScanned).toBe(1);
  });

  it("handles large synthetic input without stack overflow", () => {
    const lines = Array.from({ length: 160_000 }, (_, index) =>
      createTopOfBookLine({
        runId: "large-run",
        receivedAtLocal: new Date(Date.UTC(2026, 6, 9, 8, 0, index % 60)).toISOString(),
      }),
    );
    const files = createRunFiles({
      runId: "large-run",
      topOfBookLines: lines,
    });

    expect(() =>
      scanForwardCaptureParity({
        io: buildMemoryIo(files),
        forwardQuotesDir: INPUT_DIR,
        friction: FRICTION,
      }),
    ).not.toThrow();

    const result = scanForwardCaptureParity({
      io: buildMemoryIo(files),
      forwardQuotesDir: INPUT_DIR,
      friction: FRICTION,
    });
    expect(result.metrics.topOfBookRecordsScanned).toBe(160_000);
  });
});

describe("buildStaticParityScanReport", () => {
  it("serializes deterministic JSON and HTML", () => {
    const report = buildStaticParityScanReport({
      generatedAt: "2026-07-09T12:00:00.000Z",
      outputPath: "data/research-results/static-parity-scan.json",
      htmlOutputPath: "data/reports/static-parity-scan.html",
      inputPaths: DEFAULT_STATIC_PARITY_SCAN_INPUT_PATHS,
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
    expect(html).toContain("Static Same-Market Parity Scan");
    expect(json).toContain('"runCountScanned":1');
  });
});
