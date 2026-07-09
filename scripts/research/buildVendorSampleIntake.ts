import { dirname } from "node:path";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";

import {
  buildVendorSampleIntakeReport,
  serializeVendorSampleIntakeHtml,
  serializeVendorSampleIntakeReport,
} from "@/lib/data/research/vendorSampleIntake";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { normalizeVendorSampleIntakeArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  mapCommandError,
  parseVendorSampleIntakeConfigFromArgv,
} from "./buildVendorSampleIntakeTypes";
import type { VendorSampleIntakeCommandIo } from "./buildVendorSampleIntakeTypes";

export function runVendorSampleIntakeCommand(
  argv: readonly string[],
  io: VendorSampleIntakeCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeVendorSampleIntakeArgv(argv);
    const config = parseVendorSampleIntakeConfigFromArgv(normalizedArgv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const report = buildVendorSampleIntakeReport({
      generatedAt,
      outputPath: config.outputPath,
      htmlOutputPath: config.htmlOutputPath,
      samplesRoot: config.samplesRoot,
      io: {
        readFile: io.readFile,
        fileExists: io.fileExists,
        readdir: io.readdir,
        isDirectory: io.isDirectory,
      },
    });

    io.mkdirSync(dirname(config.outputPath), { recursive: true });
    io.mkdirSync(dirname(config.htmlOutputPath), { recursive: true });
    io.writeFile(config.outputPath, serializeVendorSampleIntakeReport(report));
    io.writeFile(config.htmlOutputPath, serializeVendorSampleIntakeHtml(report));

    io.writeStdout(
      formatStdoutOutput(
        stableStringify({
          outputPath: report.outputPath,
          htmlOutputPath: report.htmlOutputPath,
          overallVerdict: report.summary.overallVerdict,
          recommendedAction: report.summary.recommendedAction,
          totalFilesDetected: report.summary.totalFilesDetected,
          totalPreviewRecords: report.summary.totalPreviewRecords,
          m12_1AOverallVerdict: report.reAuditReadiness.m12_1AOverallVerdict,
        }),
      ),
    );

    return 0;
  } catch (error) {
    io.writeStderr(`${mapCommandError(error)}\n`);
    return 1;
  }
}

function main(): void {
  const exitCode = runVendorSampleIntakeCommand(process.argv.slice(2), {
    readFile: (path) => readFileSync(path, "utf8").replace(/^\uFEFF/, ""),
    fileExists: (path) => existsSync(path),
    readdir: (path) => readdirSync(path),
    isDirectory: (path) => statSync(path).isDirectory(),
    writeStdout: (text) => {
      process.stdout.write(text);
    },
    writeStderr: (text) => {
      process.stderr.write(text);
    },
    writeFile: (path, data) => {
      writeFileSync(path, data, "utf8");
    },
    mkdirSync: (path, options) => {
      mkdirSync(path, options);
    },
  });

  process.exitCode = exitCode;
}

if (process.env.VITEST !== "true") {
  main();
}
