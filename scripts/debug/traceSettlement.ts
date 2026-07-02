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
  buildSettlementTraceReport,
  formatSettlementTraceConsoleSummary,
  serializeSettlementTraceReport,
} from "@/lib/data/audit/settlementTrace";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { normalizeDebugSettlementTraceArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  parseOutputPathFromArgv,
  parseTickerFromArgv,
  parseTraceConfigFromArgv,
  SettlementTraceCommandError,
} from "./traceSettlementTypes";
import type { SettlementTraceCommandIo } from "./traceSettlementTypes";

function mapCommandError(error: unknown): string {
  if (error instanceof SettlementTraceCommandError) {
    return error.message;
  }

  return error instanceof Error ? error.message : "Settlement trace failed";
}

export function runSettlementTraceCommand(
  argv: readonly string[],
  io: SettlementTraceCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeDebugSettlementTraceArgv(argv);
    const marketTicker = parseTickerFromArgv(normalizedArgv);
    const outputPath = parseOutputPathFromArgv(normalizedArgv, marketTicker);
    const config = parseTraceConfigFromArgv(normalizedArgv, marketTicker);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const report = buildSettlementTraceReport({
      generatedAt,
      outputPath,
      config,
      io,
    });

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.writeFile(outputPath, serializeSettlementTraceReport(report));

    io.writeStdout(formatSettlementTraceConsoleSummary(report));
    io.writeStdout(
      formatStdoutOutput(
        stableStringify({
          outputPath: report.outputPath,
          marketTicker: report.marketTicker,
          firstMissingStage: report.firstMissingStage,
          likelyRootCause: report.likelyRootCause,
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
  const exitCode = runSettlementTraceCommand(process.argv.slice(2), {
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
  formatStdoutOutput,
  parseOutputPathFromArgv,
  parseTickerFromArgv,
  parseTraceConfigFromArgv,
  SettlementTraceCommandError,
} from "./traceSettlementTypes";
