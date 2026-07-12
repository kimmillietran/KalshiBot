import { dirname } from "node:path";
import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";

import {
  buildParityNearMissAnalysisReport,
  createParityNearMissAnalysisIo,
  parseParityNearMissAnalysisArgv,
  serializeParityNearMissAnalysisHtml,
  serializeParityNearMissAnalysisReport,
} from "@/lib/data/research/parityNearMissAnalysis";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  formatCommandError,
  type ParityNearMissAnalysisCommandIo,
} from "./buildParityNearMissAnalysisTypes";

function writeFileAtomically(
  io: Pick<ParityNearMissAnalysisCommandIo, "writeFile" | "fileExists" | "unlinkFile" | "renameFile">,
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

export async function runParityNearMissAnalysisCommand(
  argv: readonly string[],
  io: ParityNearMissAnalysisCommandIo,
  options?: { generatedAt?: string },
): Promise<number> {
  try {
    const { outputPath, htmlOutputPath, config } = parseParityNearMissAnalysisArgv(argv);
    const report = await buildParityNearMissAnalysisReport({
      generatedAt: options?.generatedAt ?? new Date().toISOString(),
      outputPath,
      htmlOutputPath,
      config,
      io: createParityNearMissAnalysisIo(),
    });

    const serializedReport = serializeParityNearMissAnalysisReport(report);
    const serializedHtml = serializeParityNearMissAnalysisHtml(report);

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.mkdirSync(dirname(htmlOutputPath), { recursive: true });
    writeFileAtomically(io, outputPath, serializedReport);
    writeFileAtomically(io, htmlOutputPath, serializedHtml);

    io.writeStdout(
      `${stableStringify({
        outputPath: report.outputPath,
        htmlOutputPath: report.htmlOutputPath,
        analysisScope: report.analysisScope,
        selectedRunId: report.selectedRunId,
        recordsScanned: report.recordsScanned,
        interpretationClassification: report.summary.interpretationClassification,
        recommendedNextAction: report.summary.recommendedNextAction,
        candidateCount: report.summary.candidateCount,
        closestGrossNearMissCents: report.summary.closestGrossNearMissCents,
        ruleConfigurationHash: report.ruleConfigurationHash,
        warnings: report.warnings,
      })}\n`,
    );

    return 0;
  } catch (error) {
    io.writeStderr(`${formatCommandError(error)}\n`);
    return 1;
  }
}

async function main(): Promise<void> {
  const exitCode = await runParityNearMissAnalysisCommand(process.argv.slice(2), {
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
