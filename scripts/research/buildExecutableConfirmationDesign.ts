import { dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import {
  buildExecutableConfirmationDesignReport,
  parseExecutableConfirmationDesignPathsFromArgv,
  serializeExecutableConfirmationDesignHtml,
  serializeExecutableConfirmationDesignReport,
} from "@/lib/data/research/executableConfirmationDesign";

import { normalizeExecutableConfirmationDesignArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  mapCommandError,
} from "./buildExecutableConfirmationDesignTypes";
import type { ExecutableConfirmationDesignCommandIo } from "./buildExecutableConfirmationDesignTypes";

export function runExecutableConfirmationDesignCommand(
  argv: readonly string[],
  io: ExecutableConfirmationDesignCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeExecutableConfirmationDesignArgv(argv);
    const { outputPath, htmlOutputPath, inputPaths } =
      parseExecutableConfirmationDesignPathsFromArgv(normalizedArgv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const report = buildExecutableConfirmationDesignReport({
      generatedAt,
      outputPath,
      htmlOutputPath,
      inputPaths,
      io,
    });

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.mkdirSync(dirname(htmlOutputPath), { recursive: true });
    io.writeFile(outputPath, serializeExecutableConfirmationDesignReport(report));
    io.writeFile(htmlOutputPath, serializeExecutableConfirmationDesignHtml(report));

    io.writeStdout(
      formatStdoutOutput(
        JSON.stringify({
          outputPath: report.outputPath,
          htmlOutputPath: report.htmlOutputPath,
          confirmationSupported: report.summary.confirmationSupported,
          confirmationStatus: report.summary.confirmationStatus,
          recommendedNextFix: report.summary.recommendedNextFix,
          candidateCountAssessed: report.summary.candidateCountAssessed,
          confirmedExecutableCandidateCount:
            report.summary.confirmedExecutableCandidateCount,
          missingDataFields: report.summary.missingDataFields,
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
  const exitCode = runExecutableConfirmationDesignCommand(process.argv.slice(2), {
    readFile: (path) => readFileSync(path, "utf8").replace(/^\uFEFF/, ""),
    fileExists: (path) => existsSync(path),
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
