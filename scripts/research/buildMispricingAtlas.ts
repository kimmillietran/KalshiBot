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
  buildMispricingAtlasFromDirectories,
  serializeMispricingAtlas,
} from "@/lib/data/research/mispricingAtlas";

import { normalizeMispricingAtlasArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  mapCommandError,
  parseInputDirFromArgv,
  parseMemoryReportFlag,
  parseOutputPathFromArgv,
} from "./buildMispricingAtlasTypes";
import type { MispricingAtlasCommandIo } from "./buildMispricingAtlasTypes";

export function runMispricingAtlasCommand(
  argv: readonly string[],
  io: MispricingAtlasCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeMispricingAtlasArgv(argv);
    const inputRoot = parseInputDirFromArgv(normalizedArgv);
    const outputPath = parseOutputPathFromArgv(normalizedArgv);
    const memoryReport = parseMemoryReportFlag(normalizedArgv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const atlas = buildMispricingAtlasFromDirectories(
      inputRoot,
      outputPath,
      io,
      { generatedAt, memoryReport },
    );

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.writeFile(outputPath, serializeMispricingAtlas(atlas));

    io.writeStdout(
      formatStdoutOutput(
        JSON.stringify({
          inputRoot,
          outputPath,
          totalObservations: atlas.sampleCounts.totalObservations,
          marketCount: atlas.sampleCounts.marketCount,
          warningCount: atlas.warnings.length,
          nonEmptyBuckets: atlas.coverageDiagnostics?.nonEmptyBuckets ?? 0,
          largestBucketObservations:
            atlas.coverageDiagnostics?.largestBucketObservations ?? 0,
          memoryDiagnostics: atlas.memoryDiagnostics ?? null,
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
  const exitCode = runMispricingAtlasCommand(process.argv.slice(2), {
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
  formatStdoutOutput,
  parseInputDirFromArgv,
  parseMemoryReportFlag,
  parseOutputPathFromArgv,
  MispricingAtlasCommandError,
} from "./buildMispricingAtlasTypes";
