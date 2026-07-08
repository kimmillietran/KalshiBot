import { dirname } from "node:path";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";

import {
  assertHypothesisTradeReplayInputFiles,
  buildHypothesisTradeReplayReport,
  HypothesisTradeReplayError,
  loadHypothesisTradeReplayInputs,
  resolveHypothesisTradeReplayInputStatus,
  serializeHypothesisTradeReplayHtml,
  serializeHypothesisTradeReplayReport,
} from "@/lib/data/research/hypothesisTradeReplay";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { normalizeHypothesisTradeReplayArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  HypothesisTradeReplayCommandError,
  parseHtmlOutputPathFromArgv,
  parseInputPathsFromArgv,
  parseOutputPathFromArgv,
  parseReplayConfigFromArgv,
} from "./buildHypothesisTradeReplayTypes";
import type { HypothesisTradeReplayCommandIo } from "./buildHypothesisTradeReplayTypes";

function mapCommandError(error: unknown): string {
  if (error instanceof HypothesisTradeReplayCommandError) {
    return error.message;
  }

  if (error instanceof HypothesisTradeReplayError) {
    return error.message;
  }

  return error instanceof Error ? error.message : "Hypothesis trade replay failed";
}

export function runHypothesisTradeReplayCommand(
  argv: readonly string[],
  io: HypothesisTradeReplayCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeHypothesisTradeReplayArgv(argv);
    const outputPath = parseOutputPathFromArgv(normalizedArgv);
    const htmlOutputPath = parseHtmlOutputPathFromArgv(normalizedArgv);
    const inputPaths = parseInputPathsFromArgv(normalizedArgv);
    const config = parseReplayConfigFromArgv(normalizedArgv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    assertHypothesisTradeReplayInputFiles(io, {
      hypothesisCandidatesPath: inputPaths.hypothesisCandidatesPath,
    });

    const inputStatus = resolveHypothesisTradeReplayInputStatus(io, inputPaths);
    const loaded = loadHypothesisTradeReplayInputs({
      inputPaths,
      config,
      io,
    });

    const report = buildHypothesisTradeReplayReport({
      generatedAt,
      outputPath,
      htmlOutputPath,
      inputPaths,
      inputStatus,
      config,
      candidates: loaded.candidates,
      observations: loaded.observations,
      regimeVolatilityByMarket: loaded.regimeVolatilityByMarket,
    });

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.mkdirSync(dirname(htmlOutputPath), { recursive: true });
    io.writeFile(outputPath, serializeHypothesisTradeReplayReport(report));
    io.writeFile(htmlOutputPath, serializeHypothesisTradeReplayHtml(report));

    io.writeStdout(
      formatStdoutOutput(
        stableStringify({
          outputPath: report.outputPath,
          htmlOutputPath: report.htmlOutputPath,
          replayedHypothesisCount: report.summary.replayedHypothesisCount,
          filledTradeCount: report.summary.filledTradeCount,
          skippedTradeCount: report.summary.skippedTradeCount,
          positiveNetHypothesisCount: report.summary.positiveNetHypothesisCount,
          killedByCostOrFillabilityCount: report.summary.killedByCostOrFillabilityCount,
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
  const exitCode = runHypothesisTradeReplayCommand(process.argv.slice(2), {
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
    fileExists: (path) => {
      try {
        statSync(path);
        return true;
      } catch {
        return false;
      }
    },
    isDirectory: (path) => statSync(path).isDirectory(),
  });

  process.exitCode = exitCode;
}

if (process.env.VITEST !== "true") {
  main();
}
