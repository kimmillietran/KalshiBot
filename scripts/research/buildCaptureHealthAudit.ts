import { dirname } from "node:path";
import { mkdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";

import {
  buildCaptureHealthAuditReport,
  CAPTURE_HEALTH_AUDIT_FILENAME,
  createCaptureHealthAuditConfig,
  serializeCaptureHealthAuditHtml,
  serializeCaptureHealthAuditReport,
} from "@/lib/data/research/captureHealthAudit";
import { publishResearchArtifactsAtomically } from "@/lib/data/research/calibrationFadeForwardValidation";
import { createFilesystemJsonlIo } from "@/lib/data/research/jsonl";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { normalizeCaptureHealthAuditArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  mapCommandError,
  parseCaptureRunDirFromArgv,
  parseHtmlOutputPathFromArgv,
  parseOutputPathFromArgv,
  parseThresholdOverridesFromArgv,
} from "./buildCaptureHealthAuditTypes";
import type { CaptureHealthAuditCommandIo } from "./buildCaptureHealthAuditTypes";

function requirePublishIo(
  io: CaptureHealthAuditCommandIo,
): CaptureHealthAuditCommandIo & {
  fileExists: (path: string) => boolean;
  unlinkFile: (path: string) => void;
  renameFile: (from: string, to: string) => void;
} {
  if (!io.fileExists || !io.unlinkFile || !io.renameFile) {
    throw new Error(
      "Capture health audit publication requires fileExists, unlinkFile, and renameFile IO methods.",
    );
  }
  return io as CaptureHealthAuditCommandIo & {
    fileExists: (path: string) => boolean;
    unlinkFile: (path: string) => void;
    renameFile: (from: string, to: string) => void;
  };
}

export async function runCaptureHealthAuditCommand(
  argv: readonly string[],
  io: CaptureHealthAuditCommandIo,
  options?: { generatedAt?: string },
): Promise<number> {
  try {
    const normalizedArgv = normalizeCaptureHealthAuditArgv(argv);
    const captureRunDir = parseCaptureRunDirFromArgv(normalizedArgv);
    const aggregateOutputPath = parseOutputPathFromArgv(normalizedArgv);
    const htmlOutputPath = parseHtmlOutputPathFromArgv(normalizedArgv);
    const runScopedOutputPath =
      `${captureRunDir.replace(/\\/g, "/").replace(/\/$/, "")}/${CAPTURE_HEALTH_AUDIT_FILENAME}`;
    const thresholdOverrides = parseThresholdOverridesFromArgv(normalizedArgv);
    const config = createCaptureHealthAuditConfig({
      ...(thresholdOverrides.minDurationSeconds !== undefined
        ? { minDurationSeconds: thresholdOverrides.minDurationSeconds }
        : {}),
      ...(thresholdOverrides.maxP90TopOfBookGapMs !== undefined
        ? { maxP90TopOfBookGapMs: thresholdOverrides.maxP90TopOfBookGapMs }
        : {}),
      ...(thresholdOverrides.minValidBookShare !== undefined
        ? { minValidBookShare: thresholdOverrides.minValidBookShare }
        : {}),
      ...(thresholdOverrides.minBtcJoinCoverageShare !== undefined
        ? { minBtcJoinCoverageShare: thresholdOverrides.minBtcJoinCoverageShare }
        : {}),
      ...(thresholdOverrides.maxZeroSpreadShare !== undefined
        ? { maxZeroSpreadShare: thresholdOverrides.maxZeroSpreadShare }
        : {}),
      ...(thresholdOverrides.btcJoinMaxDistanceMs !== undefined
        ? { btcJoinMaxDistanceMs: thresholdOverrides.btcJoinMaxDistanceMs }
        : {}),
    });
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const report = await buildCaptureHealthAuditReport({
      generatedAt,
      outputPath: aggregateOutputPath,
      htmlOutputPath,
      captureRunDir,
      config,
      io,
    });

    const serializedReport = serializeCaptureHealthAuditReport({
      ...report,
      outputPath: aggregateOutputPath,
    });
    const runScopedSerialized = serializeCaptureHealthAuditReport({
      ...report,
      outputPath: runScopedOutputPath,
    });
    const serializedHtml = serializeCaptureHealthAuditHtml(report);

    io.mkdirSync(dirname(aggregateOutputPath), { recursive: true });
    io.mkdirSync(dirname(htmlOutputPath), { recursive: true });
    io.mkdirSync(dirname(runScopedOutputPath), { recursive: true });

    const publishIo = requirePublishIo(io);
    publishResearchArtifactsAtomically(publishIo, [
      { outputPath: aggregateOutputPath, data: serializedReport },
      { outputPath: runScopedOutputPath, data: runScopedSerialized },
      { outputPath: htmlOutputPath, data: serializedHtml },
    ]);

    const pathSummary =
      `runScopedOutputPath=${runScopedOutputPath}; `
      + `aggregateOutputPath=${aggregateOutputPath}; `
      + `htmlOutputPath=${htmlOutputPath}`;

    if (report.summary.verdict !== "capture-research-ready") {
      // Intentional: write truthful audit artifacts, then exit nonzero so automation
      // can distinguish report generation from quality approval.
      io.writeStderr(
        `Capture health audit verdict: ${report.summary.verdict} (artifacts written; quality not approved)\n`,
      );
      io.writeStderr(`${pathSummary}\n`);
      return 1;
    }

    io.writeStdout(
      formatStdoutOutput(
        stableStringify({
          selectedRunId: report.selectedRunId,
          captureRunDir: report.captureRunDir,
          runScopedOutputPath,
          aggregateOutputPath,
          htmlOutputPath: report.htmlOutputPath,
          verdict: report.summary.verdict,
          recommendedNextAction: report.summary.recommendedNextAction,
          runDurationSeconds: report.summary.runDurationSeconds,
          topOfBookCount: report.summary.topOfBookCount,
          btcSpotCount: report.summary.btcSpotCount,
          validBookShare: report.summary.bookState.validBookShare,
          p90TopOfBookGapMs: report.summary.continuity.p90TopOfBookGapMs,
          btcJoinCoverageShare: report.summary.btcJoin.joinCoverageShare,
        }),
      ),
    );

    return 0;
  } catch (error) {
    io.writeStderr(`${mapCommandError(error)}\n`);
    return 1;
  }
}

async function main(): Promise<void> {
  const jsonlIo = createFilesystemJsonlIo();
  const exitCode = await runCaptureHealthAuditCommand(process.argv.slice(2), {
    ...jsonlIo,
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
    isDirectory: (path) => statSync(path).isDirectory(),
    fileExists: (path) => {
      try {
        statSync(path);
        return true;
      } catch {
        return false;
      }
    },
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
