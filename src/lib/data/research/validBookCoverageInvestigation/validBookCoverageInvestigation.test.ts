import { describe, expect, it } from "vitest";

import { buildValidBookCoverageInvestigationReport } from "./buildValidBookCoverageInvestigationReport";
import { classifyTopOfBookValidity } from "./classifyTopOfBookValidity";
import { investigateValidBookCoverage } from "./investigateValidBookCoverage";
import { serializeValidBookCoverageInvestigationHtml } from "./serializeValidBookCoverageInvestigationHtml";
import { serializeValidBookCoverageInvestigationReport } from "./serializeValidBookCoverageInvestigationReport";
import {
  DEFAULT_VALID_BOOK_COVERAGE_INPUT_PATHS,
  M12_3_EXPECTED_TOP_OF_BOOK_FIELDS,
  type ValidBookCoverageInvestigationIo,
} from "./validBookCoverageInvestigationTypes";

const INPUT_DIR = "data/live-capture/forward-quotes";

function buildMemoryIo(files: Record<string, string>): ValidBookCoverageInvestigationIo {
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
        const child = filePath.slice(prefix.length).split("/")[0];
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
  yesBid?: number | null;
  yesAsk?: number | null;
  noBid?: number | null;
  noAsk?: number | null;
  yesBidSize?: number | null;
  yesAskSize?: number | null;
  noBidSize?: number | null;
  noAskSize?: number | null;
  yesSpread?: number | null;
  noSpread?: number | null;
}) {
  return JSON.stringify({
    runId: input.runId,
    marketTicker: input.marketTicker ?? "KXBTC15M-TEST",
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
    yesSpreadCents: input.yesSpread ?? 2,
    noSpreadCents: input.noSpread ?? 2,
  });
}

function createRunFiles(input: {
  runId: string;
  topOfBookLines: string[];
  metadataLines?: string[];
  throttleMs?: number;
}) {
  const runDir = `${INPUT_DIR}/${input.runId}`;
  const files: Record<string, string> = {
    [`${runDir}/capture-health.json`]: JSON.stringify({
      runId: input.runId,
      startedAt: "2026-07-09T22:12:39.602Z",
      endedAt: "2026-07-09T22:22:40.703Z",
      config: {
        topOfBookThrottleMs: input.throttleMs ?? 1000,
        durationMinutes: 10,
      },
      capture: { topOfBookRecordCount: input.topOfBookLines.length },
    }),
    [`${runDir}/top-of-book.jsonl`]: input.topOfBookLines.join("\n"),
  };

  if (input.metadataLines) {
    files[`${runDir}/market-metadata.jsonl`] = input.metadataLines.join("\n");
  }

  return files;
}

