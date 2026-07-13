import { dirname, join } from "node:path";
import { mkdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";

import {
  buildCaptureHealthAuditReport,
  CAPTURE_HEALTH_AUDIT_FILENAME,
  createCaptureHealthAuditConfig,
  serializeCaptureHealthAuditHtml,
  serializeCaptureHealthAuditReport,
} from "@/lib/data/research/captureHealthAudit";
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

function writeFileAtomically(
  io: Pick<CaptureHealthAuditCommandIo, "writeFile"> & {
    fileExists?: (path: string) => boolean;
    unlinkFile?: (path: string) => void;
    renameFile?: (from: string, to: string) => void;
  },
  outputPath: string,
  data: string,
): void {
  const tempPath = `${outputPath}.${process.pid}.tmp`;
  io.writeFile(tempPath, data);

  if (io.renameFile && io.fileExists && io.unlinkFile) {
    try {
      io.renameFile(tempPath, outputPath);
      return;
    } catch {
      if (io.fileExists(outputPath)) {
        io.unlinkFile(outputPath);
      }
      io.renameFile(tempPath, outputPath);
      return;
    }
  }

  io.writeFile(outputPath, data);
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
    const runScopedOutputPath = join(
      captureRunDir.replace(/\\/g, "/"),
      CAPTURE_HEALTH_AUDIT_FILENAME,
    );
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

    writeFileAtomically(io, aggregateOutputPath, serializedReport);
    writeFileAtomically(io, runScopedOutputPath, runScopedSerialized);
    writeFileAtomically(io, htmlOutputPath, serializedHtml);

    if (report.summary.verdict !== "capture-research-ready") {
      io.writeStderr(
        `Capture health audit verdict: ${report.summary.verdict}\n`,
      );
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
