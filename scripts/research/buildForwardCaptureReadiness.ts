import { dirname } from "node:path";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";

import {
  buildForwardCaptureReadinessReport,
  parseForwardCaptureReadinessPathsFromArgv,
  serializeForwardCaptureReadinessHtml,
  serializeForwardCaptureReadinessReport,
} from "@/lib/data/research/forwardCaptureReadiness";

import { normalizeForwardCaptureReadinessArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  mapCommandError,
} from "./buildForwardCaptureReadinessTypes";
import type { ForwardCaptureReadinessCommandIo } from "./buildForwardCaptureReadinessTypes";

export function runForwardCaptureReadinessCommand(
  argv: readonly string[],
  io: ForwardCaptureReadinessCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeForwardCaptureReadinessArgv(argv);
    const { outputPath, htmlOutputPath, inputPaths } =
      parseForwardCaptureReadinessPathsFromArgv(normalizedArgv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const report = buildForwardCaptureReadinessReport({
      generatedAt,
      outputPath,
      htmlOutputPath,
      inputPaths,
      io,
    });

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.mkdirSync(dirname(htmlOutputPath), { recursive: true });
    io.writeFile(outputPath, serializeForwardCaptureReadinessReport(report));
    io.writeFile(htmlOutputPath, serializeForwardCaptureReadinessHtml(report));

    io.writeStdout(
      formatStdoutOutput(
        JSON.stringify({
          outputPath: report.outputPath,
          htmlOutputPath: report.htmlOutputPath,
          overallVerdict: report.summary.overallVerdict,
          recommendedNextAction: report.summary.recommendedNextAction,
          runCount: report.aggregates.runCount,
          totalDurationMinutes: report.aggregates.totalDurationMinutes,
          topOfBookRecordCount: report.aggregates.topOfBookRecordCount,
          btcSpotRecordCount: report.aggregates.btcSpotRecordCount,
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
  const exitCode = runForwardCaptureReadinessCommand(process.argv.slice(2), {
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
