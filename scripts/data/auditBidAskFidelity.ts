import { dirname } from "node:path";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";

import {
  buildBidAskFidelityReport,
  scanBidAskAuditDatasets,
  serializeBidAskFidelityReport,
} from "@/lib/data/datasets/validation/audit";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { normalizeDataAuditBidAskArgv } from "../lib/cliArgvSchemas";

import {
  AuditBidAskFidelityCommandError,
  formatStdoutOutput,
  parseInputDirFromArgv,
  parseOutputPathFromArgv,
} from "./auditBidAskFidelityTypes";
import type { AuditBidAskFidelityCommandIo } from "./auditBidAskFidelityTypes";

function mapCommandError(error: unknown): string {
  if (error instanceof AuditBidAskFidelityCommandError) {
    return error.message;
  }

  return error instanceof Error
    ? error.message
    : "Bid/ask fidelity audit failed";
}

export function runAuditBidAskFidelityCommand(
  argv: readonly string[],
  io: AuditBidAskFidelityCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeDataAuditBidAskArgv(argv);
    const inputDir = parseInputDirFromArgv(normalizedArgv);
    const outputPath = parseOutputPathFromArgv(normalizedArgv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();
    const datasets = scanBidAskAuditDatasets(inputDir, {
      readdir: (path) => io.readdir(path),
      readFile: (path) => io.readFile(path),
      fileExists: (path) => io.fileExists(path),
      isDirectory: (path) => io.isDirectory(path),
    });

    const report = buildBidAskFidelityReport({
      inputDir,
      outputPath,
      generatedAt,
      datasets,
    });

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.writeFile(outputPath, serializeBidAskFidelityReport(report));

    io.writeStdout(
      formatStdoutOutput(
        stableStringify({
          outputPath: report.outputPath,
          seriesCount: report.summary.seriesCount,
          marketCount: report.summary.marketCount,
          candleCount: report.summary.candleCount,
          suspiciousZeroSpreadMarketCount:
            report.summary.suspiciousZeroSpreadMarketCount,
          warningCount: report.summary.warnings.length,
        }),
      ),
    );

    return 0;
  } catch (error) {
    const message = mapCommandError(error);
    io.writeStderr(message.endsWith("\n") ? message : `${message}\n`);
    return 1;
  }
}

function main(): void {
  const exitCode = runAuditBidAskFidelityCommand(process.argv.slice(2), {
    readFile: (path) => readFileSync(path, "utf8").replace(/^\uFEFF/, ""),
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
    readdir: (path) => readdirSync(path),
    fileExists: (path) => existsSync(path),
    isDirectory: (path) => statSync(path).isDirectory(),
  });

  process.exitCode = exitCode;
}

if (process.env.VITEST !== "true") {
  main();
}

export {
  AuditBidAskFidelityCommandError,
  formatStdoutOutput,
  parseInputDirFromArgv,
  parseOutputPathFromArgv,
} from "./auditBidAskFidelityTypes";
