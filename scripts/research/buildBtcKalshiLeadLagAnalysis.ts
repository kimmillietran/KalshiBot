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

type ArtifactPublish = {
  outputPath: string;
  data: string;
};

type PreparedArtifactPublish = ArtifactPublish & {
  tempPath: string;
  backupPath: string;
  backupCreated: boolean;
  committed: boolean;
};

function cleanupIfPresent(
  io: Pick<BtcKalshiLeadLagAnalysisCommandIo, "fileExists" | "unlinkFile">,
  path: string,
): void {
  if (io.fileExists(path)) {
    io.unlinkFile(path);
  }
}

function rollbackPublishedArtifacts(
  io: Pick<BtcKalshiLeadLagAnalysisCommandIo, "fileExists" | "unlinkFile" | "renameFile">,
  artifacts: readonly PreparedArtifactPublish[],
): void {
  for (const artifact of [...artifacts].reverse()) {
    if (artifact.committed) {
      cleanupIfPresent(io, artifact.outputPath);
    }

    if (artifact.backupCreated && io.fileExists(artifact.backupPath)) {
      io.renameFile(artifact.backupPath, artifact.outputPath);
    }

    cleanupIfPresent(io, artifact.tempPath);
  }
}

function publishArtifactsAtomically(
  io: Pick<BtcKalshiLeadLagAnalysisCommandIo, "writeFile" | "fileExists" | "unlinkFile" | "renameFile">,
  artifacts: readonly ArtifactPublish[],
): void {
  const preparedArtifacts = artifacts.map((artifact, index) => ({
    ...artifact,
    tempPath: `${artifact.outputPath}.${process.pid}.${index}.tmp`,
    backupPath: `${artifact.outputPath}.${process.pid}.${index}.bak`,
    backupCreated: false,
    committed: false,
  }));

  try {
    for (const artifact of preparedArtifacts) {
      io.writeFile(artifact.tempPath, artifact.data);
    }

    for (const artifact of preparedArtifacts) {
      if (io.fileExists(artifact.outputPath)) {
        io.renameFile(artifact.outputPath, artifact.backupPath);
        artifact.backupCreated = true;
      }

      io.renameFile(artifact.tempPath, artifact.outputPath);
      artifact.committed = true;
    }

    for (const artifact of preparedArtifacts) {
      if (artifact.backupCreated) {
        cleanupIfPresent(io, artifact.backupPath);
      }
    }
  } catch (error) {
    rollbackPublishedArtifacts(io, preparedArtifacts);
    throw error;
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
    publishArtifactsAtomically(io, [
      { outputPath, data: serializedReport },
      { outputPath: htmlOutputPath, data: serializedHtml },
    ]);

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
