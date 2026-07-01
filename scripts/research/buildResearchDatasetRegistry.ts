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
  buildResearchDatasetRegistryFromDirectories,
  buildResearchDatasetRegistryOutputPaths,
  ResearchDatasetRegistryError,
  serializeResearchDatasetSeriesRegistry,
} from "@/lib/data/research/registry";

import {
  BuildResearchDatasetRegistryCommandError,
  formatStdoutOutput,
  parseFixturesDirFromArgv,
  parseMetadataDirFromArgv,
  parseOutputDirFromArgv,
} from "./buildResearchDatasetRegistryTypes";
import type { BuildResearchDatasetRegistryCommandIo } from "./buildResearchDatasetRegistryTypes";

function mapCommandError(error: unknown): string {
  if (error instanceof BuildResearchDatasetRegistryCommandError) {
    return error.message;
  }

  if (error instanceof ResearchDatasetRegistryError) {
    return error.message;
  }

  return error instanceof Error
    ? error.message
    : "Research dataset registry build failed";
}

export function runBuildResearchDatasetRegistryCommand(
  argv: readonly string[],
  io: BuildResearchDatasetRegistryCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const fixturesRoot = parseFixturesDirFromArgv(argv);
    const metadataRoot = parseMetadataDirFromArgv(argv);
    const outputRoot = parseOutputDirFromArgv(argv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const registries = buildResearchDatasetRegistryFromDirectories(
      fixturesRoot,
      metadataRoot,
      {
        readdir: (path) => io.readdir(path),
        readFile: (path) => io.readFile(path),
        fileExists: (path) => io.fileExists(path),
        isDirectory: (path) => io.isDirectory(path),
      },
      { generatedAt },
    );

    const outputPaths = buildResearchDatasetRegistryOutputPaths(outputRoot, registries);

    for (let index = 0; index < registries.length; index += 1) {
      const registry = registries[index];
      const outputPath = outputPaths[index];
      if (!registry || !outputPath) {
        continue;
      }

      io.mkdirSync(dirname(outputPath), { recursive: true });
      io.writeFile(outputPath, serializeResearchDatasetSeriesRegistry(registry));
    }

    io.writeStdout(
      formatStdoutOutput(
        JSON.stringify({
          fixturesRoot,
          metadataRoot,
          outputRoot,
          seriesCount: registries.length,
          marketCount: registries.reduce(
            (total, registry) => total + registry.summary.marketCount,
            0,
          ),
          outputPaths,
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
  const exitCode = runBuildResearchDatasetRegistryCommand(process.argv.slice(2), {
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
    mkdirSync: (path, options) => {
      mkdirSync(path, options);
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
  BuildResearchDatasetRegistryCommandError,
  formatStdoutOutput,
  parseFixturesDirFromArgv,
  parseMetadataDirFromArgv,
  parseOutputDirFromArgv,
} from "./buildResearchDatasetRegistryTypes";
