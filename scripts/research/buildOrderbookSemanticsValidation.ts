import { dirname } from "node:path";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";

import {
  buildOrderbookSemanticsValidationReport,
  parseOrderbookSemanticsValidationArgv,
  serializeOrderbookSemanticsValidationHtml,
  serializeOrderbookSemanticsValidationReport,
} from "@/lib/data/research/orderbookSemanticsValidation";
import { stableStringify } from "@/lib/trading/config/hashConfig";

export type OrderbookSemanticsValidationCommandIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options?: { recursive?: boolean }) => void;
};

export function runOrderbookSemanticsValidationCommand(
  argv: readonly string[],
  io: OrderbookSemanticsValidationCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const { outputPath, htmlOutputPath, config } =
      parseOrderbookSemanticsValidationArgv(argv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const report = buildOrderbookSemanticsValidationReport({
      generatedAt,
      outputPath,
      htmlOutputPath,
      config,
      io,
    });

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.mkdirSync(dirname(htmlOutputPath), { recursive: true });
    io.writeFile(outputPath, serializeOrderbookSemanticsValidationReport(report));
    io.writeFile(htmlOutputPath, serializeOrderbookSemanticsValidationHtml(report));

    io.writeStdout(
      `${stableStringify({
        outputPath: report.outputPath,
        htmlOutputPath: report.htmlOutputPath,
        recommendedPricingModel: report.summary.recommendedPricingModel,
        recommendedNextFix: report.summary.recommendedNextFix,
        rootCauseClassification: report.summary.rootCauseClassification,
        confidence: report.summary.confidence,
        crossedShareComplementModel: report.summary.crossedShareComplementModel,
        crossedShareSynchronizedModel: report.summary.crossedShareSynchronizedModel,
        freshDualSideRecordCount: report.summary.freshDualSideRecordCount,
        freshDualSideCrossedCount: report.summary.freshDualSideCrossedCount,
        explicitAskFieldsFound: report.summary.explicitAskFieldsFound,
        yesNoBidLaddersFound: report.summary.yesNoBidLaddersFound,
      })}\n`,
    );

    return 0;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Orderbook semantics validation failed.";
    io.writeStderr(`${message}\n`);
    return 1;
  }
}

function main(): void {
  const exitCode = runOrderbookSemanticsValidationCommand(process.argv.slice(2), {
    readFile: (path) => readFileSync(path, "utf8").replace(/^\uFEFF/, ""),
    fileExists: (path) => existsSync(path),
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
