import { dirname } from "node:path";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";

import {
  buildOrderbookReconstructionAuditReport,
  parseOrderbookReconstructionAuditArgv,
  serializeOrderbookReconstructionAuditHtml,
  serializeOrderbookReconstructionAuditReport,
} from "@/lib/data/research/orderbookReconstructionAudit";
import { stableStringify } from "@/lib/trading/config/hashConfig";

export type OrderbookReconstructionAuditCommandIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options?: { recursive?: boolean }) => void;
};

export function runOrderbookReconstructionAuditCommand(
  argv: readonly string[],
  io: OrderbookReconstructionAuditCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const { outputPath, htmlOutputPath, config } =
      parseOrderbookReconstructionAuditArgv(argv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const report = buildOrderbookReconstructionAuditReport({
      generatedAt,
      outputPath,
      htmlOutputPath,
      config,
      io,
    });

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.mkdirSync(dirname(htmlOutputPath), { recursive: true });
    io.writeFile(outputPath, serializeOrderbookReconstructionAuditReport(report));
    io.writeFile(htmlOutputPath, serializeOrderbookReconstructionAuditHtml(report));

    io.writeStdout(
      `${stableStringify({
        outputPath: report.outputPath,
        htmlOutputPath: report.htmlOutputPath,
        rootCauseClassification: report.summary.rootCauseClassification,
        recommendedNextFix: report.summary.recommendedNextFix,
        messagesScanned: report.summary.messagesScanned,
        topOfBookRecordsCompared: report.summary.topOfBookRecordsCompared,
        matchedTopOfBookRecords: report.summary.matchedTopOfBookRecords,
        mismatchedTopOfBookRecords: report.summary.mismatchedTopOfBookRecords,
        crossedRecordsExplained: report.summary.crossedRecordsExplained,
      })}\n`,
    );

    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Orderbook reconstruction audit failed.";
    io.writeStderr(`${message}\n`);
    return 1;
  }
}

function main(): void {
  const exitCode = runOrderbookReconstructionAuditCommand(process.argv.slice(2), {
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
