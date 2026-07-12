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
  io: Pick<ParityNearMissAnalysisCommandIo, "fileExists" | "unlinkFile">,
  path: string,
): void {
  if (io.fileExists(path)) {
    io.unlinkFile(path);
  }
}

function rollbackPublishedArtifacts(
  io: Pick<ParityNearMissAnalysisCommandIo, "fileExists" | "unlinkFile" | "renameFile">,
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
  io: Pick<ParityNearMissAnalysisCommandIo, "writeFile" | "fileExists" | "unlinkFile" | "renameFile">,
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
    publishArtifactsAtomically(io, [
      { outputPath, data: serializedReport },
      { outputPath: htmlOutputPath, data: serializedHtml },
    ]);

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
