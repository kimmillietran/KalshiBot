import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";

import {
  buildDatasetManifestFromDirectory,
  DatasetRegistryError,
  serializeDatasetManifest,
} from "@/lib/data/datasets/registry";

import {
  BuildDatasetManifestCommandError,
  formatStdoutOutput,
  parseInputDirFromArgv,
  parseOutputPathFromArgv,
} from "./buildDatasetManifestTypes";
import type { BuildDatasetManifestCommandIo } from "./buildDatasetManifestTypes";

function mapCommandError(error: unknown): string {
  if (error instanceof BuildDatasetManifestCommandError) {
    return error.message;
  }

  if (error instanceof DatasetRegistryError) {
    return error.message;
  }

  return error instanceof Error
    ? error.message
    : "Dataset manifest build failed";
}

export function runBuildDatasetManifestCommand(
  argv: readonly string[],
  io: BuildDatasetManifestCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const inputDir = parseInputDirFromArgv(argv);
    const outputPath = parseOutputPathFromArgv(argv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();
    const manifest = buildDatasetManifestFromDirectory(
      inputDir,
      {
        readdir: (path) => io.readdir(path),
        readFile: (path) => io.readFile(path),
        fileExists: (path) => io.fileExists(path),
        isDirectory: (path) => io.isDirectory(path),
      },
      { generatedAt },
    );
    const serialized = serializeDatasetManifest(manifest);

    io.writeFile(outputPath, serialized);
    io.writeStdout(
      formatStdoutOutput(
        JSON.stringify({
          outputPath,
          inputDir: manifest.inputDir,
          marketCount: manifest.summary.marketCount,
          completeMarketCount: manifest.summary.completeMarketCount,
        }),
      ),
    );

    return 0;
  } catch (error) {
    const message = mapCommandError(error);
    io.writeStderr(message.endsWith("\n") ? message : `${message}\n`);
    return 1;
  }
}

function main(): void {
  const exitCode = runBuildDatasetManifestCommand(process.argv.slice(2), {
    readFile: (path) => readFileSync(path, "utf8").replace(/^\uFEFF/, ""),
    writeStdout: (text) => {
      process.stdout.write(text);
    },
    writeStderr: (text) => {
      process.stderr.write(text);
    },
    writeFile: (path, data) => {
      writeFileSync(path, data, "utf8");
    },
    readdir: (path) => readdirSync(path),
    fileExists: (path) => existsSync(path),
    isDirectory: (path) => statSync(path).isDirectory(),
  });

  process.exitCode = exitCode;
}

if (process.env.VITEST !== "true") {
  main();
}

export {
  BuildDatasetManifestCommandError,
  formatStdoutOutput,
  parseInputDirFromArgv,
  parseOutputPathFromArgv,
} from "./buildDatasetManifestTypes";
