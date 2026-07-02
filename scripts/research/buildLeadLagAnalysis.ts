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
  buildLeadLagAnalysisFromDirectories,
  serializeLeadLagAnalysis,
} from "@/lib/data/research/leadLag";

import { normalizeLeadLagArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  mapCommandError,
  parseInputDirFromArgv,
  parseOutputPathFromArgv,
} from "./buildLeadLagAnalysisTypes";
import type { LeadLagCommandIo } from "./buildLeadLagAnalysisTypes";

export function runLeadLagAnalysisCommand(
  argv: readonly string[],
  io: LeadLagCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeLeadLagArgv(argv);
    const inputRoot = parseInputDirFromArgv(normalizedArgv);
    const outputPath = parseOutputPathFromArgv(normalizedArgv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const analysis = buildLeadLagAnalysisFromDirectories(
      inputRoot,
      outputPath,
      io,
      { generatedAt },
    );

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.writeFile(outputPath, serializeLeadLagAnalysis(analysis));

    io.writeStdout(
      formatStdoutOutput(
        JSON.stringify({
          inputRoot,
          outputPath,
          marketCount: analysis.sampleCounts.marketCount,
          totalCandles: analysis.sampleCounts.totalCandles,
          warningCount: analysis.warnings.length,
          bestAggregateLag:
            analysis.aggregateLagMetrics.find(
              (metric) =>
                metric.crossCorrelation !== null
                && Math.abs(metric.crossCorrelation)
                  === Math.max(
                    ...analysis.aggregateLagMetrics
                      .map((entry) => Math.abs(entry.crossCorrelation ?? 0)),
                  ),
            )?.lag ?? null,
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
  const exitCode = runLeadLagAnalysisCommand(process.argv.slice(2), {
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
  parseInputDirFromArgv,
  parseOutputPathFromArgv,
  LeadLagCommandError,
} from "./buildLeadLagAnalysisTypes";
