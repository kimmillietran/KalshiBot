import { describe, expect, it } from "vitest";

import { runVendorOrderbookSufficiencyAuditCommand } from "./buildVendorOrderbookSufficiencyAudit";

describe("runVendorOrderbookSufficiencyAuditCommand", () => {
  it("returns zero and writes report without samples", () => {
    const written: Record<string, string> = {};
    const stdout: string[] = [];

    const exitCode = runVendorOrderbookSufficiencyAuditCommand(
      ["--output", "out.json", "--html-output", "out.html"],
      {
        readFile: (path) => {
          if (path === "data/vendor-orderbook-samples/vendor-orderbook-audit-config.json") {
            return JSON.stringify({
              samplesRoot: "data/vendor-orderbook-samples",
              vendorSampleDirs: { predexon: "predexon" },
              thresholds: {
                medianSnapshotGapMsMax: 5000,
                p90SnapshotGapMsMax: 30000,
                nonZeroSpreadShareMin: 0.1,
                minDistinctMarkets: 1,
              },
            });
          }

          return "";
        },
        writeStdout: (text) => {
          stdout.push(text);
        },
        writeStderr: () => {},
        writeFile: (path, data) => {
          written[path] = data;
        },
        mkdirSync: () => {},
        fileExists: (path) =>
          path === "data/vendor-orderbook-samples/vendor-orderbook-audit-config.json",
        readdir: () => [],
        isDirectory: () => false,
      },
      { generatedAt: "2026-01-01T00:00:00.000Z" },
    );

    expect(exitCode).toBe(0);
    expect(stdout.join("")).toContain("request-vendor-samples");
    expect(written["out.json"]).toContain("request-vendor-samples");
    expect(written["out.html"]).toContain("Vendor Sample Request Template");
  });
});