describe("classifyTopOfBookValidity", () => {
  it("distinguishes capture-valid from economically-valid", () => {
    const valid = classifyTopOfBookValidity({
      bookState: "valid",
      yesBestBidCents: 45,
      yesBestAskCents: 47,
      noBestBidCents: 53,
      noBestAskCents: 55,
      yesBestBidSize: 10,
      yesBestAskSize: 10,
      noBestBidSize: 10,
      noBestAskSize: 10,
      yesSpreadCents: 2,
      noSpreadCents: 2,
    });
    const crossed = classifyTopOfBookValidity({
      bookState: "valid",
      yesBestBidCents: 54,
      yesBestAskCents: 30,
      noBestBidCents: 70,
      noBestAskCents: 46,
      yesBestBidSize: 10,
      yesBestAskSize: 10,
      noBestBidSize: 10,
      noBestAskSize: 10,
      yesSpreadCents: 0,
      noSpreadCents: 0,
    });

    expect(valid.captureValid).toBe(true);
    expect(valid.economicallyValid).toBe(true);
    expect(valid.parityUsable).toBe(true);
    expect(crossed.captureValid).toBe(true);
    expect(crossed.economicallyValid).toBe(false);
    expect(crossed.primaryClass).toBe("crossed-yes-book");
  });

  it("classifies crossed, locked, missing sides, impossible prices, and insufficient depth", () => {
    expect(
      classifyTopOfBookValidity({
        bookState: "valid",
        yesBestBidCents: 50,
        yesBestAskCents: 50,
        noBestBidCents: 48,
        noBestAskCents: 52,
        yesBestBidSize: 10,
        yesBestAskSize: 10,
        noBestBidSize: 10,
        noBestAskSize: 10,
        yesSpreadCents: 0,
        noSpreadCents: 4,
      }).primaryClass,
    ).toBe("locked-yes-book");

    expect(
      classifyTopOfBookValidity({
        bookState: "valid",
        yesBestBidCents: null,
        yesBestAskCents: null,
        noBestBidCents: 53,
        noBestAskCents: 55,
        yesBestBidSize: null,
        yesBestAskSize: null,
        noBestBidSize: 10,
        noBestAskSize: 10,
        yesSpreadCents: null,
        noSpreadCents: 2,
      }).primaryClass,
    ).toBe("missing-yes-side");

    expect(
      classifyTopOfBookValidity({
        bookState: "valid",
        yesBestBidCents: 45,
        yesBestAskCents: 47,
        noBestBidCents: null,
        noBestAskCents: null,
        yesBestBidSize: 10,
        yesBestAskSize: 10,
        noBestBidSize: null,
        noBestAskSize: null,
        yesSpreadCents: 2,
        noSpreadCents: null,
      }).primaryClass,
    ).toBe("missing-no-side");

    expect(
      classifyTopOfBookValidity({
        bookState: "valid",
        yesBestBidCents: 45,
        yesBestAskCents: 47,
        noBestBidCents: 101,
        noBestAskCents: 0,
        yesBestBidSize: 10,
        yesBestAskSize: 10,
        noBestBidSize: 10,
        noBestAskSize: 10,
        yesSpreadCents: 2,
        noSpreadCents: 0,
      }).primaryClass,
    ).toBe("impossible-price");

    expect(
      classifyTopOfBookValidity({
        bookState: "valid",
        yesBestBidCents: 45,
        yesBestAskCents: 47,
        noBestBidCents: 53,
        noBestAskCents: 55,
        yesBestBidSize: 0,
        yesBestAskSize: 0,
        noBestBidSize: 0,
        noBestAskSize: 0,
        yesSpreadCents: 2,
        noSpreadCents: 2,
      }).primaryClass,
    ).toBe("insufficient-depth");
  });

  it("detects spread clamp suspicion and derived asks", () => {
    const result = classifyTopOfBookValidity({
      bookState: "valid",
      yesBestBidCents: 54,
      yesBestAskCents: 30,
      noBestBidCents: 70,
      noBestAskCents: 46,
      yesBestBidSize: 10,
      yesBestAskSize: 10,
      noBestBidSize: 10,
      noBestAskSize: 10,
      yesSpreadCents: 0,
      noSpreadCents: 0,
    });

    expect(result.yesAskDerivedFromNoBid).toBe(true);
    expect(result.noAskDerivedFromYesBid).toBe(true);
    expect(result.negativeImpliedSpreadBeforeClamp).toBe(true);
    expect(result.spreadClampedToZeroSuspicion).toBe(true);
  });
});

