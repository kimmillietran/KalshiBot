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
  buildCaptureQualityValidationReport,
  createCaptureQualityValidationConfig,
  parseCaptureQualityValidationArgv,
  serializeCaptureQualityValidationHtml,
  serializeCaptureQualityValidationReport,
} from "@/lib/data/research/captureQualityValidation";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { normalizeCaptureQualityValidationArgv } from "../lib/cliArgvSchemas";

export type CaptureQualityValidationCommandIo = {
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

  return "Capture quality validation failed.";
}

export function runCaptureQualityValidationCommand(
  argv: readonly string[],
  io: CaptureQualityValidationCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const parsed = parseCaptureQualityValidationArgv(
      normalizeCaptureQualityValidationArgv(argv),
    );
    const generatedAt = options?.generatedAt ?? new Date().toISOString();
    const config = createCaptureQualityValidationConfig({
      forwardQuotesDir: parsed.forwardQuotesDir,
      thresholds: parsed.thresholdOverrides,
    });

    const report = buildCaptureQualityValidationReport({
      generatedAt,
      outputPath: parsed.outputPath,
      htmlOutputPath: parsed.htmlOutputPath,
      config,
      io,
    });

    io.mkdirSync(dirname(parsed.outputPath), { recursive: true });
    io.mkdirSync(dirname(parsed.htmlOutputPath), { recursive: true });
    io.writeFile(parsed.outputPath, serializeCaptureQualityValidationReport(report));
    io.writeFile(parsed.htmlOutputPath, serializeCaptureQualityValidationHtml(report));

    io.writeStdout(
      formatStdoutOutput(
        stableStringify({
          outputPath: report.outputPath,
          htmlOutputPath: report.htmlOutputPath,
          runsScanned: report.summary.runsScanned,
          runsValidated: report.summary.runsValidated,
          recommendedNextAction: report.summary.recommendedNextAction,
          warningCount: report.warnings.length,
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
  const exitCode = runCaptureQualityValidationCommand(process.argv.slice(2), {
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
