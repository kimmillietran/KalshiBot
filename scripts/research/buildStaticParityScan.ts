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
  buildStaticParityScanReport,
  parseStaticParityScanFrictionFromArgv,
  parseStaticParityScanPathsFromArgv,
  serializeStaticParityScanHtml,
  serializeStaticParityScanReport,
} from "@/lib/data/research/staticParityScan";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { normalizeStaticParityScanArgv } from "../lib/cliArgvSchemas";

export type StaticParityScanCommandIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  readdir: (path: string) => readonly string[];
  isDirectory: (path: string) => boolean;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options?: { recursive?: boolean }) => void;
};

export function formatStdoutOutput(text: string): string {
  return `${text}\n`;
}

export function mapCommandError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Static parity scan failed.";
}

export function runStaticParityScanCommand(
  argv: readonly string[],
  io: StaticParityScanCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeStaticParityScanArgv(argv);
    const { outputPath, htmlOutputPath, inputPaths } =
      parseStaticParityScanPathsFromArgv(normalizedArgv);
    const friction = parseStaticParityScanFrictionFromArgv(normalizedArgv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const report = buildStaticParityScanReport({
      generatedAt,
      outputPath,
      htmlOutputPath,
      inputPaths,
      friction,
      io,
    });

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.mkdirSync(dirname(htmlOutputPath), { recursive: true });
    io.writeFile(outputPath, serializeStaticParityScanReport(report));
    io.writeFile(htmlOutputPath, serializeStaticParityScanHtml(report));

    io.writeStdout(
      formatStdoutOutput(
        stableStringify({
          outputPath: report.outputPath,
          htmlOutputPath: report.htmlOutputPath,
          analysisScope: report.analysisScope,
          selectedRunId: report.selectedRunId,
          sourceRunIds: report.sourceRunIds,
          pricingModel: report.summary.pricingModel,
          overallClassification: report.summary.overallClassification,
          recommendedNextAction: report.summary.recommendedNextAction,
          runCountScanned: report.metrics.runCountScanned,
          runsSkipped: report.metrics.runsSkipped,
          topOfBookRecordsScanned: report.metrics.topOfBookRecordsScanned,
          bidOnlyGrossCandidateCount: report.metrics.bidOnlyGrossCandidateCount,
          bidOnlyBufferAdjustedCandidateCount:
            report.metrics.bidOnlyBufferAdjustedCandidateCount,
          executableConfirmedCandidateCount:
            report.metrics.executableConfirmedCandidateCount,
          hasBidOnlyBufferAdjustedCandidates:
            report.summary.hasBidOnlyBufferAdjustedCandidates,
          requiresExecutableConfirmation:
            report.summary.requiresExecutableConfirmation,
          grossParityCandidateCount: report.metrics.grossParityCandidateCount,
          bufferAdjustedCandidateCount: report.metrics.bufferAdjustedCandidateCount,
          hasBufferAdjustedCandidates: report.summary.hasBufferAdjustedCandidates,
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
  const exitCode = runStaticParityScanCommand(process.argv.slice(2), {
    readFile: (path) => readFileSync(path, "utf8").replace(/^\uFEFF/, ""),
    fileExists: (path) => existsSync(path),
    readdir: (path) => readdirSync(path),
    isDirectory: (path) => statSync(path).isDirectory(),
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
