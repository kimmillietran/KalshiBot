import { describe, expect, it } from "vitest";

import {
  buildCaptureQualityValidationReport,
  createCaptureQualityValidationConfig,
  deriveEconomicFieldsFromRecord,
  serializeCaptureQualityValidationHtml,
  serializeCaptureQualityValidationReport,
  validateCaptureRunQuality,
} from "./index";
import type { CaptureQualityValidationIo, ParsedTopOfBookValidationRecord } from "./captureQualityValidationTypes";

const INPUT_DIR = "data/live-capture/forward-quotes";

function buildMemoryIo(files: Record<string, string>): CaptureQualityValidationIo {
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

function topOfBookLine(input: {
  receivedAtLocal: string;
  bookState?: string;
  yesBid?: number;
  yesAsk?: number;
  noBid?: number;
  noAsk?: number;
  yesSpread?: number;
  noSpread?: number;
  economicBookState?: string;
  isEconomicallyValid?: boolean;
  isParityUsable?: boolean;
  isCrossed?: boolean;
  isLocked?: boolean;
}): string {
  return JSON.stringify({
    runId: "run-1",
    marketTicker: "KXBTC15M-TEST",
    eventTicker: "KXBTC15M-EVENT",
    receivedAtLocal: input.receivedAtLocal,
    bookState: input.bookState ?? "valid",
    yesBestBidCents: input.yesBid ?? 45,
    yesBestAskCents: input.yesAsk ?? 47,
    noBestBidCents: input.noBid ?? 53,
    noBestAskCents: input.noAsk ?? 55,
    yesBestBidSize: 10,
    yesBestAskSize: 10,
    noBestBidSize: 10,
    noBestAskSize: 10,
    yesSpreadCents: input.yesSpread ?? 2,
    noSpreadCents: input.noSpread ?? 2,
    ...(input.economicBookState !== undefined
      ? { economicBookState: input.economicBookState }
      : {}),
    ...(input.isEconomicallyValid !== undefined
      ? { isEconomicallyValid: input.isEconomicallyValid }
      : {}),
    ...(input.isParityUsable !== undefined ? { isParityUsable: input.isParityUsable } : {}),
    ...(input.isCrossed !== undefined ? { isCrossed: input.isCrossed } : {}),
    ...(input.isLocked !== undefined ? { isLocked: input.isLocked } : {}),
  });
}

function createRunFiles(input: {
  runId: string;
  topOfBookLines: string[];
  health?: Record<string, unknown>;
}) {
  const runDir = `${INPUT_DIR}/${input.runId}`;
  return {
    [`${runDir}/capture-health.json`]: JSON.stringify({
      runId: input.runId,
      verdict: "capture-mvp-success",
      capture: { topOfBookRecordCount: input.topOfBookLines.length },
      orderbook: {
        validTopOfBookRecords: input.topOfBookLines.filter((line) =>
          line.includes('"bookState":"valid"'),
        ).length,
      },
      ...input.health,
    }),
    [`${runDir}/top-of-book.jsonl`]: input.topOfBookLines.join("\n"),
  };
}

describe("captureQualityValidation", () => {
  it("recomputes economic validity for legacy captures without economicBookState", () => {
    const files = createRunFiles({
      runId: "legacy-run",
      topOfBookLines: [
        topOfBookLine({ receivedAtLocal: "2026-07-09T00:00:00.000Z" }),
        topOfBookLine({
          receivedAtLocal: "2026-07-09T00:00:01.000Z",
          yesBid: 54,
          yesAsk: 30,
          noBid: 70,
          noAsk: 46,
          yesSpread: 0,
          noSpread: 0,
        }),
      ],
    });

    const result = validateCaptureRunQuality({
      runDir: `${INPUT_DIR}/legacy-run`,
      config: createCaptureQualityValidationConfig(),
      io: buildMemoryIo(files),
    });

    expect(result.formatClassification).toBe("legacy-format");
    expect(result.recomputed.sequenceValidTopOfBookRecords).toBe(2);
    expect(result.recomputed.economicallyValidTopOfBookRecords).toBe(1);
    expect(result.recomputed.crossedTopOfBookRecords).toBe(1);
  });

  it("passes when new capture economicBookState matches recomputed state", () => {
    const files = createRunFiles({
      runId: "new-run",
      topOfBookLines: [
        topOfBookLine({
          receivedAtLocal: "2026-07-09T00:00:00.000Z",
          economicBookState: "economically-valid",
          isEconomicallyValid: true,
          isParityUsable: true,
          isCrossed: false,
          isLocked: false,
        }),
      ],
      health: {
        orderbook: {
          validTopOfBookRecords: 1,
          economicallyValidTopOfBookRecords: 1,
          parityUsableTopOfBookRecords: 1,
        },
      },
    });

    const result = validateCaptureRunQuality({
      runDir: `${INPUT_DIR}/new-run`,
      config: createCaptureQualityValidationConfig(),
      io: buildMemoryIo(files),
    });

    expect(result.formatClassification).toBe("economic-state-format");
    expect(result.economicStateMismatches).toHaveLength(0);
    expect(result.healthMismatches).toHaveLength(0);
  });

  it("flags incorrect economicBookState on new captures", () => {
    const files = createRunFiles({
      runId: "bad-state-run",
      topOfBookLines: [
        topOfBookLine({
          receivedAtLocal: "2026-07-09T00:00:00.000Z",
          yesBid: 54,
          yesAsk: 30,
          noBid: 70,
          noAsk: 46,
          yesSpread: 0,
          noSpread: 0,
          economicBookState: "economically-valid",
          isEconomicallyValid: true,
          isParityUsable: true,
          isCrossed: false,
        }),
      ],
    });

    const result = validateCaptureRunQuality({
      runDir: `${INPUT_DIR}/bad-state-run`,
      config: createCaptureQualityValidationConfig(),
      io: buildMemoryIo(files),
    });

    expect(result.economicStateMismatches.length).toBeGreaterThan(0);
    expect(result.warnings).toContain(
      "economicBookState disagrees with recomputed state on one or more records",
    );
  });

  it("reports health count mismatches", () => {
    const files = createRunFiles({
      runId: "mismatch-run",
      topOfBookLines: [topOfBookLine({ receivedAtLocal: "2026-07-09T00:00:00.000Z" })],
      health: {
        capture: { topOfBookRecordCount: 99 },
        orderbook: { validTopOfBookRecords: 99 },
      },
    });

    const result = validateCaptureRunQuality({
      runDir: `${INPUT_DIR}/mismatch-run`,
      config: createCaptureQualityValidationConfig(),
      io: buildMemoryIo(files),
    });

    expect(result.healthMismatches.length).toBeGreaterThan(0);
    expect(result.warnings).toContain("health top-of-book counts disagree with file counts");
  });

  it("does not count crossed records as economically valid", () => {
    const record: ParsedTopOfBookValidationRecord = {
      lineNumber: 1,
      marketTicker: "KXBTC15M-TEST",
      eventTicker: null,
      receivedAtLocal: "2026-07-09T00:00:00.000Z",
      receivedAtMs: Date.parse("2026-07-09T00:00:00.000Z"),
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
      reportedEconomicBookState: null,
      reportedIsEconomicallyValid: null,
      reportedIsParityUsable: null,
      reportedIsCrossed: null,
      reportedIsLocked: null,
    };

    const derived = deriveEconomicFieldsFromRecord(record);
    expect(derived.isEconomicallyValid).toBe(false);
    expect(derived.isCrossed).toBe(true);
  });

  it("treats complement-crossed captures as bid-only parity ready when bid pairs exist", () => {
    const lines = Array.from({ length: 12 }, (_, index) =>
      topOfBookLine({
        receivedAtLocal: new Date(Date.UTC(2026, 6, 9, 8, 0, index)).toISOString(),
        yesBid: 54,
        yesAsk: 30,
        noBid: 70,
        noAsk: 46,
        economicBookState: "crossed-yes-book",
        isEconomicallyValid: false,
        isParityUsable: false,
        isCrossed: true,
      }),
    );
    const files = createRunFiles({
      runId: "bid-only-ready-crossed",
      topOfBookLines: lines,
    });

    const result = validateCaptureRunQuality({
      runDir: `${INPUT_DIR}/bid-only-ready-crossed`,
      config: createCaptureQualityValidationConfig(),
      io: buildMemoryIo(files),
    });

    expect(result.recomputed.crossedTopOfBookRecords).toBeGreaterThan(0);
    expect(result.recomputed.bidPairPresentTopOfBookRecords).toBe(12);
    expect(result.enoughForBidOnlyParityResearch).toBe(true);
    expect(result.warnings).not.toContain(
      "capture says success but economically valid share is below threshold",
    );
  });

  it("counts invalid to valid transitions", () => {
    const files = createRunFiles({
      runId: "transition-run",
      topOfBookLines: [
        topOfBookLine({
          receivedAtLocal: "2026-07-09T00:00:00.000Z",
          yesBid: 54,
          yesAsk: 30,
          noBid: 70,
          noAsk: 46,
          yesSpread: 0,
          noSpread: 0,
        }),
        topOfBookLine({ receivedAtLocal: "2026-07-09T00:00:01.000Z" }),
      ],
    });

    const result = validateCaptureRunQuality({
      runDir: `${INPUT_DIR}/transition-run`,
      config: createCaptureQualityValidationConfig(),
      io: buildMemoryIo(files),
    });

    expect(result.transitionCoverage.invalidToValidTransitionsObserved).toBe(1);
    expect(result.transitionCoverage.transitionsWithEmittedRecord).toBe(1);
  });

  it("skips malformed JSONL with warning", () => {
    const runDir = `${INPUT_DIR}/malformed-run`;
    const files = {
      [`${runDir}/capture-health.json`]: JSON.stringify({ runId: "malformed-run" }),
      [`${runDir}/top-of-book.jsonl`]: `{bad json\n${topOfBookLine({ receivedAtLocal: "2026-07-09T00:00:00.000Z" })}`,
    };

    const result = validateCaptureRunQuality({
      runDir,
      config: createCaptureQualityValidationConfig(),
      io: buildMemoryIo(files),
    });

    expect(result.recomputed.malformedJsonlLines).toBe(1);
    expect(result.recomputed.topOfBookRecordCount).toBe(1);
    expect(result.warnings.some((warning) => warning.includes("malformed JSONL"))).toBe(true);
  });

  it("handles large synthetic runs without crashing", () => {
    const lines = Array.from({ length: 2_000 }, (_, index) =>
      topOfBookLine({
        receivedAtLocal: new Date(Date.parse("2026-07-09T00:00:00.000Z") + index * 1_000).toISOString(),
      }),
    );
    const files = createRunFiles({ runId: "large-run", topOfBookLines: lines });

    const result = validateCaptureRunQuality({
      runDir: `${INPUT_DIR}/large-run`,
      config: createCaptureQualityValidationConfig(),
      io: buildMemoryIo(files),
    });

    expect(result.recomputed.topOfBookRecordCount).toBe(2_000);
  });

  it("serializes stable JSON and HTML with verdict context", () => {
    const files = createRunFiles({
      runId: "html-run",
      topOfBookLines: [topOfBookLine({ receivedAtLocal: "2026-07-09T00:00:00.000Z" })],
    });
    directoriesFix(files);

    const report = buildCaptureQualityValidationReport({
      generatedAt: "2026-07-09T00:00:00.000Z",
      outputPath: "out.json",
      htmlOutputPath: "out.html",
      io: buildMemoryIo(files),
    });

    const json = serializeCaptureQualityValidationReport(report);
    const html = serializeCaptureQualityValidationHtml(report);

    expect(json).toContain('"runsScanned":1');
    expect(serializeCaptureQualityValidationReport(report)).toBe(json);
    expect(html).toContain("Capture Quality Validation Harness");
    expect(html).toContain("legacy-format");
  });

  it("warns when top-of-book file is missing", () => {
    const runDir = `${INPUT_DIR}/missing-top`;
    const result = validateCaptureRunQuality({
      runDir,
      config: createCaptureQualityValidationConfig(),
      io: buildMemoryIo({
        [`${runDir}/capture-health.json`]: JSON.stringify({ runId: "missing-top" }),
      }),
    });

    expect(result.skipped).toBe(true);
    expect(result.warnings).toContain("top-of-book file missing");
  });
});

function directoriesFix(_files: Record<string, string>) {
  // buildMemoryIo derives directories from file paths
}
