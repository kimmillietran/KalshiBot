import { describe, expect, it } from "vitest";

import { normalizeVendorSampleIntakeArgv } from "../lib/cliArgvSchemas";
import { runVendorSampleIntakeCommand } from "./buildVendorSampleIntake";
import { parseVendorSampleIntakeConfigFromArgv } from "./buildVendorSampleIntakeTypes";

describe("parseVendorSampleIntakeConfigFromArgv", () => {
  it("defaults output paths and samples root", () => {
    const config = parseVendorSampleIntakeConfigFromArgv(
      normalizeVendorSampleIntakeArgv([]),
    );

    expect(config.outputPath).toBe("data/research-results/vendor-sample-intake.json");
    expect(config.htmlOutputPath).toBe("data/reports/vendor-sample-intake.html");
    expect(config.samplesRoot).toBe("data/vendor-orderbook-samples");
  });
});

describe("runVendorSampleIntakeCommand", () => {
  it("returns zero and writes report without samples", () => {
    const written: Record<string, string> = {};
    const stdout: string[] = [];

    const exitCode = runVendorSampleIntakeCommand(
      ["--output", "out.json", "--html-output", "out.html"],
      {
        readFile: () => "",
        fileExists: () => false,
        readdir: () => [],
        isDirectory: () => false,
        writeStdout: (text) => {
          stdout.push(text);
        },
        writeStderr: () => {},
        writeFile: (path, data) => {
          written[path] = data;
        },
        mkdirSync: () => {},
      },
      { generatedAt: "2026-01-01T00:00:00.000Z" },
    );

    expect(exitCode).toBe(0);
    expect(stdout.join("")).toContain("no-samples");
    expect(written["out.json"]).toContain("request-vendor-samples");
    expect(written["out.html"]).toContain("Executive verdict");
  });
});
