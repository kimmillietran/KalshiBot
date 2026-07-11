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
  argvToConfig,
  buildCaptureBaselineComparisonReport,
  CaptureBaselineComparisonError,
  createCaptureBaselineComparisonConfig,
  parseCaptureBaselineComparisonArgv,
  serializeCaptureBaselineComparisonHtml,
  serializeCaptureBaselineComparisonReport,
} from "@/lib/data/research/captureBaselineComparison";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { normalizeCaptureBaselineComparisonArgv } from "../lib/cliArgvSchemas";

function main(): void {
  try {
    const argv = normalizeCaptureBaselineComparisonArgv(process.argv.slice(2));
    const parsed = parseCaptureBaselineComparisonArgv(argv);
    const config = createCaptureBaselineComparisonConfig(argvToConfig(parsed));

    const report = buildCaptureBaselineComparisonReport({
      generatedAt: new Date().toISOString(),
      outputPath: parsed.outputPath,
      htmlOutputPath: parsed.htmlOutputPath,
      config,
      io: {
        readFile: (path) => readFileSync(path, "utf8").replace(/^\uFEFF/, ""),
        fileExists: (path) => existsSync(path),
        readdir: (path) => readdirSync(path),
        isDirectory: (path) => statSync(path).isDirectory(),
      },
    });

    mkdirSync(dirname(parsed.outputPath), { recursive: true });
    mkdirSync(dirname(parsed.htmlOutputPath), { recursive: true });
    writeFileSync(parsed.outputPath, serializeCaptureBaselineComparisonReport(report), "utf8");
    writeFileSync(parsed.htmlOutputPath, serializeCaptureBaselineComparisonHtml(report), "utf8");

    process.stdout.write(
      `${stableStringify({
        outputPath: report.outputPath,
        htmlOutputPath: report.htmlOutputPath,
        overallVerdict: report.summary.overallVerdict,
        recommendedNextAction: report.summary.recommendedNextAction,
        currentBottleneck: report.summary.currentBottleneck,
        improvementCount: report.summary.improvements.length,
        regressionCount: report.summary.regressions.length,
        baselineLabel: report.baseline.label,
        comparisonLabel: report.comparison.label,
        bidSizeCoverageShare: report.comparison.bidSizeCoverageShare,
        warningCount: report.summary.warnings.length,
      })}\n`,
    );
  } catch (error) {
    if (error instanceof CaptureBaselineComparisonError) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

if (process.env.VITEST !== "true") {
  main();
}
