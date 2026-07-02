import { describe, expect, it, vi } from "vitest";

import type { BatchResearchFilesystem, RunSingleBatchResearchFn } from "@/lib/data/research/batchResearch";

import { runBatchResearchCommand } from "./runBatchResearch";
import {
  BatchResearchCommandError,
  parseConcurrencyFromArgv,
  parseOutputDirFromArgv,
  parseRegistryDirFromArgv,
} from "./batchTypes";

function createRegistryJson(marketTicker: string, fixturePath: string): string {
  return JSON.stringify({
    seriesTicker: "KXBTC15M",
    markets: [
      {
        seriesTicker: "KXBTC15M",
        marketTicker,
        fixturePath,
        validationStatus: { valid: true },
      },
    ],
  });
}

function minimalValidResearchOutput(marketTicker: string): string {
  const backtestResult = JSON.stringify({
    metrics: {
      totalPnlCents: 0,
      totalReturnPct: 0,
      maxDrawdownPct: 0,
      sharpeRatio: null,
      winRatePct: 0,
      lossRatePct: 0,
      tradeCount: 0,
      winningTradeCount: 0,
      losingTradeCount: 0,
    },
  });
  const researchRun = JSON.stringify({
    durationMs: 1000,
    config: { strategyId: "noop" },
    backtestResult,
  });

  return JSON.stringify({
    dataset: JSON.stringify({ metadata: { marketTickers: [marketTicker] } }),
    researchRun,
    metadata: { durationMs: 1000 },
  });
}

function createFilesystem(
  registries: Record<string, string>,
  fixtures: Record<string, string> = {},
): BatchResearchFilesystem {
  const files = new Map<string, string>([
    ...Object.entries(registries),
    ...Object.entries(fixtures),
  ]);
  const writes = new Map<string, string>();

  return {
    exists: () => false,
    readFile: (path) => {
      const written = writes.get(path);
      if (written !== undefined) {
        return written;
      }

      const value = files.get(path);
      if (value === undefined) {
        throw new Error(`missing file: ${path}`);
      }
      return value;
    },
    writeFile: (path, data) => {
      writes.set(path, data);
    },
    mkdir: () => undefined,
    listRegistryPaths: () =>
      [...Object.keys(registries)].sort((left, right) => left.localeCompare(right)),
  };
}

function createIo() {
  const stdout: string[] = [];
  const stderr: string[] = [];

  return {
    io: {
      writeStdout: (text: string) => {
        stdout.push(text);
      },
      writeStderr: (text: string) => {
        stderr.push(text);
      },
    },
    stdout,
    stderr,
  };
}

describe("batch research argv parsing", () => {
  it("defaults registry and output directories", () => {
    expect(parseRegistryDirFromArgv([])).toBe("data/research-datasets");
    expect(parseOutputDirFromArgv([])).toBe("data/research-results");
    expect(parseConcurrencyFromArgv([])).toBeUndefined();
  });

  it("parses CLI flags", () => {
    expect(parseRegistryDirFromArgv(["--registry", "registry"])).toBe("registry");
    expect(parseOutputDirFromArgv(["--output-dir", "results"])).toBe("results");
    expect(parseConcurrencyFromArgv(["--concurrency", "2"])).toBe(2);
  });

  it("rejects invalid concurrency", () => {
    expect(() => parseConcurrencyFromArgv(["--concurrency", "0"])).toThrow(
      BatchResearchCommandError,
    );
  });
});

describe("runBatchResearchCommand", () => {
  it("runs batch research via dependency injection", async () => {
    const marketTicker = "KXBTC15M-MARKET-A";
    const fixturePath = `data/fixtures/KXBTC15M/${marketTicker}/fixture.json`;
    const registryPath = "data/research-datasets/KXBTC15M/dataset-registry.json";
    const filesystem = createFilesystem(
      { [registryPath]: createRegistryJson(marketTicker, fixturePath) },
      { [fixturePath]: JSON.stringify({ runId: "fixture-test", bronzeRecords: [] }) },
    );
    const runResearch: RunSingleBatchResearchFn = vi.fn(() =>
      minimalValidResearchOutput(marketTicker),
    );
    const { io, stdout } = createIo();

    const exitCode = await runBatchResearchCommand(
      [
        "--registry",
        "data/research-datasets",
        "--output-dir",
        "data/research-results",
        "--concurrency",
        "1",
      ],
      io,
      {
        deps: {
          filesystem,
          parseFixtureJson: (json) => JSON.parse(json),
          runResearch,
        },
      },
    );

    expect(exitCode).toBe(0);
    expect(runResearch).toHaveBeenCalledOnce();
    expect(JSON.parse(stdout.join(""))).toMatchObject({
      totalDatasets: 1,
      successfulRuns: 1,
    });
  });

  it("returns a fatal error for duplicate output paths", async () => {
    const registryPath = "data/research-datasets/KXBTC15M/dataset-registry.json";
    const filesystem = createFilesystem({
      [registryPath]: createRegistryJson(
        "KXBTC15M-MARKET-A",
        "data/fixtures/KXBTC15M/MARKET-A/fixture.json",
      ),
    });
    filesystem.listRegistryPaths = () => [registryPath, registryPath];
    const { io, stderr } = createIo();

    const exitCode = await runBatchResearchCommand(
      ["--registry", "data/research-datasets", "--output-dir", "data/research-results"],
      io,
      {
        deps: {
          filesystem,
          parseFixtureJson: (json) => JSON.parse(json),
          runResearch: vi.fn(),
        },
      },
    );

    expect(exitCode).toBe(1);
    expect(stderr.join("")).toContain("Duplicate output path");
  });
});
