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
  buildPnlForensicsGateReport,
  createPnlForensicsGateConfig,
  loadPnlForensicsGateInputs,
  resolvePnlForensicsGateInputStatus,
  serializePnlForensicsGateHtml,
  serializePnlForensicsGateReport,
} from "@/lib/data/research/pnlForensicsGate";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  formatStdoutOutput,
  mapCommandError,
  parseHtmlOutputPathFromArgv,
  parseInputPathsFromArgv,
  parseOutputPathFromArgv,
  readOptionalFlag,
} from "./buildPnlForensicsGateTypes";
import type { PnlForensicsGateCommandIo } from "./buildPnlForensicsGateTypes";

export function runPnlForensicsGateCommand(
  argv: readonly string[],
  io: PnlForensicsGateCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const outputPath = parseOutputPathFromArgv(argv);
    const htmlOutputPath = parseHtmlOutputPathFromArgv(argv);
    const inputPaths = parseInputPathsFromArgv(argv);
    const researchResultsDir = readOptionalFlag(argv, "--research-results-dir");
    const generatedAt = options?.generatedAt ?? new Date().toISOString();
    const config = createPnlForensicsGateConfig();

    const loadedInputs = loadPnlForensicsGateInputs({
      inputPaths,
      io,
      replayInputOverrides: researchResultsDir
        ? { researchResultsDir }
        : undefined,
    });
    const inputStatus = resolvePnlForensicsGateInputStatus(io, inputPaths);
    const report = buildPnlForensicsGateReport({
      generatedAt,
      outputPath,
      htmlOutputPath,
      inputPaths,
      inputStatus,
      config,
      loadedInputs,
    });

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.mkdirSync(dirname(htmlOutputPath), { recursive: true });
    io.writeFile(outputPath, serializePnlForensicsGateReport(report));
    io.writeFile(htmlOutputPath, serializePnlForensicsGateHtml(report));

    io.writeStdout(
      formatStdoutOutput(
        stableStringify({
          outputPath: report.outputPath,
          htmlOutputPath: report.htmlOutputPath,
          familyForensicsVerdict: report.summary.familyForensicsVerdict,
          recommendFullM12: report.summary.recommendFullM12,
          familyNetPnlCents: report.summary.familyNetPnlCents,
          filledTradeCount: report.summary.filledTradeCount,
          topDayShare: report.dailyConcentration.topDayShareOfTotalPositivePnl,
          topMarketShare: report.marketConcentrationSummary.topMarketShareOfTotalPnl,
          topMonthShare: report.summary.topMonthShareOfTotalPnl,
          recommendedNextAction: report.summary.recommendedNextAction,
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
  const exitCode = runPnlForensicsGateCommand(process.argv.slice(2), {
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
  buildDefaultPnlForensicsGateInputPaths,
  PnlForensicsGateCommandError,
  formatStdoutOutput,
  parseHtmlOutputPathFromArgv,
  parseInputPathsFromArgv,
  parseOutputPathFromArgv,
} from "./buildPnlForensicsGateTypes";
