import { dirname } from "node:path";
import { mkdirSync, statSync, writeFileSync } from "node:fs";

import {
  buildCaptureHealthAuditReport,
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

export async function runCaptureHealthAuditCommand(
  argv: readonly string[],
  io: CaptureHealthAuditCommandIo,
  options?: { generatedAt?: string },
): Promise<number> {
  try {
    const normalizedArgv = normalizeCaptureHealthAuditArgv(argv);
    const captureRunDir = parseCaptureRunDirFromArgv(normalizedArgv);
    const outputPath = parseOutputPathFromArgv(normalizedArgv);
    const htmlOutputPath = parseHtmlOutputPathFromArgv(normalizedArgv);
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
      outputPath,
      htmlOutputPath,
      captureRunDir,
      config,
      io,
    });

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.mkdirSync(dirname(htmlOutputPath), { recursive: true });
    io.writeFile(outputPath, serializeCaptureHealthAuditReport(report));
    io.writeFile(htmlOutputPath, serializeCaptureHealthAuditHtml(report));

    io.writeStdout(
      formatStdoutOutput(
        stableStringify({
          outputPath: report.outputPath,
          htmlOutputPath: report.htmlOutputPath,
          captureRunDir: report.captureRunDir,
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
  });

  process.exitCode = exitCode;
}

if (process.env.VITEST !== "true") {
  void main();
}
