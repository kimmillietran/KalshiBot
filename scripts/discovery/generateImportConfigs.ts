import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import {
  BatchImportConfigError,
  BatchImportConfigErrorCode,
  buildBatchImportConfigsFromDiscoveryJson,
} from "@/lib/data/importJobs/batchConfig";

import {
  formatStdoutOutput,
  GenerateImportConfigsCommandError,
  parseInputPathFromArgv,
  parseOutputDirFromArgv,
} from "./generateImportConfigsTypes";
import type { GenerateImportConfigsCommandIo } from "./generateImportConfigsTypes";

function mapCommandError(error: unknown): string {
  if (error instanceof GenerateImportConfigsCommandError) {
    return error.message;
  }

  if (error instanceof BatchImportConfigError) {
    return error.message;
  }

  if (error instanceof Error && "code" in error && error.code === "ENOENT") {
    return "Discovery input file was not found";
  }

  return error instanceof Error
    ? error.message
    : "Batch import config generation failed";
}

export function runGenerateImportConfigsCommand(
  argv: readonly string[],
  io: GenerateImportConfigsCommandIo,
): number {
  try {
    const inputPath = parseInputPathFromArgv(argv);
    const outputDir = parseOutputDirFromArgv(argv);
    const discoveryJson = io.readFile(inputPath);
    const result = buildBatchImportConfigsFromDiscoveryJson(discoveryJson, {
      outputRoot: outputDir,
    });

    for (const file of result.files) {
      mkdirSync(dirname(file.outputPath), { recursive: true });
      io.writeFile(file.outputPath, file.serialized);
    }

    io.writeStdout(
      formatStdoutOutput(
        JSON.stringify({
          inputPath,
          outputDir: result.outputRoot,
          seriesTicker: result.seriesTicker,
          configCount: result.files.length,
          outputPaths: result.files.map((file) => file.outputPath),
        }),
      ),
    );

    return 0;
  } catch (error) {
    if (
      error instanceof BatchImportConfigError
      && error.code === BatchImportConfigErrorCode.MISSING_DISCOVERY_FILE
    ) {
      io.writeStderr(`${error.message}\n`);
      return 1;
    }

    const message = mapCommandError(error);
    io.writeStderr(message.endsWith("\n") ? message : `${message}\n`);
    return 1;
  }
}

function main(): void {
  const exitCode = runGenerateImportConfigsCommand(process.argv.slice(2), {
    readFile: (path) => {
      try {
        return readFileSync(path, "utf8").replace(/^\uFEFF/, "");
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") {
          throw new BatchImportConfigError(
            "Discovery input file was not found",
            BatchImportConfigErrorCode.MISSING_DISCOVERY_FILE,
          );
        }

        throw error;
      }
    },
    writeStdout: (text) => {
      process.stdout.write(text);
    },
    writeStderr: (text) => {
      process.stderr.write(text);
    },
    writeFile: (path, data) => {
      writeFileSync(path, data, "utf8");
    },
  });

  process.exitCode = exitCode;
}

if (process.env.VITEST !== "true") {
  main();
}

export {
  formatStdoutOutput,
  GenerateImportConfigsCommandError,
  parseInputPathFromArgv,
  parseOutputDirFromArgv,
} from "./generateImportConfigsTypes";
