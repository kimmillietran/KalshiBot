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
  buildQuoteFidelityGateReport,
  createQuoteFidelityGateConfig,
  loadQuoteFidelityGateInputs,
  serializeQuoteFidelityGateHtml,
  serializeQuoteFidelityGateReport,
} from "@/lib/data/research/quoteFidelityGate";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  formatStdoutOutput,
  mapCommandError,
  parseHtmlOutputPathFromArgv,
  parseInputPathsFromArgv,
  parseOutputPathFromArgv,
} from "./buildQuoteFidelityGateTypes";
import type { QuoteFidelityGateCommandIo } from "./buildQuoteFidelityGateTypes";

export function runQuoteFidelityGateCommand(
  argv: readonly string[],
  io: QuoteFidelityGateCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const outputPath = parseOutputPathFromArgv(argv);
    const htmlOutputPath = parseHtmlOutputPathFromArgv(argv);
    const inputPaths = parseInputPathsFromArgv(argv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();
    const config = createQuoteFidelityGateConfig({
      seriesTicker: inputPaths.fixturesDir.split("/").pop() ?? "KXBTC15M",
    });

    const loadedInputs = loadQuoteFidelityGateInputs({ inputPaths, config, io });
    const report = buildQuoteFidelityGateReport({
      generatedAt,
      outputPath,
      htmlOutputPath,
      config,
      inputPaths,
      loadedInputs,
      io,
    });

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.mkdirSync(dirname(htmlOutputPath), { recursive: true });
    io.writeFile(outputPath, serializeQuoteFidelityGateReport(report));
    io.writeFile(htmlOutputPath, serializeQuoteFidelityGateHtml(report));

    io.writeStdout(
      formatStdoutOutput(
        stableStringify({
          outputPath: report.outputPath,
          htmlOutputPath: report.htmlOutputPath,
          verdict: report.summary.verdict,
          recommendedNextAction: report.summary.recommendedNextAction,
          marketCount: report.summary.marketCount,
          eventCount: report.summary.eventCount,
          eventsWith2PlusStrikes: report.summary.eventsWith2PlusStrikes,
          liveCloseOnlyQuoteShare: report.summary.liveCloseOnlyQuoteShare,
          zeroSpreadMarketShare: report.summary.zeroSpreadMarketShare,
          executableParityResearchFeasible:
            report.summary.executableParityResearchFeasible,
          ladderResearchFeasible: report.summary.ladderResearchFeasible,
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
  const exitCode = runQuoteFidelityGateCommand(process.argv.slice(2), {
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
