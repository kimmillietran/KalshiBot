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
  buildStrategyEvaluationReadinessReport,
  parseStrategyEvaluationReadinessPathsFromArgv,
  serializeStrategyEvaluationReadinessHtml,
  serializeStrategyEvaluationReadinessReport,
} from "@/lib/data/research/strategyEvaluationReadiness";
import { stableStringify } from "@/lib/trading/config/hashConfig";

export type StrategyEvaluationReadinessCommandIo = {
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

  return "Strategy evaluation readiness gate failed.";
}

export function runStrategyEvaluationReadinessCommand(
  argv: readonly string[],
  io: StrategyEvaluationReadinessCommandIo,
  options?: { generatedAt?: string; evaluatedAt?: string },
): number {
  try {
    const { outputPath, htmlOutputPath, inputPaths } =
      parseStrategyEvaluationReadinessPathsFromArgv(argv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const report = buildStrategyEvaluationReadinessReport({
      generatedAt,
      evaluatedAt: options?.evaluatedAt ?? generatedAt,
      outputPath,
      htmlOutputPath,
      inputPaths,
      io,
    });

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.mkdirSync(dirname(htmlOutputPath), { recursive: true });
    io.writeFile(outputPath, serializeStrategyEvaluationReadinessReport(report));
    io.writeFile(htmlOutputPath, serializeStrategyEvaluationReadinessHtml(report));

    io.writeStdout(
      formatStdoutOutput(
        stableStringify({
          outputPath: report.outputPath,
          htmlOutputPath: report.htmlOutputPath,
          overallVerdict: report.summary.overallVerdict,
          recommendedNextAction: report.summary.recommendedNextAction,
          blockingReasons: report.summary.blockingReasons,
          missingArtifacts: report.summary.missingArtifacts,
          inputArtifactsUsed: report.summary.inputArtifactsUsed,
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
  const exitCode = runStrategyEvaluationReadinessCommand(process.argv.slice(2), {
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
