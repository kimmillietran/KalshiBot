import { dirname } from "node:path";
import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";

import {
  BtcKalshiLeadLagAnalysisError,
  buildBtcKalshiLeadLagAnalysisReport,
  createBtcKalshiLeadLagAnalysisIo,
  parseBtcKalshiLeadLagAnalysisArgv,
  serializeBtcKalshiLeadLagAnalysisHtml,
  serializeBtcKalshiLeadLagAnalysisReport,
} from "@/lib/data/research/btcKalshiLeadLagAnalysis";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  formatCommandError,
  type BtcKalshiLeadLagAnalysisCommandIo,
} from "./buildBtcKalshiLeadLagAnalysisTypes";

function writeFileAtomically(
  io: Pick<BtcKalshiLeadLagAnalysisCommandIo, "writeFile" | "fileExists" | "unlinkFile" | "renameFile">,
  outputPath: string,
  data: string,
): void {
  const tempPath = `${outputPath}.${process.pid}.tmp`;
  io.writeFile(tempPath, data);

  try {
    io.renameFile(tempPath, outputPath);
  } catch {
    if (io.fileExists(outputPath)) {
      io.unlinkFile(outputPath);
    }
    io.renameFile(tempPath, outputPath);
  }
}

export async function runBtcKalshiLeadLagAnalysisCommand(
  argv: readonly string[],
  io: BtcKalshiLeadLagAnalysisCommandIo,
  options?: { generatedAt?: string },
): Promise<number> {
  try {
    const { outputPath, htmlOutputPath, eventsOutputPath, config } =
      parseBtcKalshiLeadLagAnalysisArgv(argv);
    const report = await buildBtcKalshiLeadLagAnalysisReport({
      generatedAt: options?.generatedAt ?? new Date().toISOString(),
      outputPath,
      htmlOutputPath,
      eventsOutputPath,
      config,
      io: createBtcKalshiLeadLagAnalysisIo(),
    });

    const serializedReport = serializeBtcKalshiLeadLagAnalysisReport(report);
    const serializedHtml = serializeBtcKalshiLeadLagAnalysisHtml(report);

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.mkdirSync(dirname(htmlOutputPath), { recursive: true });
    writeFileAtomically(io, outputPath, serializedReport);
    writeFileAtomically(io, htmlOutputPath, serializedHtml);

    io.writeStdout(
      `${stableStringify({
        outputPath: report.outputPath,
        htmlOutputPath: report.htmlOutputPath,
        eventsOutputPath: report.eventsOutputPath,
        analysisScope: report.analysisScope,
        selectedRunId: report.selectedRunId,
        recordsScanned: report.recordsScanned,
        btcRecordsScanned: report.btcRecordsScanned,
        triggerCount: report.triggerCount,
        eligibleTriggerCount: report.eligibleTriggerCount,
        interpretationClassification: report.summary.interpretationClassification,
        recommendedNextAction: report.summary.recommendedNextAction,
        configurationHash: report.configurationHash,
        warnings: report.warnings,
      })}\n`,
    );

    return 0;
  } catch (error) {
    if (error instanceof BtcKalshiLeadLagAnalysisError) {
      io.writeStderr(`${error.message}\n`);
      return 1;
    }
    io.writeStderr(`${formatCommandError(error)}\n`);
    return 1;
  }
}

async function main(): Promise<void> {
  const exitCode = await runBtcKalshiLeadLagAnalysisCommand(process.argv.slice(2), {
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
    fileExists: (path) => existsSync(path),
    unlinkFile: (path) => {
      unlinkSync(path);
    },
    renameFile: (from, to) => {
      renameSync(from, to);
    },
  });

  process.exitCode = exitCode;
}

if (process.env.VITEST !== "true") {
  void main();
}
