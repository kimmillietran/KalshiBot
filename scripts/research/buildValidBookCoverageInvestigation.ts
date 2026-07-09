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
  buildValidBookCoverageInvestigationReport,
  parseValidBookCoverageInvestigationPathsFromArgv,
  serializeValidBookCoverageInvestigationHtml,
  serializeValidBookCoverageInvestigationReport,
} from "@/lib/data/research/validBookCoverageInvestigation";
import { stableStringify } from "@/lib/trading/config/hashConfig";

export type ValidBookCoverageInvestigationCommandIo = {
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

  return "Valid book coverage investigation failed.";
}

export function runValidBookCoverageInvestigationCommand(
  argv: readonly string[],
  io: ValidBookCoverageInvestigationCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const { outputPath, htmlOutputPath, inputPaths } =
      parseValidBookCoverageInvestigationPathsFromArgv(argv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const report = buildValidBookCoverageInvestigationReport({
      generatedAt,
      outputPath,
      htmlOutputPath,
      inputPaths,
      io,
    });

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.mkdirSync(dirname(htmlOutputPath), { recursive: true });
    io.writeFile(outputPath, serializeValidBookCoverageInvestigationReport(report));
    io.writeFile(
      htmlOutputPath,
      serializeValidBookCoverageInvestigationHtml(report),
    );

    io.writeStdout(
      formatStdoutOutput(
        stableStringify({
          outputPath: report.outputPath,
          htmlOutputPath: report.htmlOutputPath,
          rootCauseClassification: report.summary.rootCauseClassification,
          recommendedNextFix: report.summary.recommendedNextFix,
          captureValidRecords: report.summary.captureValidRecords,
          economicallyValidRecords: report.summary.economicallyValidRecords,
          parityUsableRecords: report.summary.parityUsableRecords,
          crossedImpliedBookRecords: report.summary.crossedImpliedBookRecords,
          scannerFieldMappingOk: report.summary.scannerFieldMappingOk,
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
  const exitCode = runValidBookCoverageInvestigationCommand(process.argv.slice(2), {
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
