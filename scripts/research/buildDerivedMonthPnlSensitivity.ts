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
  buildDerivedMonthPnlSensitivityReport,
  createDerivedMonthPnlSensitivityConfig,
  loadDerivedMonthPnlSensitivityInputs,
  resolveDerivedMonthPnlSensitivityInputStatus,
  serializeDerivedMonthPnlSensitivityHtml,
  serializeDerivedMonthPnlSensitivityReport,
} from "@/lib/data/research/derivedMonthPnlSensitivity";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  formatStdoutOutput,
  mapCommandError,
  parseHtmlOutputPathFromArgv,
  parseInputPathsFromArgv,
  parseOutputPathFromArgv,
  parseSensitiveMonthFromArgv,
  readOptionalFlag,
} from "./buildDerivedMonthPnlSensitivityTypes";
import type { DerivedMonthPnlSensitivityCommandIo } from "./buildDerivedMonthPnlSensitivityTypes";

export function runDerivedMonthPnlSensitivityCommand(
  argv: readonly string[],
  io: DerivedMonthPnlSensitivityCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const outputPath = parseOutputPathFromArgv(argv);
    const htmlOutputPath = parseHtmlOutputPathFromArgv(argv);
    const inputPaths = parseInputPathsFromArgv(argv);
    const sensitiveMonth =
      parseSensitiveMonthFromArgv(argv)
      ?? readOptionalFlag(argv, "--exclude-month")
      ?? "2025-12";
    const excludeMonth = readOptionalFlag(argv, "--exclude-month") ?? sensitiveMonth;
    const generatedAt = options?.generatedAt ?? new Date().toISOString();
    const config = createDerivedMonthPnlSensitivityConfig({
      sensitiveMonth,
      excludeMonth,
    });

    const loadedInputs = loadDerivedMonthPnlSensitivityInputs({ inputPaths, io });
    const inputStatus = resolveDerivedMonthPnlSensitivityInputStatus(
      io,
      inputPaths,
      loadedInputs.derivedMarketKeys.size,
      loadedInputs.usesSensitiveMonthHeuristic,
    );
    const report = buildDerivedMonthPnlSensitivityReport({
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
    io.writeFile(outputPath, serializeDerivedMonthPnlSensitivityReport(report));
    io.writeFile(htmlOutputPath, serializeDerivedMonthPnlSensitivityHtml(report));

    io.writeStdout(
      formatStdoutOutput(
        stableStringify({
          outputPath: report.outputPath,
          htmlOutputPath: report.htmlOutputPath,
          familyRecommendation: report.summary.familyRecommendation,
          recommendFullM12: report.summary.recommendFullM12,
          fullCorpusNetPnlCents: report.summary.fullCorpusNetPnlCents,
          excludingSensitiveMonthNetPnlCents:
            report.summary.excludingSensitiveMonthNetPnlCents,
          sensitiveMonthOnlyNetPnlCents: report.summary.sensitiveMonthOnlyNetPnlCents,
          netPnlRetentionShare: report.summary.netPnlRetentionShare,
          hypothesisSignFlips: report.summary.hypothesisSignFlips,
          sideSignFlips: report.summary.sideSignFlips,
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
  const exitCode = runDerivedMonthPnlSensitivityCommand(process.argv.slice(2), {
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
  buildDefaultDerivedMonthPnlSensitivityInputPaths,
  DerivedMonthPnlSensitivityCommandError,
  formatStdoutOutput,
  parseHtmlOutputPathFromArgv,
  parseInputPathsFromArgv,
  parseOutputPathFromArgv,
} from "./buildDerivedMonthPnlSensitivityTypes";
