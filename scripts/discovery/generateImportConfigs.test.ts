import { describe, expect, it } from "vitest";

import type { DiscoveredMarket, MarketDiscoveryResult } from "@/lib/data/discovery";

import {
  runGenerateImportConfigsCommand,
} from "./generateImportConfigs";

const PROVENANCE = {
  source: "kalshi-historical-api" as const,
  fetchedAt: "2026-06-27T01:00:00.000Z",
  requestPath: "/historical/markets?series_ticker=KXBTC15M",
  cursor: "",
};

function discoveredMarket(): DiscoveredMarket {
  return {
    marketTicker: "KXBTC15M-26APR281945-45",
    eventTicker: "KXBTC15M-26APR281945",
    seriesTicker: "KXBTC15M",
    title: null,
    subtitle: null,
    status: "finalized",
    openTime: "2026-04-28T23:30:00.000Z",
    closeTime: "2026-04-28T23:45:00.000Z",
    settlementTime: "2026-04-28T23:45:09.271Z",
    expirationValue: "76282.84",
    provenance: PROVENANCE,
  };
}

function discoveryJson(result: MarketDiscoveryResult): string {
  return JSON.stringify({
    metadata: result.metadata,
    markets: [...result.markets],
    validation: result.validation,
    provenance: result.provenance,
  });
}

function createIo() {
  const writes = new Map<string, string>();
  let stdout = "";
  let stderr = "";

  return {
    io: {
      readFile: (path: string) => {
        if (path === "missing.json") {
          const error = new Error("ENOENT") as NodeJS.ErrnoException;
          error.code = "ENOENT";
          throw error;
        }

        return discoveryJson({
          metadata: {
            seriesTicker: "KXBTC15M",
            discoveredAt: "2026-06-27T01:00:00.000Z",
            marketCount: 1,
            pageCount: 1,
          },
          markets: [discoveredMarket()],
          validation: {
            valid: true,
            errors: [],
            warnings: [],
          },
          provenance: {
            pages: [PROVENANCE],
          },
        });
      },
      writeStdout: (text: string) => {
        stdout += text;
      },
      writeStderr: (text: string) => {
        stderr += text;
      },
      writeFile: (path: string, data: string) => {
        writes.set(path, data);
      },
    },
    writes,
    getStdout: () => stdout,
    getStderr: () => stderr,
  };
}

describe("runGenerateImportConfigsCommand", () => {
  it("writes one config per discovered market", () => {
    const { io, writes, getStdout } = createIo();

    const exitCode = runGenerateImportConfigsCommand(
      ["--input", "discovery-result.json"],
      io,
    );

    expect(exitCode).toBe(0);
    expect(writes.size).toBe(1);
    expect(writes.has(
      "data/import-configs/KXBTC15M/KXBTC15M-26APR281945-45/config.json",
    )).toBe(true);
    expect(JSON.parse(getStdout())).toMatchObject({
      configCount: 1,
      seriesTicker: "KXBTC15M",
    });
  });

  it("reports a missing discovery file", () => {
    const { io, getStderr } = createIo();

    const exitCode = runGenerateImportConfigsCommand(
      ["--input", "missing.json"],
      io,
    );

    expect(exitCode).toBe(1);
    expect(getStderr()).toContain("Discovery input file was not found");
  });

  it("requires --input", () => {
    const { io, getStderr } = createIo();

    const exitCode = runGenerateImportConfigsCommand([], io);

    expect(exitCode).toBe(1);
    expect(getStderr()).toContain("Missing required --input");
  });

  it("accepts npm-stripped positional input and output-dir", () => {
    const { io, writes, getStdout } = createIo();

    const exitCode = runGenerateImportConfigsCommand(
      ["discovery-result.json", "data/import-configs"],
      io,
    );

    expect(exitCode).toBe(0);
    expect(writes.size).toBe(1);
    expect(JSON.parse(getStdout())).toMatchObject({
      inputPath: "discovery-result.json",
      outputDir: "data/import-configs",
      configCount: 1,
    });
  });
});