describe("investigateValidBookCoverage", () => {
  it("flags scanner field mapping when expected top-of-book fields are absent", () => {
    const runDir = `${INPUT_DIR}/missing-fields-run`;
    const files: Record<string, string> = {
      [`${runDir}/capture-health.json`]: JSON.stringify({
        runId: "missing-fields-run",
        capture: { topOfBookRecordCount: 1 },
      }),
      [`${runDir}/top-of-book.jsonl`]: JSON.stringify({
        marketTicker: "M-BAD-FIELDS",
        receivedAtLocal: "2026-07-09T22:12:40.000Z",
        bookState: "valid",
        yesBidCents: 45,
        yesAskCents: 47,
      }),
    };

    const result = investigateValidBookCoverage({
      io: buildMemoryIo(files),
      forwardQuotesDir: INPUT_DIR,
    });

    expect(result.yesNoPairing.scannerFieldMappingOk).toBe(false);
    expect(result.summary.rootCauseClassification).toBe(
      "scanner-field-mapping-issue",
    );
  });

  it("aggregates validity breakdown and market-level findings", () => {
    const files = createRunFiles({
      runId: "mixed-run",
      topOfBookLines: [
        createTopOfBookLine({
          runId: "mixed-run",
          marketTicker: "M-HEALTHY",
          receivedAtLocal: "2026-07-09T22:12:40.000Z",
        }),
        createTopOfBookLine({
          runId: "mixed-run",
          marketTicker: "M-CROSSED",
          receivedAtLocal: "2026-07-09T22:12:41.000Z",
          yesBid: 54,
          yesAsk: 30,
          noBid: 70,
          noAsk: 46,
          yesSpread: 0,
          noSpread: 0,
        }),
      ],
    });

    const result = investigateValidBookCoverage({
      io: buildMemoryIo(files),
      forwardQuotesDir: INPUT_DIR,
    });

    expect(result.aggregateValidityBreakdown.totalTopOfBookRecords).toBe(2);
    expect(result.aggregateValidityBreakdown.captureValidRecords).toBe(2);
    expect(result.aggregateValidityBreakdown.economicallyValidRecords).toBe(1);
    expect(result.aggregateValidityBreakdown.parityUsableRecords).toBe(1);
    expect(result.yesNoPairing.scannerFieldMappingOk).toBe(true);
    expect(result.runs[0]?.markets).toHaveLength(2);
  });

  it("detects invalid-to-valid transitions and rollover handling", () => {
    const files = createRunFiles({
      runId: "transition-run",
      metadataLines: [
        JSON.stringify({
          recordedAtLocal: "2026-07-09T22:12:39.000Z",
          marketTicker: "M1",
          action: "subscribed",
          closeTime: "2026-07-09T22:30:00Z",
        }),
      ],
      topOfBookLines: [
        createTopOfBookLine({
          runId: "transition-run",
          marketTicker: "M1",
          receivedAtLocal: "2026-07-09T22:12:40.000Z",
          yesBid: 54,
          yesAsk: 30,
          noBid: 70,
          noAsk: 46,
          yesSpread: 0,
          noSpread: 0,
        }),
        createTopOfBookLine({
          runId: "transition-run",
          marketTicker: "M1",
          receivedAtLocal: "2026-07-09T22:12:41.000Z",
        }),
      ],
    });

    const result = investigateValidBookCoverage({
      io: buildMemoryIo(files),
      forwardQuotesDir: INPUT_DIR,
    });

    expect(result.runs[0]?.timing.invalidToValidTransitionCount).toBe(1);
    expect(result.runs[0]?.timing.timeFromSubscriptionToFirstRecordMs).toBe(1000);
  });

  it("skips malformed JSONL with warnings and handles multiple runs", () => {
    const files = {
      ...createRunFiles({
        runId: "run-a",
        topOfBookLines: [
          createTopOfBookLine({
            runId: "run-a",
            receivedAtLocal: "2026-07-09T22:12:40.000Z",
          }),
          "{bad-json",
        ],
      }),
      ...createRunFiles({
        runId: "run-b",
        topOfBookLines: [
          createTopOfBookLine({
            runId: "run-b",
            receivedAtLocal: "2026-07-09T22:12:41.000Z",
          }),
        ],
      }),
      [`${INPUT_DIR}/incomplete-run/capture-health.json`]: JSON.stringify({
        runId: "incomplete-run",
      }),
    };

    const result = investigateValidBookCoverage({
      io: buildMemoryIo(files),
      forwardQuotesDir: INPUT_DIR,
    });

    expect(result.runs).toHaveLength(3);
    expect(result.warnings.some((warning) => warning.includes("incomplete-run"))).toBe(
      true,
    );
    expect(result.aggregateValidityBreakdown.totalTopOfBookRecords).toBe(2);
  });

  it("handles large synthetic runs without crashing", () => {
    const lines = Array.from({ length: 160_000 }, (_, index) =>
      createTopOfBookLine({
        runId: "large-run",
        receivedAtLocal: new Date(Date.UTC(2026, 6, 9, 8, 0, index % 60)).toISOString(),
        yesBid: index % 3 === 0 ? 54 : 45,
        yesAsk: index % 3 === 0 ? 30 : 47,
        noBid: index % 3 === 0 ? 70 : 53,
        noAsk: index % 3 === 0 ? 46 : 55,
        yesSpread: index % 3 === 0 ? 0 : 2,
        noSpread: index % 3 === 0 ? 0 : 2,
      }),
    );

    const result = investigateValidBookCoverage({
      io: buildMemoryIo(
        createRunFiles({
          runId: "large-run",
          topOfBookLines: lines,
        }),
      ),
      forwardQuotesDir: INPUT_DIR,
    });

    expect(result.aggregateValidityBreakdown.totalTopOfBookRecords).toBe(160_000);
    expect(result.summary.rootCauseClassification).toBe(
      "capture-reconstruction-issue",
    );
  });
});

describe("buildValidBookCoverageInvestigationReport", () => {
  it("serializes deterministic JSON and HTML", () => {
    const report = buildValidBookCoverageInvestigationReport({
      generatedAt: "2026-07-09T12:00:00.000Z",
      outputPath: "data/research-results/valid-book-coverage-investigation.json",
      htmlOutputPath: "data/reports/valid-book-coverage-investigation.html",
      inputPaths: DEFAULT_VALID_BOOK_COVERAGE_INPUT_PATHS,
      io: buildMemoryIo(
        createRunFiles({
          runId: "report-run",
          topOfBookLines: [
            createTopOfBookLine({
              runId: "report-run",
              receivedAtLocal: "2026-07-09T22:12:40.000Z",
            }),
          ],
        }),
      ),
    });

    const json = serializeValidBookCoverageInvestigationReport(report);
    const html = serializeValidBookCoverageInvestigationHtml(report);

    expect(json).toBe(serializeValidBookCoverageInvestigationReport(report));
    expect(html).toContain("Valid Book Coverage Investigation");
    expect(json).toContain('"scannerFieldMappingOk":true');
    expect(M12_3_EXPECTED_TOP_OF_BOOK_FIELDS.length).toBeGreaterThan(0);
  });
});
